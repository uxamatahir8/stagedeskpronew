import { describe, expect, it } from "vitest";
import { calculatePlatformFee, resolveFeeRule, splitBookingPayment } from "./fees";
import type { FeeRule } from "./settings/fees";

const rule = (r: Partial<FeeRule> & Pick<FeeRule, "type">): FeeRule => ({
  percentageBps: 0,
  fixedCents: 0,
  minCents: null,
  maxCents: null,
  ...r,
});

describe("calculatePlatformFee", () => {
  it("applies percentage, fixed and combined rules", () => {
    expect(calculatePlatformFee(rule({ type: "percentage", percentageBps: 300 }), 150_000)).toBe(4_500);
    expect(calculatePlatformFee(rule({ type: "fixed", fixedCents: 1_500 }), 150_000)).toBe(1_500);
    expect(
      calculatePlatformFee(rule({ type: "percentage_plus_fixed", percentageBps: 100, fixedCents: 250 }), 150_000),
    ).toBe(1_750);
    expect(calculatePlatformFee(rule({ type: "none", percentageBps: 500 }), 150_000)).toBe(0);
  });

  it("clamps to min and max, and never exceeds the amount", () => {
    const r = rule({ type: "percentage", percentageBps: 200, minCents: 500, maxCents: 2_000 });
    expect(calculatePlatformFee(r, 10_000)).toBe(500);
    expect(calculatePlatformFee(r, 500_000)).toBe(2_000);
    expect(calculatePlatformFee(rule({ type: "fixed", fixedCents: 5_000 }), 3_000)).toBe(3_000);
  });
});

describe("resolveFeeRule", () => {
  const platform = rule({ type: "percentage", percentageBps: 200 });
  const plan = rule({ type: "percentage", percentageBps: 100 });
  const agency = rule({ type: "none" });

  it("prefers agency over plan over platform", () => {
    expect(resolveFeeRule({ platform, plan, agency })).toBe(agency);
    expect(resolveFeeRule({ platform, plan })).toBe(plan);
    expect(resolveFeeRule({ platform, plan: null, agency: null })).toBe(platform);
  });
});

describe("splitBookingPayment", () => {
  const feeRule = rule({ type: "percentage", percentageBps: 300 });

  it("matches the plan's €1,500 example when the agency carries Stripe's fee", () => {
    const split = splitBookingPayment({
      amount: 150_000,
      stripeFee: 0,
      artistShareBps: 4_000,
      feeRule,
      stripeFeePaidBy: "agency",
    });
    expect(split).toEqual({ artist: 60_000, agency: 85_500, platform: 4_500, stripe: 0 });
  });

  it("moves Stripe's fee between agency and platform", () => {
    const base = { amount: 150_000, stripeFee: 1_100, artistShareBps: 4_000, feeRule };
    expect(splitBookingPayment({ ...base, stripeFeePaidBy: "agency" })).toMatchObject({ agency: 84_400, platform: 4_500 });
    expect(splitBookingPayment({ ...base, stripeFeePaidBy: "platform" })).toMatchObject({ agency: 85_500, platform: 3_400 });
  });

  it("always adds up to the amount paid", () => {
    for (const amount of [1, 99, 12_345, 150_000, 987_654]) {
      for (const bps of [0, 3_333, 4_000, 10_000]) {
        for (const paidBy of ["agency", "platform"] as const) {
          const s = splitBookingPayment({ amount, stripeFee: 37, artistShareBps: bps, feeRule, stripeFeePaidBy: paidBy });
          expect(s.artist + s.agency + s.platform + s.stripe).toBe(amount);
        }
      }
    }
  });

  it("rejects fractional cents", () => {
    expect(() =>
      splitBookingPayment({ amount: 10.5, stripeFee: 0, artistShareBps: 0, feeRule, stripeFeePaidBy: "agency" }),
    ).toThrow(RangeError);
  });
});
