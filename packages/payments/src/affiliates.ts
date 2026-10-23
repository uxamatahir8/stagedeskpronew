import { randomUUID } from "node:crypto";
import type Stripe from "stripe";
import { commissionFor, commissionWindowOpen } from "@stagedesk/core";
import { getSetting, overrideReferralWithPromo, prisma } from "@stagedesk/db";

const id = (value: string | { id: string } | null | undefined) => (typeof value === "string" ? value : (value?.id ?? null));

/**
 * Creates the affiliate's promo code in Stripe so agencies can type it at
 * Checkout. All affiliates share one coupon per discount (e.g. 20% for 3 months).
 */
export async function syncAffiliatePromo(stripe: Stripe, affiliateId: string) {
  const program = await getSetting("affiliates.program");
  const affiliate = await prisma.affiliate.findUniqueOrThrow({ where: { id: affiliateId } });
  if (affiliate.stripePromotionCodeId || program.promoDiscountBps === 0 || affiliate.status !== "approved") return affiliate.stripePromotionCodeId;

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
 * Pays an affiliate their approved commissions as one Stripe transfer, if
 * they're above the minimum and can receive payouts.
 */
export async function payAffiliate(stripe: Stripe, affiliateId: string, now = new Date()) {
  const program = await getSetting("affiliates.program");
  const affiliate = await prisma.affiliate.findUniqueOrThrow({ where: { id: affiliateId } });
  if (affiliate.status !== "approved" || !affiliate.payoutsEnabled || !affiliate.stripeAccountId) return null;
  const due = await prisma.commission.findMany({ where: { affiliateId, status: "approved", payoutId: null }, orderBy: { createdAt: "asc" } });
  const total = due.reduce((sum, c) => sum + c.amountCents, 0);
  if (total <= 0 || total < program.minPayoutCents) return null;

  const payoutId = randomUUID();
  const ids = due.map((c) => c.id);
  try {
    const transfer = await stripe.transfers.create(
      { amount: total, currency: "eur", destination: affiliate.stripeAccountId, description: "StageDesk partner commission", metadata: { affiliateId, payoutId } },
      { idempotencyKey: `affiliate-payout-${affiliateId}-${ids.sort().join("").slice(0, 200)}` },
    );
    await prisma.$transaction([
      prisma.affiliatePayout.create({ data: { id: payoutId, affiliateId, amountCents: total, status: "paid", stripeTransferId: transfer.id, createdAt: now } }),
      prisma.commission.updateMany({ where: { id: { in: ids } }, data: { status: "paid", payoutId } }),
    ]);
    return { payoutId, amountCents: total, commissions: due };
  } catch (error) {
    await prisma.affiliatePayout.create({ data: { id: payoutId, affiliateId, amountCents: total, status: "failed", error: String(error).slice(0, 2000), createdAt: now } });
    throw error;
  }
}

/** Monthly payout run: only on the program's payout day. */
export async function runAffiliatePayouts(stripe: Stripe, now = new Date()) {
  const program = await getSetting("affiliates.program");
  if (now.getUTCDate() !== program.payoutDayOfMonth) return [];
  const affiliates = await prisma.affiliate.findMany({
    where: { status: "approved", payoutsEnabled: true, commissions: { some: { status: "approved", payoutId: null } } },
    select: { id: true },
  });
  const results = [];
  for (const a of affiliates) {
    try {
      const paid = await payAffiliate(stripe, a.id, now);
      if (paid) results.push({ affiliateId: a.id, payoutId: paid.payoutId, amountCents: paid.amountCents });
    } catch (error) {
      console.error(`[affiliates] payout for ${a.id} failed`, error);
    }
  }
  return results;
}
