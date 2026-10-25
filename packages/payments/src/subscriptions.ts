import { randomUUID } from "node:crypto";
import type Stripe from "stripe";
import { markTrialUsed, planTrialDays, prisma, trialEligible } from "@stagedesk/db";
import { referralPromotionCode } from "./affiliates";

export class PaymentsError extends Error {
  constructor(readonly code: "plan_not_synced" | "no_customer" | "agency_not_connected" | "nothing_due" | "not_found" | "invalid_amount") {
    super(`Payments: ${code}`);
    this.name = "PaymentsError";
  }
}

/** The agency's Stripe customer, created on first use. */
export async function ensureCustomer(stripe: Stripe, organizationId: string, email: string) {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true, stripeCustomerId: true } });
  if (org.stripeCustomerId) return org.stripeCustomerId;
  const customer = await stripe.customers.create(
    { name: org.name, email, metadata: { organizationId } },
    { idempotencyKey: `customer-${organizationId}` },
  );
  await prisma.organization.update({ where: { id: organizationId }, data: { stripeCustomerId: customer.id } });
  return customer.id;
}

/**
 * Stripe Checkout for a plan. A trial the admin granted that's still running
 * carries over; otherwise a plan with a trial gives its free days, once per agency.
 */
export async function subscriptionCheckout(
  stripe: Stripe,
  input: { organizationId: string; planId: string; interval: "month" | "year"; email: string; locale: "nl" | "en"; successUrl: string; cancelUrl: string },
) {
  // Never a second subscription: a running one is switched instead (changeSubscriptionPlan).
  if (await liveStripeSubscription(input.organizationId)) return changeSubscriptionPlan(stripe, input).then(() => input.successUrl);
  const plan = await prisma.plan.findUniqueOrThrow({ where: { id: input.planId } });
  const price = input.interval === "year" ? plan.stripeYearlyPriceId : plan.stripeMonthlyPriceId;
  if (!price) throw new PaymentsError("plan_not_synced");

  const customer = await ensureCustomer(stripe, input.organizationId, input.email);
  const current = await prisma.subscription.findUnique({ where: { organizationId: input.organizationId } });
  const trialEnd = current?.status === "trialing" && current.trialEndsAt && current.trialEndsAt.getTime() > Date.now() + 48 * 3600_000
    ? Math.floor(current.trialEndsAt.getTime() / 1000)
    : undefined;
  const trialDays = trialEnd ? 0 : planTrialDays(plan, await trialEligible(input.organizationId));
  const trial = trialEnd ? { trial_end: trialEnd } : trialDays > 0 ? { trial_period_days: trialDays } : {};

  // A referred agency gets its partner's discount automatically; others may type a code.
  const promotionCode = await referralPromotionCode(input.organizationId);
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer,
    line_items: [{ price, quantity: 1 }],
    locale: input.locale,
    ...(promotionCode ? { discounts: [{ promotion_code: promotionCode }] } : { allow_promotion_codes: true }),
    subscription_data: { metadata: { organizationId: input.organizationId, planId: plan.id }, ...trial },
    metadata: { organizationId: input.organizationId, planId: plan.id },
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
  });
  return session.url!;
}

/** A Stripe subscription that is still running; switching plans changes it instead of starting another. */
export async function liveStripeSubscription(organizationId: string) {
  const sub = await prisma.subscription.findUnique({ where: { organizationId } });
  return sub?.stripeSubscriptionId && ["active", "trialing", "past_due", "unpaid"].includes(sub.status) ? sub : null;
}

/**
 * Moves a running Stripe subscription to another plan or interval. Stripe
 * prorates the difference on the next invoice; a running trial continues.
 */
export async function changeSubscriptionPlan(stripe: Stripe, input: { organizationId: string; planId: string; interval: "month" | "year" }) {
  const current = await liveStripeSubscription(input.organizationId);
  if (!current?.stripeSubscriptionId) throw new PaymentsError("not_found");
  const plan = await prisma.plan.findUniqueOrThrow({ where: { id: input.planId } });
  const price = input.interval === "year" ? plan.stripeYearlyPriceId : plan.stripeMonthlyPriceId;
  if (!price) throw new PaymentsError("plan_not_synced");
  const live = await stripe.subscriptions.retrieve(current.stripeSubscriptionId);
  const item = live.items.data[0];
  if (!item) throw new PaymentsError("not_found");
  const updated = await stripe.subscriptions.update(live.id, {
    items: [{ id: item.id, price }],
    proration_behavior: "create_prorations",
    cancel_at_period_end: false,
    metadata: { ...live.metadata, organizationId: input.organizationId, planId: plan.id },
  });
  // The webhook says the same a moment later; showing it now avoids a stale page.
  return applyStripeSubscription(updated);
}

/**
 * Cancels at the end of the paid period (or trial): full access until then,
 * no further charges. `resume` undoes it while the period is still running.
 */
export async function setCancelAtPeriodEnd(stripe: Stripe, organizationId: string, cancel: boolean) {
  const current = await liveStripeSubscription(organizationId);
  if (!current?.stripeSubscriptionId) throw new PaymentsError("not_found");
  const updated = await stripe.subscriptions.update(current.stripeSubscriptionId, { cancel_at_period_end: cancel });
  return applyStripeSubscription(updated);
}

/** Stripe's customer portal: card changes, invoices, cancellation. */
export async function billingPortal(stripe: Stripe, organizationId: string, returnUrl: string) {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { stripeCustomerId: true } });
  if (!org.stripeCustomerId) throw new PaymentsError("no_customer");
  const session = await stripe.billingPortal.sessions.create({ customer: org.stripeCustomerId, return_url: returnUrl });
  return session.url;
}

const knownStatuses = new Set(["trialing", "active", "past_due", "unpaid", "canceled", "incomplete"]);

/** Mirrors a Stripe subscription onto the agency's subscription row. */
export async function applyStripeSubscription(sub: Stripe.Subscription, now = new Date()) {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const organizationId =
    sub.metadata["organizationId"] ??
    (await prisma.organization.findUnique({ where: { stripeCustomerId: customerId }, select: { id: true } }))?.id;
  if (!organizationId) return null;

  const item = sub.items.data[0];
  const priceId = item?.price.id;
  const plan = priceId
    ? await prisma.plan.findFirst({ where: { OR: [{ stripeMonthlyPriceId: priceId }, { stripeYearlyPriceId: priceId }] } })
    : null;
  const existing = await prisma.subscription.findUnique({ where: { organizationId } });
  const planId = plan?.id ?? sub.metadata["planId"] ?? existing?.planId;
  if (!planId) return null;

  const status = knownStatuses.has(sub.status) ? sub.status : "incomplete";
  const failing = status === "past_due" || status === "unpaid";
  const data = {
    planId,
    status,
    interval: item?.price.recurring?.interval === "year" ? "year" : "month",
    stripeSubscriptionId: sub.id,
    trialEndsAt: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
    currentPeriodEnd: item?.current_period_end ? new Date(item.current_period_end * 1000) : null,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    pastDueSince: failing ? (existing?.pastDueSince ?? now) : null,
    // A paid Stripe subscription replaces a plan the admin granted by hand.
    complimentary: false,
  };
  // A Stripe trial counts as the agency's one trial.
  if (sub.trial_end) await markTrialUsed(organizationId, now);
  return prisma.subscription.upsert({
    where: { organizationId },
    create: { id: randomUUID(), organizationId, ...data },
    update: data,
  });
}
