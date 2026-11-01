import { randomUUID } from "node:crypto";
import type Stripe from "stripe";
import { commissionFor, commissionWindowOpen } from "@stagedesk/core";
import {
  approveWithdrawal,
  claimStripeWithdrawal,
  completeStripeWithdrawal,
  getSetting,
  overrideReferralWithPromo,
  prisma,
  releaseStripeWithdrawal,
  requestWithdrawal,
  stuckWithdrawals,
  WithdrawalError,
} from "@stagedesk/db";
import { isDefinitiveStripeError } from "./operations";

const id = (value: string | { id: string } | null | undefined) => (typeof value === "string" ? value : (value?.id ?? null));

/**
 * Makes the partner's Stripe promotion code match the partner: active while
 * approved (and the program gives a discount), inactive otherwise. A code
 * that no longer matches the partner's promoCode is deactivated and a new one
 * created. Safe to run any time; the daily reconcile job runs it for all.
 */
export async function syncAffiliatePromo(stripe: Stripe, affiliateId: string) {
  const program = await getSetting("affiliates.program");
  const affiliate = await prisma.affiliate.findUniqueOrThrow({ where: { id: affiliateId } });
  const wanted = affiliate.status === "approved" && program.promoDiscountBps > 0;

  if (affiliate.stripePromotionCodeId) {
    const current = await stripe.promotionCodes.retrieve(affiliate.stripePromotionCodeId);
    if (current.code.toUpperCase() === affiliate.promoCode.toUpperCase()) {
      if (current.active !== wanted) await stripe.promotionCodes.update(current.id, { active: wanted });
      return wanted ? current.id : null;
    }
    // The code was changed here: the old one must stop working before the new one exists.
    if (current.active) await stripe.promotionCodes.update(current.id, { active: false });
    await prisma.affiliate.update({ where: { id: affiliateId }, data: { stripePromotionCodeId: null } });
  }
  if (!wanted) return null;

  const couponId = `affiliate-${program.promoDiscountBps}-${program.promoDiscountMonths}`;
  try {
    await stripe.coupons.retrieve(couponId);
  } catch {
    await stripe.coupons.create(
      {
        id: couponId,
        name: `Partner ${program.promoDiscountBps / 100}%`,
        percent_off: program.promoDiscountBps / 100,
        ...(program.promoDiscountMonths > 0 ? { duration: "repeating", duration_in_months: program.promoDiscountMonths } : { duration: "once" }),
      },
      { idempotencyKey: `coupon-${couponId}` },
    );
  }
  const promo = await stripe.promotionCodes.create(
    { promotion: { type: "coupon", coupon: couponId }, code: affiliate.promoCode, metadata: { affiliateId } },
    { idempotencyKey: `promo-${affiliateId}-${affiliate.promoCode}` },
  );
  await prisma.affiliate.update({ where: { id: affiliateId }, data: { stripePromotionCodeId: promo.id } });
  return promo.id;
}

/** Stops a promotion code from working (before its partner is deleted). */
export async function retireAffiliatePromo(stripe: Stripe, promotionCodeId: string) {
  const promo = await stripe.promotionCodes.retrieve(promotionCodeId);
  if (promo.active) await stripe.promotionCodes.update(promotionCodeId, { active: false });
}

/**
 * Daily: every partner's code made to match (see syncAffiliatePromo), and
 * active partner codes in Stripe whose partner no longer exists switched off.
 */
export async function reconcileAffiliatePromos(stripe: Stripe) {
  let checked = 0;
  let failed = 0;
  const affiliates = await prisma.affiliate.findMany({ where: { OR: [{ stripePromotionCodeId: { not: null } }, { status: "approved" }] }, select: { id: true } });
  for (const a of affiliates) {
    try {
      await syncAffiliatePromo(stripe, a.id);
      checked++;
    } catch (error) {
      failed++;
      console.error("[affiliates] promo reconcile failed", a.id, error);
    }
  }
  let orphans = 0;
  for await (const promo of stripe.promotionCodes.list({ active: true, limit: 100 })) {
    const affiliateId = promo.metadata?.["affiliateId"];
    if (!affiliateId) continue;
    const owner = await prisma.affiliate.findUnique({ where: { id: affiliateId }, select: { stripePromotionCodeId: true } });
    if (owner?.stripePromotionCodeId === promo.id) continue;
    await stripe.promotionCodes.update(promo.id, { active: false });
    orphans++;
  }
  return { checked, failed, orphans };
}

/** The promotion code a referred agency gets automatically at Checkout. */
export async function referralPromotionCode(agencyId: string) {
  const referral = await prisma.referral.findUnique({ where: { agencyId }, include: { affiliate: { select: { stripePromotionCodeId: true, status: true } } } });
  return referral?.status === "active" && referral.affiliate?.status === "approved" ? (referral.affiliate.stripePromotionCodeId ?? null) : null;
}

/** Stripe Express onboarding so the affiliate can receive payouts. */
export async function affiliateOnboardingLink(stripe: Stripe, input: { affiliateId: string; email: string; returnUrl: string; refreshUrl: string }) {
  const affiliate = await prisma.affiliate.findUniqueOrThrow({ where: { id: input.affiliateId } });
  let accountId = affiliate.stripeAccountId;
  if (!accountId) {
    const account = await stripe.accounts.create(
      { type: "express", country: "NL", email: input.email, capabilities: { transfers: { requested: true } }, metadata: { affiliateId: affiliate.id } },
      { idempotencyKey: `connect-affiliate-${affiliate.id}` },
    );
    accountId = account.id;
    await prisma.affiliate.update({ where: { id: affiliate.id }, data: { stripeAccountId: accountId } });
  }
  const link = await stripe.accountLinks.create({ account: accountId, type: "account_onboarding", return_url: input.returnUrl, refresh_url: input.refreshUrl });
  return link.url;
}

/** If the agency used an affiliate's promo code at Checkout, that affiliate gets the referral. */
export async function attributeSubscriptionPromo(stripe: Stripe, sub: Stripe.Subscription) {
  const agencyId = sub.metadata["organizationId"];
  if (!agencyId || sub.discounts.length === 0) return null;
  const full = sub.discounts.some((d) => typeof d === "string") ? await stripe.subscriptions.retrieve(sub.id, { expand: ["discounts"] }) : sub;
  for (const discount of full.discounts) {
    const promoId = typeof discount === "string" ? null : id(discount.promotion_code);
    if (!promoId) continue;
    const affiliate = await prisma.affiliate.findFirst({ where: { stripePromotionCodeId: promoId }, select: { id: true } });
    if (affiliate) return overrideReferralWithPromo(agencyId, affiliate.id);
  }
  return null;
}

/**
 * Called for every paid subscription invoice. Affiliate referrals earn a
 * commission on the amount paid excluding VAT; agency referrals give both
 * agencies their free month(s) on the first paid invoice.
 */
export async function recordInvoiceCommission(stripe: Stripe, invoice: Stripe.Invoice, now = new Date()) {
  const customerId = id(invoice.customer);
  if (!customerId || !invoice.id || invoice.amount_paid <= 0) return null;
  const agency = await prisma.organization.findUnique({ where: { stripeCustomerId: customerId }, select: { id: true } });
  if (!agency) return null;
  const referral = await prisma.referral.findUnique({ where: { agencyId: agency.id } });
  if (referral?.status !== "active") return null;

  const paidAt = invoice.status_transitions.paid_at ? new Date(invoice.status_transitions.paid_at * 1000) : now;
  const firstPaidAt = referral.firstPaidAt ?? paidAt;
  if (!referral.firstPaidAt) await prisma.referral.update({ where: { id: referral.id }, data: { firstPaidAt } });

  if (referral.type === "agency") {
    await giveFreeMonths(stripe, referral.id);
    return null;
  }
  if (!referral.affiliateId || !commissionWindowOpen(firstPaidAt, paidAt, referral.commissionMonths)) return null;

  const program = await getSetting("affiliates.program");
  const base = Math.min(invoice.total_excluding_tax ?? invoice.amount_paid, invoice.amount_paid);
  const amount = commissionFor(base, referral.commissionBps);
  if (amount <= 0) return null;

  let paymentIntentId: string | null = null;
  try {
    const full = await stripe.invoices.retrieve(invoice.id, { expand: ["payments"] });
    paymentIntentId = id(full.payments?.data.find((p) => p.payment.type === "payment_intent")?.payment.payment_intent);
  } catch {
    // Without the payment intent a refund can't be matched; the admin can still cancel by hand.
  }

  try {
    return await prisma.commission.create({
      data: {
        id: randomUUID(),
        affiliateId: referral.affiliateId,
        referralId: referral.id,
        agencyId: agency.id,
        stripeInvoiceId: invoice.id,
        stripePaymentIntentId: paymentIntentId,
        baseCents: base,
        commissionBps: referral.commissionBps,
        amountCents: amount,
        availableAt: new Date(paidAt.getTime() + program.approvalDays * 86_400_000),
        createdAt: paidAt,
      },
    });
  } catch (error) {
    // Same invoice delivered twice: the first one counts.
    if ((error as { code?: string }).code === "P2002") return null;
    throw error;
  }
}

/** Give a month, get a month: a credit on both agencies' next Stripe invoice. */
async function giveFreeMonths(stripe: Stripe, referralId: string) {
  const program = await getSetting("affiliates.program");
  const referral = await prisma.referral.findUniqueOrThrow({ where: { id: referralId } });
  if (referral.rewardedAt || program.agencyReferralFreeMonths === 0 || !referral.referringAgencyId) return null;

  const credited: string[] = [];
  for (const agencyId of [referral.agencyId, referral.referringAgencyId]) {
    const org = await prisma.organization.findUnique({
      where: { id: agencyId },
      select: { stripeCustomerId: true, subscription: { select: { interval: true, plan: { select: { monthlyPriceCents: true, yearlyPriceCents: true } } } } },
    });
    const plan = org?.subscription?.plan;
    if (!org?.stripeCustomerId || !plan) continue;
    const monthly = org.subscription!.interval === "year" ? Math.round(plan.yearlyPriceCents / 12) : plan.monthlyPriceCents;
    const amount = monthly * program.agencyReferralFreeMonths;
    if (amount <= 0) continue;
    await stripe.customers.createBalanceTransaction(
      org.stripeCustomerId,
      { amount: -amount, currency: "eur", description: "StageDesk referral reward", metadata: { referralId } },
      { idempotencyKey: `referral-credit-${referralId}-${agencyId}` },
    );
    credited.push(agencyId);
  }
  await prisma.referral.update({ where: { id: referralId }, data: { rewardedAt: new Date() } });
  return { credited };
}

/**
 * A refund or dispute on a subscription payment takes the commission back
 * while it's not yet paid out: fully for a dispute or full refund, otherwise
 * in proportion to what was refunded.
 */
export async function adjustCommissionsForCharge(charge: { payment_intent: string | { id: string } | null; amount: number; amount_refunded: number }, reason: "refund" | "dispute") {
  const paymentIntentId = id(charge.payment_intent);
  if (!paymentIntentId) return 0;
  const commissions = await prisma.commission.findMany({ where: { stripePaymentIntentId: paymentIntentId, status: { in: ["pending", "review", "approved"] } } });
  for (const c of commissions) {
    const kept = reason === "dispute" ? 0 : Math.max(0, charge.amount - charge.amount_refunded) / Math.max(1, charge.amount);
    const amount = commissionFor(Math.round(c.baseCents * kept), c.commissionBps);
    await prisma.commission.update({
      where: { id: c.id },
      data: amount > 0 ? { amountCents: amount } : { status: "cancelled", cancelReason: reason, amountCents: 0 },
    });
  }
  return commissions.length;
}

/**
 * Pays a withdrawal by Stripe transfer to the affiliate's connected account.
 *
 * Claimed first with a token and lease (claimStripeWithdrawal), so two
 * clicks, the monthly run and the recovery worker never pay it twice at once.
 * Any attempt after the first looks for an earlier transfer tagged with the
 * withdrawal before sending (Stripe forgets idempotency keys after 24 hours).
 * Paid is booked only by the claim's owner, and notifications can't undo it.
 * A refusal marks it failed (retryable); an unknown outcome leaves it
 * "processing" for the worker (recoverStripeWithdrawals) to settle.
 */
export async function payWithdrawalByStripe(stripe: Stripe, payoutId: string, actorId: string | null, now = new Date()) {
  const current = await prisma.affiliatePayout.findUnique({ where: { id: payoutId }, include: { affiliate: true } });
  if (!current) throw new WithdrawalError("not_found");
  if (current.method !== "stripe") throw new WithdrawalError("wrong_status");
  const destination = current.affiliate.stripeAccountId;
  if (!destination || !current.affiliate.payoutsEnabled) throw new WithdrawalError("details_missing");
  const { payout, token, retry } = await claimStripeWithdrawal(payoutId, now);

  let transferId: string | null = null;
  try {
    const earlier = retry ? await findWithdrawalTransfer(stripe, destination, payoutId, payout.createdAt) : null;
    transferId =
      earlier ??
      (
        await stripe.transfers.create(
          {
            amount: payout.amountCents,
            currency: "eur",
            destination,
            description: `StageDesk partner commission ${payout.reference ?? ""}`.trim(),
            metadata: { affiliateId: payout.affiliateId, payoutId },
          },
          { idempotencyKey: `affiliate-withdrawal-${payoutId}` },
        )
      ).id;
  } catch (error) {
    // Refused by Stripe: nothing was sent. Anything else: we can't know, so it stays processing.
    await releaseStripeWithdrawal(payoutId, token, String(error), actorId, { failed: isDefinitiveStripeError(error) });
    throw error;
  }
  try {
    if (!(await completeStripeWithdrawal(payoutId, token, transferId, actorId))) {
      // Our lease was taken over; the new owner finds this transfer and books it.
      const now2 = await prisma.affiliatePayout.findUnique({ where: { id: payoutId }, select: { status: true, stripeTransferId: true } });
      if (now2?.status !== "paid") throw new WithdrawalError("in_progress");
    }
  } catch (error) {
    // The money went out but booking it failed: keep it processing; the worker books it from Stripe.
    if (!(error instanceof WithdrawalError)) await releaseStripeWithdrawal(payoutId, token, `transfer ${transferId} made, booking failed: ${String(error)}`, actorId, { failed: false }).catch(() => undefined);
    throw error;
  }
  return transferId;
}

/** A transfer made for this withdrawal by any earlier attempt (all pages since it was requested). */
async function findWithdrawalTransfer(stripe: Stripe, destination: string, payoutId: string, since: Date) {
  for await (const t of stripe.transfers.list({ destination, created: { gte: Math.floor(since.getTime() / 1000) - 60 }, limit: 100 })) {
    if (t.metadata?.["payoutId"] === payoutId) return t.id;
  }
  return null;
}

/** Worker: finishes Stripe withdrawals whose process stopped or whose outcome was unknown. */
export async function recoverStripeWithdrawals(stripe: Stripe, now = new Date()) {
  let paid = 0;
  let failed = 0;
  for (const { id } of await stuckWithdrawals(now)) {
    try {
      await payWithdrawalByStripe(stripe, id, null, now);
      paid++;
    } catch (error) {
      failed++;
      console.error("[affiliates] withdrawal recovery failed", id, error);
    }
  }
  return { paid, failed };
}

/**
 * Automatic mode: on the payout day, every affiliate with enough approved
 * commission and a connected Stripe account gets a withdrawal that is
 * approved and paid straight away, with the same tracking as a request.
 */
export async function runAffiliatePayouts(stripe: Stripe, now = new Date()) {
  const program = await getSetting("affiliates.program");
  if (program.payoutMode !== "automatic" || now.getUTCDate() !== program.payoutDayOfMonth) return [];
  const affiliates = await prisma.affiliate.findMany({
    where: { status: "approved", payoutsEnabled: true, stripeAccountId: { not: null }, commissions: { some: { status: "approved", payoutId: null } } },
    select: { id: true, userId: true, payoutMethod: true },
  });
  const results = [];
  for (const a of affiliates) {
    if (a.payoutMethod && a.payoutMethod !== "stripe") continue;
    try {
      const payout = await requestWithdrawal(a.id, a.userId);
      await approveWithdrawal(payout.id, "system", "automatic");
      await payWithdrawalByStripe(stripe, payout.id, null);
      results.push({ affiliateId: a.id, payoutId: payout.id, amountCents: payout.amountCents });
    } catch (error) {
      if (error instanceof WithdrawalError && ["below_minimum", "nothing_available", "open_request"].includes(error.code)) continue;
      console.error(`[affiliates] payout for ${a.id} failed`, error);
    }
  }
  return results;
}
