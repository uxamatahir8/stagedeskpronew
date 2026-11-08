import { randomUUID } from "node:crypto";
import type Stripe from "stripe";
import { getSetting, markTrialUsed, planTrialDays, Prisma, prisma, trialEligible } from "@stagedesk/db";
import { referralPromotionCode } from "./affiliates";
import { isMissingStripePrice, syncPlanToStripe } from "./plans";

export class PaymentsError extends Error {
  constructor(readonly code: "plan_not_synced" | "no_customer" | "agency_not_connected" | "nothing_due" | "not_found" | "invalid_amount" | "operation_in_progress" | "refund_refused") {
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
  try {
    return await subscriptionCheckoutOnce(stripe, input);
  } catch (error) {
    if (!isMissingStripePrice(error)) throw error;
    await syncPlanToStripe(stripe, input.planId);
    return subscriptionCheckoutOnce(stripe, input);
  }
}

async function subscriptionCheckoutOnce(
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
  // Plans are priced excluding VAT. Stripe Tax adds the right amount for where the customer is, and
  // a valid EU VAT number gets reverse charge. If Stripe Tax isn't set up, Stripe refuses the session:
  // better no sale than one that silently charges no VAT.
  const { subscriptionTax } = await getSetting("billing.defaults");
  if (subscriptionTax === "automatic") await markPriceExclusive(stripe, price);
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer,
    line_items: [{ price, quantity: 1 }],
    locale: input.locale,
    ...(subscriptionTax === "automatic"
      ? {
          automatic_tax: { enabled: true },
          tax_id_collection: { enabled: true },
          billing_address_collection: "required" as const,
          customer_update: { address: "auto" as const, name: "auto" as const },
        }
      : {}),
    ...(promotionCode ? { discounts: [{ promotion_code: promotionCode }] } : { allow_promotion_codes: true }),
    subscription_data: { metadata: { organizationId: input.organizationId, planId: plan.id }, ...trial },
    metadata: { organizationId: input.organizationId, planId: plan.id },
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
  });
  return session.url!;
}

/** Prices made before VAT was handled say nothing about tax; Stripe Tax needs to know the amount excludes it. */
async function markPriceExclusive(stripe: Stripe, priceId: string) {
  try {
    const current = await stripe.prices.retrieve(priceId);
    if (current.tax_behavior === "unspecified" || current.tax_behavior === null || current.tax_behavior === undefined) {
      await stripe.prices.update(priceId, { tax_behavior: "exclusive" });
    }
  } catch (error) {
    // A price from another Stripe account: creating the session reports it, and subscriptionCheckout recovers from that.
    if (!isMissingStripePrice(error)) throw error;
  }
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
  try {
    return await changeSubscriptionPlanOnce(stripe, input);
  } catch (error) {
    if (!isMissingStripePrice(error)) throw error;
    await syncPlanToStripe(stripe, input.planId);
    return changeSubscriptionPlanOnce(stripe, input);
  }
}

async function changeSubscriptionPlanOnce(stripe: Stripe, input: { organizationId: string; planId: string; interval: "month" | "year" }) {
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
export async function applyStripeSubscription(sub: Stripe.Subscription, now = new Date(), opts: { authoritative?: boolean } = {}) {
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
  // One writer per agency at a time: the agency row is locked, then the record read and written
  // (READ COMMITTED, so the read sees what a writer before us committed). Two first-time writes
  // used to both try to create the row.
  if (sub.trial_end) await markTrialUsed(organizationId, now);
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${organizationId} FOR UPDATE`;
      return writeSubscription(tx, organizationId, sub, plan?.id ?? null, now, opts);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
  );
}

async function writeSubscription(
  tx: Prisma.TransactionClient,
  organizationId: string,
  sub: Stripe.Subscription,
  matchedPlanId: string | null,
  now: Date,
  opts: { authoritative?: boolean },
) {
  const item = sub.items.data[0];
  const existing = await tx.subscription.findUnique({ where: { organizationId } });
  // Only syncAgencySubscriptions (which has looked at all of the customer's subscriptions)
  // may move the agency to another subscription than the one it has while that one is live.
  // Any other caller acting on a different subscription leaves the record alone.
  if (!opts.authoritative && existing?.stripeSubscriptionId && existing.stripeSubscriptionId !== sub.id && isLive(existing.status)) return existing;
  const planId = matchedPlanId ?? sub.metadata["planId"] ?? existing?.planId;
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
  return tx.subscription.upsert({
    where: { organizationId },
    create: { id: randomUUID(), organizationId, ...data },
    update: data,
  });
}

const LIVE_STATUSES = ["active", "trialing", "past_due", "unpaid"];
const isLive = (status: string | null | undefined) => LIVE_STATUSES.includes(status ?? "");

type SubLike = Pick<Stripe.Subscription, "id" | "status" | "created">;

/**
 * Which of a customer's subscriptions the agency runs on, decided from all of
 * them at once, so the answer doesn't depend on the order events arrive in:
 * the earliest-created live one (ties: smaller id); with none live, the most
 * recent one. Every other live one is a duplicate (it bills the customer too).
 */
export function authoritativeSubscription<T extends SubLike>(subs: readonly T[]): { chosen: T | null; duplicates: T[] } {
  const live = subs.filter((s) => isLive(s.status)).sort((a, b) => a.created - b.created || a.id.localeCompare(b.id));
  if (live.length > 0) return { chosen: live[0]!, duplicates: live.slice(1) };
  const latest = [...subs].sort((a, b) => b.created - a.created || b.id.localeCompare(a.id))[0] ?? null;
  return { chosen: latest, duplicates: [] };
}

/**
 * Brings an agency's subscription record in line with Stripe: reads all of the
 * customer's subscriptions, applies the authoritative one (see above), and
 * opens a billing incident when more than one is live (resolved again once
 * only one is). Never cancels anything in Stripe: which one to keep (and any
 * refund) is the operator's decision. Webhooks, the checkout return and the
 * admin's "Reconcile" all go through here.
 */
export async function syncAgencySubscriptions(stripe: Stripe, customerId: string, now = new Date()) {
  const org = await prisma.organization.findUnique({ where: { stripeCustomerId: customerId }, select: { id: true } });
  const subs: Stripe.Subscription[] = [];
  for await (const sub of stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 })) subs.push(sub);
  const organizationId = org?.id ?? subs.find((s) => s.metadata?.["organizationId"])?.metadata["organizationId"];
  if (!organizationId) return null;
  const mine = subs.filter((s) => !s.metadata?.["organizationId"] || s.metadata["organizationId"] === organizationId);
  const { chosen, duplicates } = authoritativeSubscription(mine);
  const record = chosen ? await applyStripeSubscription(chosen, now, { authoritative: true }) : null;
  await recordDuplicateSubscriptions(organizationId, customerId, chosen?.id ?? null, duplicates.map((d) => d.id), now);
  return { record, chosen: chosen?.id ?? null, duplicates: duplicates.map((d) => d.id) };
}

/** Opens (or updates) the agency's duplicate-subscription incident, or resolves it when there are no duplicates. */
async function recordDuplicateSubscriptions(agencyId: string, customerId: string, authoritative: string | null, duplicates: string[], now: Date) {
  const openKey = `${agencyId}:duplicate_subscription`;
  if (duplicates.length === 0) {
    await prisma.billingIncident.updateMany({ where: { openKey }, data: { status: "resolved", openKey: null, resolvedAt: now, note: "Only one live subscription left in Stripe." } });
    return;
  }
  const data = { authoritative, duplicates, customerId };
  const updated = await prisma.billingIncident.updateMany({ where: { openKey }, data: { data } });
  if (updated.count > 0) return;
  try {
    await prisma.billingIncident.create({ data: { id: randomUUID(), agencyId, kind: "duplicate_subscription", status: "open", openKey, data } });
    console.error(`[billing] agency ${agencyId} has ${duplicates.length + 1} live Stripe subscriptions; incident opened (keeping ${authoritative})`);
  } catch (error) {
    // Opened by a simultaneous sync: update that one instead.
    if ((error as { code?: string }).code !== "P2002") throw error;
    await prisma.billingIncident.updateMany({ where: { openKey }, data: { data } });
  }
}

/** Operator: marks an incident handled (e.g. after cancelling the duplicate in Stripe and refunding). A later sync reopens it if duplicates remain. */
export async function resolveBillingIncident(id: string, actorId: string, note: string | null, now = new Date()) {
  const done = await prisma.billingIncident.updateMany({ where: { id, status: "open" }, data: { status: "resolved", openKey: null, resolvedAt: now, resolvedById: actorId, note: note?.slice(0, 2000) || null } });
  return done.count === 1;
}
