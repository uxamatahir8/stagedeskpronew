import { randomUUID } from "node:crypto";
import { normalizeDiscountCode, type PromoDiscount, promoDiscountOf, type PromoDuration, promoDurations, type PromoProblem, promoProblem } from "@stagedesk/core";
import { prisma } from "./client";
import type { Prisma } from "./generated/prisma/client";
import { tenantDb } from "./tenant";

/**
 * Promo codes. Agency codes (BookingPromoCode) give a customer a discount on
 * a booking and live in tenantDb; platform codes (PlatformPromoCode) give an
 * agency a discount on a plan through Stripe (packages/payments/src/promo-codes.ts).
 */

export class PromoCodeError extends Error {
  constructor(readonly code: PromoProblem | "unknown" | "invalid" | "code_taken" | "in_use" | "not_found") {
    super(`Promo code: ${code}`);
    this.name = "PromoCodeError";
  }
}

export interface DiscountInput {
  discountType: "percentage" | "fixed";
  percentBps: number | null;
  amountCents: number | null;
}

/** Checks the discount and returns the columns to store (only the amount of its own kind). */
function discountColumns(input: DiscountInput): { discountType: string; percentBps: number | null; amountCents: number | null; discount: PromoDiscount } {
  const discount = promoDiscountOf({ discountType: input.discountType, percentBps: input.percentBps, amountCents: input.amountCents });
  if (!discount || (discount.type === "fixed" && discount.cents > 10_000_000)) throw new PromoCodeError("invalid");
  return discount.type === "percentage"
    ? { discountType: "percentage", percentBps: discount.bps, amountCents: null, discount }
    : { discountType: "fixed", percentBps: null, amountCents: discount.cents, discount };
}

const positiveOrNull = (n: number | null) => {
  if (n === null) return null;
  if (!Number.isSafeInteger(n) || n < 1) throw new PromoCodeError("invalid");
  return n;
};

// ─── Agency codes for bookings ───────────────────────────────────────────────

export interface BookingPromoInput extends DiscountInput {
  code: string;
  description: string | null;
  minTotalCents: number | null;
  validFrom: Date | null;
  validUntil: Date | null;
  maxRedemptions: number | null;
  active: boolean;
}

export async function listBookingPromoCodes(organizationId: string) {
  return tenantDb(organizationId).bookingPromoCode.findMany({ orderBy: [{ active: "desc" }, { createdAt: "desc" }], include: { _count: { select: { redemptions: true } } } });
}

/** Creates (id null) or changes an agency's code. A changed discount applies to quotes made from now on. */
export async function saveBookingPromoCode(organizationId: string, id: string | null, input: BookingPromoInput) {
  const code = normalizeDiscountCode(input.code);
  if (!code) throw new PromoCodeError("invalid");
  const { discount: _discount, ...columns } = discountColumns(input);
  if (input.validFrom && input.validUntil && input.validFrom > input.validUntil) throw new PromoCodeError("invalid");
  const data = {
    code,
    description: input.description?.trim().slice(0, 191) || null,
    ...columns,
    minTotalCents: positiveOrNull(input.minTotalCents),
    validFrom: input.validFrom,
    validUntil: input.validUntil,
    maxRedemptions: positiveOrNull(input.maxRedemptions),
    active: input.active,
  };
  const db = tenantDb(organizationId);
  const clash = await db.bookingPromoCode.findFirst({ where: { code, ...(id ? { id: { not: id } } : {}) }, select: { id: true } });
  if (clash) throw new PromoCodeError("code_taken");
  if (id) {
    const { count } = await db.bookingPromoCode.updateMany({ where: { id }, data });
    if (count === 0) throw new PromoCodeError("not_found");
    return db.bookingPromoCode.findFirstOrThrow({ where: { id } });
  }
  return db.bookingPromoCode.create({ data: { id: randomUUID(), organizationId, ...data } });
}

/** Deletes a code nobody used; a used code is switched off instead, so bookings keep their history. */
export async function deleteBookingPromoCode(organizationId: string, id: string) {
  const db = tenantDb(organizationId);
  const code = await db.bookingPromoCode.findFirst({ where: { id }, include: { _count: { select: { redemptions: true } } } });
  if (!code) throw new PromoCodeError("not_found");
  if (code._count.redemptions > 0) throw new PromoCodeError("in_use");
  await db.bookingPromoCode.deleteMany({ where: { id } });
}

/** An agency's code by what someone typed, with why it can't be used now (or null). */
export async function findBookingPromo(organizationId: string, typed: string, now = new Date()) {
  const code = normalizeDiscountCode(typed);
  if (!code) return { promo: null, problem: "unknown" as const };
  const db = tenantDb(organizationId);
  const promo = await db.bookingPromoCode.findFirst({ where: { code } });
  if (!promo) return { promo: null, problem: "unknown" as const };
  const used = await db.bookingPromoRedemption.count({ where: { promoCodeId: promo.id } });
  return { promo, problem: promoProblem(promo, { now, used }) };
}

/**
 * Puts a code on a booking (one per booking; a new one replaces the old).
 * Run by the booking form for the customer and by staff from the quote editor.
 */
export async function attachBookingPromo(organizationId: string, bookingId: string, typed: string, addedBy: "customer" | "staff", now = new Date()) {
  const { promo, problem } = await findBookingPromo(organizationId, typed, now);
  if (!promo) throw new PromoCodeError("unknown");
  if (problem) throw new PromoCodeError(problem);
  const db = tenantDb(organizationId);
  const booking = await db.booking.findFirst({ where: { id: bookingId }, select: { id: true } });
  if (!booking) throw new PromoCodeError("not_found");
  await db.bookingPromoRedemption.deleteMany({ where: { bookingId } });
  await db.bookingPromoRedemption.create({ data: { id: randomUUID(), organizationId, promoCodeId: promo.id, bookingId, addedBy, createdAt: now } });
  return promo;
}

export async function detachBookingPromo(organizationId: string, bookingId: string) {
  await tenantDb(organizationId).bookingPromoRedemption.deleteMany({ where: { bookingId } });
}

/** The code on a booking, for the quote editor: what it takes off and the minimum it needs. */
export async function bookingPromoOf(organizationId: string, bookingId: string) {
  const row = await tenantDb(organizationId).bookingPromoRedemption.findFirst({ where: { bookingId }, include: { promoCode: true } });
  if (!row) return null;
  const discount = promoDiscountOf(row.promoCode);
  return discount ? { code: row.promoCode.code, description: row.promoCode.description, discount, minTotalCents: row.promoCode.minTotalCents, addedBy: row.addedBy } : null;
}

// ─── Platform codes for plans ────────────────────────────────────────────────

export interface PlatformPromoInput extends DiscountInput {
  code: string;
  description: string | null;
  duration: PromoDuration;
  durationMonths: number | null;
  planKeys: string[];
  firstSubscriptionOnly: boolean;
  maxRedemptions: number | null;
  expiresAt: Date | null;
}

export async function listPlatformPromoCodes() {
  return prisma.platformPromoCode.findMany({ orderBy: [{ active: "desc" }, { createdAt: "desc" }], include: { _count: { select: { redemptions: true } } } });
}

/**
 * A new platform code. Stripe coupons can't change, so a code's discount is
 * fixed once made: to change it, switch it off and make another. The code must
 * not be a partner's promo code (the two share Stripe's promotion codes).
 */
export async function createPlatformPromoCode(input: PlatformPromoInput, actorId: string | null, now = new Date()) {
  const code = normalizeDiscountCode(input.code);
  if (!code) throw new PromoCodeError("invalid");
  const { discount: _discount, ...columns } = discountColumns(input);
  if (!(promoDurations as readonly string[]).includes(input.duration)) throw new PromoCodeError("invalid");
  const months = input.duration === "repeating" ? positiveOrNull(input.durationMonths) : null;
  if (input.duration === "repeating" && (!months || months > 36)) throw new PromoCodeError("invalid");
  if (input.expiresAt && input.expiresAt <= now) throw new PromoCodeError("invalid");
  const plans = await prisma.plan.findMany({ where: { key: { in: input.planKeys } }, select: { key: true } });
  if (plans.length !== new Set(input.planKeys).size) throw new PromoCodeError("invalid");
  const [taken, partner] = await Promise.all([
    prisma.platformPromoCode.findUnique({ where: { code }, select: { id: true } }),
    prisma.affiliate.findFirst({ where: { promoCode: code }, select: { id: true } }),
  ]);
  if (taken || partner) throw new PromoCodeError("code_taken");
  return prisma.platformPromoCode.create({
    data: {
      id: randomUUID(),
      code,
      description: input.description?.trim().slice(0, 191) || null,
      ...columns,
      duration: input.duration,
      durationMonths: months,
      planKeys: [...new Set(input.planKeys)] as Prisma.InputJsonValue,
      firstSubscriptionOnly: input.firstSubscriptionOnly,
      maxRedemptions: positiveOrNull(input.maxRedemptions),
      expiresAt: input.expiresAt,
      active: true,
      createdById: actorId,
    },
  });
}

export const planKeysOf = (row: { planKeys: unknown }) => (Array.isArray(row.planKeys) ? row.planKeys.filter((k): k is string => typeof k === "string") : []);

/** A platform code by what an agency typed, checked for this plan and agency. */
export async function findPlatformPromo(typed: string, context: { organizationId: string; planId: string }, now = new Date()) {
  const code = normalizeDiscountCode(typed);
  if (!code) return { promo: null, problem: "unknown" as const };
  const promo = await prisma.platformPromoCode.findUnique({ where: { code } });
  if (!promo) return { promo: null, problem: "unknown" as const };
  const [used, plan, subscription] = await Promise.all([
    prisma.platformPromoRedemption.count({ where: { promoCodeId: promo.id } }),
    prisma.plan.findUniqueOrThrow({ where: { id: context.planId }, select: { key: true } }),
    prisma.subscription.findUnique({ where: { organizationId: context.organizationId }, select: { stripeSubscriptionId: true } }),
  ]);
  const problem = promoProblem(
    { active: promo.active, validUntil: promo.expiresAt, maxRedemptions: promo.maxRedemptions, planKeys: planKeysOf(promo), firstSubscriptionOnly: promo.firstSubscriptionOnly },
    { now, used, planKey: plan.key, hadSubscription: Boolean(subscription?.stripeSubscriptionId) },
  );
  return { promo, problem };
}

/** Counts a use once Stripe reports a subscription with the code (webhook). */
export async function recordPlatformPromoUse(stripePromotionCodeId: string, agencyId: string, stripeSubscriptionId: string) {
  const promo = await prisma.platformPromoCode.findFirst({ where: { stripePromotionCodeId }, select: { id: true } });
  const agency = await prisma.organization.findUnique({ where: { id: agencyId }, select: { id: true } });
  if (!promo || !agency) return false;
  await prisma.platformPromoRedemption.upsert({
    where: { promoCodeId_agencyId: { promoCodeId: promo.id, agencyId } },
    create: { id: randomUUID(), promoCodeId: promo.id, agencyId, stripeSubscriptionId },
    update: { stripeSubscriptionId },
  });
  return true;
}
