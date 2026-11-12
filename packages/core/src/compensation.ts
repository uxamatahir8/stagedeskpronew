import { type BasisPoints, type Cents, assertCents, percentOf } from "./money";

/**
 * How an artist is paid for a booking: a share of what the customer pays
 * (basis points), or a fixed amount in the booking's currency. Assignments
 * keep a copy, so changing an artist's default never rewrites old gigs.
 */
export const compensationTypes = ["percentage", "fixed"] as const;
export type CompensationType = (typeof compensationTypes)[number];

export interface Compensation {
  type: CompensationType;
  /** Used when type is "percentage". */
  shareBps: BasisPoints;
  /** Used when type is "fixed". */
  fixedCents: Cents | null;
}

export const isCompensationType = (value: unknown): value is CompensationType => (compensationTypes as readonly unknown[]).includes(value);

/** Reads a stored assignment or artist row; anything that isn't "fixed" with an amount is a percentage, as before fixed fees existed. */
export function compensationOf(row: { compensationType?: string | null; shareBps?: number; defaultShareBps?: number; fixedFeeCents?: number | null; defaultFixedFeeCents?: number | null }): Compensation {
  const fixed = row.fixedFeeCents ?? row.defaultFixedFeeCents ?? null;
  if (row.compensationType === "fixed" && fixed !== null) return { type: "fixed", shareBps: 0, fixedCents: fixed };
  return { type: "percentage", shareBps: row.shareBps ?? row.defaultShareBps ?? 0, fixedCents: null };
}

export function assertCompensation(c: Compensation) {
  if (c.type === "percentage") {
    if (!Number.isSafeInteger(c.shareBps) || c.shareBps < 0 || c.shareBps > 10_000) throw new RangeError(`shareBps must be 0–10000, got ${c.shareBps}`);
    return;
  }
  if (c.fixedCents === null) throw new RangeError("a fixed fee needs an amount");
  assertCents(c.fixedCents, "fixedCents");
  if (c.fixedCents < 0) throw new RangeError(`fixedCents must be ≥ 0, got ${c.fixedCents}`);
}

/** What the artist earns on the whole booking (before payment timing, platform fees or refunds). */
export function artistEarnings(c: Compensation, bookingTotalCents: Cents): Cents {
  assertCents(bookingTotalCents, "bookingTotalCents");
  return c.type === "fixed" ? (c.fixedCents ?? 0) : percentOf(bookingTotalCents, c.shareBps);
}

/**
 * The artist's part of one received payment.
 *
 * - Percentage: that share of the payment, as always.
 * - Fixed: the fee spread over the booking in proportion to the payment
 *   (fee × payment ÷ booking total), so a deposit carries its part and the
 *   balance the rest, exactly as a percentage would. What earlier payments
 *   already gave the artist is subtracted, so the fee is never exceeded.
 *
 * Either way the cut is capped at what the payment has left after the
 * platform fee (and Stripe's fee when the agency carries it): an artist is
 * never paid out of money that wasn't received. Whatever the cap holds back
 * is returned as `shortfall`, which payouts record as owed by the agency.
 */
export function artistCutOfPayment(input: {
  compensation: Compensation;
  /** Received amount this split covers, net of refunds. */
  amount: Cents;
  bookingTotalCents: Cents;
  /** What the artist got from this booking's earlier payments (fixed fees only). */
  alreadyAllocated: Cents;
  /** Amount minus the platform's fee and any Stripe fee the agency carries. */
  available: Cents;
}): { artist: Cents; shortfall: Cents } {
  const { compensation: c, amount, bookingTotalCents, alreadyAllocated, available } = input;
  assertCents(amount);
  assertCents(available, "available");
  assertCompensation(c);
  let wanted: Cents;
  if (c.type === "percentage") wanted = percentOf(amount, c.shareBps);
  else {
    const fee = c.fixedCents ?? 0;
    const left = Math.max(0, fee - Math.max(0, alreadyAllocated));
    // No total to spread over (a booking paid without a quote): the payment carries what is left.
    const proportional = bookingTotalCents > 0 ? Math.round((fee * amount) / bookingTotalCents) : left;
    wanted = Math.min(left, Math.max(0, proportional));
  }
  const artist = Math.max(0, Math.min(wanted, available));
  return { artist, shortfall: wanted - artist };
}

/**
 * The artist's part of money the agency received itself (bank transfer, cash):
 * nothing moves through Stripe, so the agency owes them this directly. Never
 * more than they earn on the whole booking.
 */
export function artistShareOfReceived(c: Compensation, receivedCents: Cents, bookingTotalCents: Cents): Cents {
  if (receivedCents <= 0) return 0;
  if (c.type === "percentage") return percentOf(receivedCents, c.shareBps);
  const fee = c.fixedCents ?? 0;
  return bookingTotalCents > 0 ? Math.min(fee, Math.round((fee * receivedCents) / bookingTotalCents)) : fee;
}
