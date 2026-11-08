import { describe, expect, it } from "vitest";
import { normalizeDiscountCode, promoDiscountLines, promoDiscountOf, promoProblem } from "./promo-codes";
import { computeQuote } from "./quotes";

const dj = { description: "DJ", quantityHundredths: 500, unitPriceCents: 10_000, vatBps: 2_100 }; // €500 + 21%
const sound = { description: "Geluid", quantityHundredths: 100, unitPriceCents: 20_000, vatBps: 900 }; // €200 + 9%

describe("promo codes", () => {
  it("normalizes codes to capitals and refuses odd ones", () => {
    expect(normalizeDiscountCode(" wedding 10 ")).toBe("WEDDING10");
    expect(normalizeDiscountCode("pilot-50")).toBe("PILOT-50");
    expect(normalizeDiscountCode("ab")).toBeNull();
    expect(normalizeDiscountCode("bad!code")).toBeNull();
    expect(normalizeDiscountCode("-start")).toBeNull();
  });

  it("reads a stored discount and refuses nonsense", () => {
    expect(promoDiscountOf({ discountType: "percentage", percentBps: 1_000, amountCents: null })).toEqual({ type: "percentage", bps: 1_000 });
    expect(promoDiscountOf({ discountType: "fixed", amountCents: 5_000, percentBps: null })).toEqual({ type: "fixed", cents: 5_000 });
    expect(promoDiscountOf({ discountType: "percentage", percentBps: 12_000, amountCents: null })).toBeNull();
    expect(promoDiscountOf({ discountType: "fixed", amountCents: -1, percentBps: null })).toBeNull();
  });

  it("explains why a code can't be used", () => {
    const now = new Date("2027-03-01T12:00:00Z");
    const code = { active: true, validFrom: null, validUntil: null, maxRedemptions: 2 };
    expect(promoProblem(code, { now, used: 0 })).toBeNull();
    expect(promoProblem({ ...code, active: false }, { now, used: 0 })).toBe("inactive");
    expect(promoProblem({ ...code, validFrom: new Date("2027-04-01") }, { now, used: 0 })).toBe("not_started");
    expect(promoProblem({ ...code, validUntil: new Date("2027-02-01") }, { now, used: 0 })).toBe("expired");
    expect(promoProblem(code, { now, used: 2 })).toBe("used_up");
    expect(promoProblem({ ...code, planKeys: ["pro"] }, { now, used: 0, planKey: "starter" })).toBe("wrong_plan");
    expect(promoProblem({ ...code, planKeys: [] }, { now, used: 0, planKey: "starter" })).toBeNull();
    expect(promoProblem({ ...code, firstSubscriptionOnly: true }, { now, used: 0, hadSubscription: true })).toBe("first_only");
    expect(promoProblem({ ...code, minTotalCents: 100_000 }, { now, used: 0, totalCents: 50_000 })).toBe("below_minimum");
  });

  it("takes a percentage off every VAT rate", () => {
    const cuts = promoDiscountLines([dj, sound], { type: "percentage", bps: 1_000 }, "WEDDING10");
    expect(cuts).toEqual([
      { description: "WEDDING10", quantityHundredths: 100, unitPriceCents: -5_000, vatBps: 2_100 },
      { description: "WEDDING10", quantityHundredths: 100, unitPriceCents: -2_000, vatBps: 900 },
    ]);
    const before = computeQuote([dj, sound], { type: "none" });
    const after = computeQuote([dj, sound, ...cuts], { type: "none" });
    expect(after.totalCents).toBe(Math.round(before.totalCents * 0.9));
  });

  it("spreads a fixed amount including VAT over the rates, and the customer saves exactly that", () => {
    const cuts = promoDiscountLines([dj, sound], { type: "fixed", cents: 5_000 }, "SAVE50");
    const before = computeQuote([dj, sound], { type: "none" });
    const after = computeQuote([dj, sound, ...cuts], { type: "none" });
    expect(before.totalCents - after.totalCents).toBeGreaterThanOrEqual(4_998);
    expect(before.totalCents - after.totalCents).toBeLessThanOrEqual(5_002);
    expect(cuts.every((c) => c.unitPriceCents < 0)).toBe(true);
  });

  it("never discounts below zero, and ignores earlier discount lines", () => {
    const cuts = promoDiscountLines([sound, { description: "Korting", quantityHundredths: 100, unitPriceCents: -5_000, vatBps: 900 }], { type: "fixed", cents: 1_000_000 }, "BIG");
    expect(cuts).toEqual([{ description: "BIG", quantityHundredths: 100, unitPriceCents: -20_000, vatBps: 900 }]);
    expect(promoDiscountLines([], { type: "percentage", bps: 1_000 }, "X")).toEqual([]);
  });
});
