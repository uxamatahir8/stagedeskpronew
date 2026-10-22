import { type BasisPoints, type Cents, assertCents, percentOf } from "./money";
import type { FeeRule, PlatformFeeSettings } from "./settings/fees";

/** The most specific rule wins: agency deal, then plan, then platform default. */
export function resolveFeeRule(rules: {
  platform: FeeRule;
  plan?: FeeRule | null;
  agency?: FeeRule | null;
}): FeeRule {
  return rules.agency ?? rules.plan ?? rules.platform;
}

export function calculatePlatformFee(rule: FeeRule, amount: Cents): Cents {
  assertCents(amount);
  let fee: Cents;
  switch (rule.type) {
    case "none":
      return 0;
    case "percentage":
      fee = percentOf(amount, rule.percentageBps);
      break;
    case "fixed":
      fee = rule.fixedCents;
      break;
    case "percentage_plus_fixed":
      fee = percentOf(amount, rule.percentageBps) + rule.fixedCents;
      break;
  }
  if (rule.minCents !== null) fee = Math.max(fee, rule.minCents);
  if (rule.maxCents !== null) fee = Math.min(fee, rule.maxCents);
  return Math.min(fee, amount);
}

export interface PaymentSplit {
  artist: Cents;
  agency: Cents;
  /** Platform's net after Stripe's fee if the platform carries it; can be negative. */
  platform: Cents;
  stripe: Cents;
}

/**
 * Splits a received booking payment. Always satisfies
 * artist + agency + platform + stripe === amount.
 */
export function splitBookingPayment(input: {
  amount: Cents;
  stripeFee: Cents;
  artistShareBps: BasisPoints;
  feeRule: FeeRule;
  stripeFeePaidBy: PlatformFeeSettings["stripeFeePaidBy"];
}): PaymentSplit {
  const { amount, stripeFee, artistShareBps, feeRule, stripeFeePaidBy } = input;
  assertCents(amount);
  assertCents(stripeFee, "stripeFee");
  if (artistShareBps < 0 || artistShareBps > 10_000) {
    throw new RangeError(`artistShareBps must be 0–10000, got ${artistShareBps}`);
  }

  const artist = percentOf(amount, artistShareBps);
  const platformFee = calculatePlatformFee(feeRule, amount);
  const platform = stripeFeePaidBy === "platform" ? platformFee - stripeFee : platformFee;
  const agency = amount - artist - platform - stripeFee;

  return { artist, agency, platform, stripe: stripeFee };
}

/**
 * How much to take back from each party when part of a transferred payment is
 * refunded: the same fraction of what the artist and agency received. The
 * platform covers the rest, including Stripe's fee, which Stripe doesn't return.
 */
export function refundReversal(input: {
  paymentCents: Cents;
  refundCents: Cents;
  artistTransferred: Cents;
  agencyTransferred: Cents;
}): { artist: Cents; agency: Cents; platform: Cents } {
  const { paymentCents, refundCents, artistTransferred, agencyTransferred } = input;
  assertCents(paymentCents);
  assertCents(refundCents, "refundCents");
  if (refundCents <= 0 || refundCents > paymentCents) throw new RangeError(`refund must be 1–${paymentCents}, got ${refundCents}`);
  const share = (transferred: Cents) => Math.min(transferred, Math.round((transferred * refundCents) / paymentCents));
  const artist = share(artistTransferred);
  const agency = share(agencyTransferred);
  return { artist, agency, platform: refundCents - artist - agency };
}

/** The fee rule and Stripe-fee bearer frozen onto a booking when its quote is accepted. */
export interface FeeSnapshot {
  rule: FeeRule;
  stripeFeePaidBy: PlatformFeeSettings["stripeFeePaidBy"];
}
