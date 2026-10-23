import { randomUUID } from "node:crypto";
import type Stripe from "stripe";
import { prisma } from "@stagedesk/db";
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

/** Stripe Checkout for a plan. A trial that's still running carries over. */
export async function subscriptionCheckout(
  stripe: Stripe,
  input: { organizationId: string; planId: string; interval: "month" | "year"; email: string; locale: "nl" | "en"; successUrl: string; cancelUrl: string },
) {
  const plan = await prisma.plan.findUniqueOrThrow({ where: { id: input.planId } });
  const price = input.interval === "year" ? plan.stripeYearlyPriceId : plan.stripeMonthlyPriceId;
  if (!price) throw new PaymentsError("plan_not_synced");

  const customer = await ensureCustomer(stripe, input.organizationId, input.email);
  const current = await prisma.subscription.findUnique({ where: { organizationId: input.organizationId } });
  const trialEnd = current?.status === "trialing" && current.trialEndsAt && current.trialEndsAt.getTime() > Date.now() + 48 * 3600_000
    ? Math.floor(current.trialEndsAt.getTime() / 1000)
    : undefined;

  // A referred agency gets its partner's discount automatically; others may type a code.
  const promotionCode = await referralPromotionCode(input.organizationId);
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer,
    line_items: [{ price, quantity: 1 }],
    locale: input.locale,
    ...(promotionCode ? { discounts: [{ promotion_code: promotionCode }] } : { allow_promotion_codes: true }),
    subscription_data: { metadata: { organizationId: input.organizationId, planId: plan.id }, ...(trialEnd ? { trial_end: trialEnd } : {}) },
    metadata: { organizationId: input.organizationId, planId: plan.id },
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
  });
  return session.url!;
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
  };
  return prisma.subscription.upsert({
    where: { organizationId },
    create: { id: randomUUID(), organizationId, ...data },
    update: data,
  });
}
