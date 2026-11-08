import { type BasisPoints, type Cents, percentOf } from "./money";
import type { QuoteLineInput } from "./quotes";

/**
 * Promo codes: platform codes give agencies a discount on a StageDesk plan
 * (through Stripe coupons), agency codes give customers a discount on a
 * booking (as discount lines on the quote). Both share these rules.
 */

/** Letters, digits and dashes, 3–32 long, stored in capitals. */
const discountCodePattern = /^[A-Z0-9][A-Z0-9-]{1,30}[A-Z0-9]$/;

export function normalizeDiscountCode(value: string | null | undefined): string | null {
  const code = (value ?? "").trim().toUpperCase().replace(/\s+/g, "");
  return discountCodePattern.test(code) ? code : null;
}

export type PromoDiscount = { type: "percentage"; bps: BasisPoints } | { type: "fixed"; cents: Cents };

export const promoDurations = ["once", "repeating", "forever"] as const;
export type PromoDuration = (typeof promoDurations)[number];

/** A discount as stored (type plus one of the two amounts); null when the row doesn't make sense. */
export function promoDiscountOf(row: { discountType: string; percentBps: number | null; amountCents: number | null }): PromoDiscount | null {
  if (row.discountType === "percentage" && row.percentBps !== null && row.percentBps > 0 && row.percentBps <= 10_000) return { type: "percentage", bps: row.percentBps };
  if (row.discountType === "fixed" && row.amountCents !== null && row.amountCents > 0) return { type: "fixed", cents: row.amountCents };
  return null;
}

export type PromoProblem = "inactive" | "not_started" | "expired" | "used_up" | "wrong_plan" | "first_only" | "below_minimum";

/**
 * Why a code can't be used now, or null. `used` counts earlier uses; the
 * caller passes only the checks that apply (plans and first-subscription for
 * platform codes, the minimum booking amount for agency codes).
 */
export function promoProblem(
  promo: { active: boolean; validFrom?: Date | null; validUntil?: Date | null; maxRedemptions: number | null; planKeys?: readonly string[]; firstSubscriptionOnly?: boolean; minTotalCents?: number | null },
  context: { now: Date; used: number; planKey?: string; hadSubscription?: boolean; totalCents?: number },
): PromoProblem | null {
  if (!promo.active) return "inactive";
  if (promo.validFrom && context.now < promo.validFrom) return "not_started";
  if (promo.validUntil && context.now > promo.validUntil) return "expired";
  if (promo.maxRedemptions !== null && context.used >= promo.maxRedemptions) return "used_up";
  if (context.planKey !== undefined && promo.planKeys && promo.planKeys.length > 0 && !promo.planKeys.includes(context.planKey)) return "wrong_plan";
  if (promo.firstSubscriptionOnly && context.hadSubscription) return "first_only";
  if (context.totalCents !== undefined && promo.minTotalCents && context.totalCents < promo.minTotalCents) return "below_minimum";
  return null;
}

const grossOf = (cents: Cents, vatBps: BasisPoints) => cents + percentOf(cents, vatBps);

/**
 * The discount lines for a booking code, one per VAT rate so every VAT group
 * on the quote and invoice stays right. A percentage takes that share of each
 * rate's amount. A fixed amount is what the customer saves including VAT,
 * spread over the rates in proportion to their amounts including VAT, and
 * never more than the quote. `lines` are the quote's other lines; earlier
 * discount lines (negative) are left out of the base.
 */
export function promoDiscountLines(lines: readonly QuoteLineInput[], discount: PromoDiscount, description: string): QuoteLineInput[] {
  const base = new Map<BasisPoints, Cents>();
  for (const line of lines) {
    if (line.unitPriceCents <= 0) continue;
    const raw = (line.quantityHundredths * line.unitPriceCents) / 100;
    base.set(line.vatBps, (base.get(line.vatBps) ?? 0) + Math.round(raw));
  }
  const groups = [...base.entries()].filter(([, cents]) => cents > 0).sort((a, b) => b[0] - a[0]);
  if (groups.length === 0) return [];

  let cuts: [BasisPoints, Cents][];
  if (discount.type === "percentage") {
    cuts = groups.map(([rate, cents]) => [rate, percentOf(cents, discount.bps)]);
  } else {
    const grossTotal = groups.reduce((sum, [rate, cents]) => sum + grossOf(cents, rate), 0);
    const target = Math.min(discount.cents, grossTotal);
    let left = target;
    cuts = groups.map(([rate, cents], i) => {
      const gross = grossOf(cents, rate);
      // The last group takes what rounding left over, so the savings add up to the code's amount.
      const share = i === groups.length - 1 ? left : Math.round((target * gross) / grossTotal);
      left -= share;
      // Back to an amount excluding VAT, never more than the group itself.
      return [rate, Math.min(cents, Math.round((share * 10_000) / (10_000 + rate)))];
    });
  }
  return cuts
    .filter(([, cut]) => cut > 0)
    .map(([rate, cut]) => ({ description, quantityHundredths: 100, unitPriceCents: -cut, vatBps: rate }));
}
