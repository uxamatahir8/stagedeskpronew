import { describe, expect, it } from "vitest";
import { fallbackLimits, parseLimits, subscriptionAccess, withinLimit } from "./plans";
import { refundReversal } from "./fees";

const now = new Date("2027-03-10T12:00:00Z");
const days = (n: number) => new Date(now.getTime() + n * 86_400_000);

describe("subscriptionAccess", () => {
  it("gives full access during a trial and an active subscription", () => {
    expect(subscriptionAccess({ status: "trialing", trialEndsAt: days(3), pastDueSince: null }, now, 7)).toMatchObject({ level: "full", reason: "trial" });
    expect(subscriptionAccess({ status: "active", trialEndsAt: null, pastDueSince: null }, now, 7)).toMatchObject({ level: "full", reason: "active" });
  });

  it("allows a grace period after the trial, then read-only", () => {
    expect(subscriptionAccess({ status: "trialing", trialEndsAt: days(-3), pastDueSince: null }, now, 7)).toMatchObject({
      level: "full",
      reason: "grace",
      until: days(4),
    });
    expect(subscriptionAccess({ status: "trialing", trialEndsAt: days(-8), pastDueSince: null }, now, 7)).toMatchObject({
      level: "read_only",
      reason: "trial_ended",
    });
  });

  it("allows a grace period after a failed payment, then read-only", () => {
    expect(subscriptionAccess({ status: "past_due", trialEndsAt: null, pastDueSince: days(-2) }, now, 7).level).toBe("full");
    expect(subscriptionAccess({ status: "past_due", trialEndsAt: null, pastDueSince: days(-7) }, now, 7)).toMatchObject({
      level: "read_only",
      reason: "payment_failed",
    });
  });

  it("is read-only when cancelled or missing", () => {
    expect(subscriptionAccess({ status: "canceled", trialEndsAt: null, pastDueSince: null }, now, 7).level).toBe("read_only");
    expect(subscriptionAccess(null, now, 7)).toMatchObject({ level: "read_only", reason: "none" });
  });
});

describe("plan limits", () => {
  it("treats null as unlimited", () => {
    const limits = { ...fallbackLimits, maxArtists: null };
    expect(withinLimit(limits, "maxArtists", 10_000)).toBe(true);
    expect(withinLimit(fallbackLimits, "maxArtists", 1)).toBe(true);
    expect(withinLimit(fallbackLimits, "maxArtists", 2)).toBe(false);
  });

  it("falls back to safe limits for broken data", () => {
    expect(parseLimits({ maxArtists: "lots" })).toEqual(fallbackLimits);
  });
});

describe("refundReversal", () => {
  it("takes back the same fraction from artist and agency", () => {
    // €1,500 paid: artist got €600, agency €855; half refunded.
    expect(refundReversal({ paymentCents: 150_000, refundCents: 75_000, artistTransferred: 60_000, agencyTransferred: 85_500 })).toEqual({
      artist: 30_000,
      agency: 42_750,
      platform: 2_250,
    });
  });

  it("on a full refund the platform also covers Stripe's unreturned fee", () => {
    // Agency carried the €11 Stripe fee: it received 84,400 of the 150,000.
    const r = refundReversal({ paymentCents: 150_000, refundCents: 150_000, artistTransferred: 60_000, agencyTransferred: 84_400 });
    expect(r).toEqual({ artist: 60_000, agency: 84_400, platform: 5_600 });
    expect(r.artist + r.agency + r.platform).toBe(150_000);
  });

  it("never reverses more than was transferred and rejects bad amounts", () => {
    const r = refundReversal({ paymentCents: 3, refundCents: 2, artistTransferred: 1, agencyTransferred: 1 });
    expect(r.artist).toBeLessThanOrEqual(1);
    expect(() => refundReversal({ paymentCents: 100, refundCents: 101, artistTransferred: 0, agencyTransferred: 0 })).toThrow(RangeError);
  });
});
