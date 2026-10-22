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
