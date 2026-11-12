import { describe, expect, it } from "vitest";
import { artistCutOfPayment, artistShareOfReceived, artistEarnings, compensationOf } from "./compensation";
import { availableForArtist, splitBookingPayment } from "./fees";
import type { FeeRule } from "./settings/fees";

const noFee: FeeRule = { type: "none", percentageBps: 0, fixedCents: 0, minCents: null, maxCents: null };
const fivePct: FeeRule = { type: "percentage", percentageBps: 500, fixedCents: 0, minCents: null, maxCents: null };

describe("compensationOf", () => {
  it("reads old rows (no type) as the percentage they always were", () => {
    expect(compensationOf({ shareBps: 4_000 })).toEqual({ type: "percentage", shareBps: 4_000, fixedCents: null });
    expect(compensationOf({ compensationType: "percentage", shareBps: 3_500, fixedFeeCents: 25_000 })).toEqual({ type: "percentage", shareBps: 3_500, fixedCents: null });
  });

  it("reads a fixed fee, and treats a fixed type without an amount as the percentage", () => {
    expect(compensationOf({ compensationType: "fixed", shareBps: 4_000, fixedFeeCents: 25_000 })).toEqual({ type: "fixed", shareBps: 0, fixedCents: 25_000 });
    expect(compensationOf({ compensationType: "fixed", shareBps: 4_000, fixedFeeCents: null }).type).toBe("percentage");
    expect(compensationOf({ compensationType: "fixed", defaultShareBps: 4_000, defaultFixedFeeCents: 30_000 }).fixedCents).toBe(30_000);
  });
});

describe("artistEarnings", () => {
  it("is a share of the total for percentages", () => {
    expect(artistEarnings({ type: "percentage", shareBps: 4_000, fixedCents: null }, 100_000)).toBe(40_000);
  });
  it("is the fixed amount whatever the booking costs", () => {
    const c = { type: "fixed" as const, shareBps: 0, fixedCents: 25_000 };
    expect(artistEarnings(c, 100_000)).toBe(25_000);
    expect(artistEarnings(c, 300_000)).toBe(25_000);
  });
});

describe("artistCutOfPayment", () => {
  const fixed = { type: "fixed" as const, shareBps: 0, fixedCents: 25_000 };

  it("never treats a fixed fee as a percentage", () => {
    // €250 fixed on a €1000 booking paid at once: €250, not 25 000 bps of anything.
    expect(artistCutOfPayment({ compensation: fixed, amount: 100_000, bookingTotalCents: 100_000, alreadyAllocated: 0, available: 100_000 })).toEqual({ artist: 25_000, shortfall: 0 });
  });

  it("spreads the fee over deposit and balance and never exceeds it", () => {
    const deposit = artistCutOfPayment({ compensation: fixed, amount: 30_000, bookingTotalCents: 100_000, alreadyAllocated: 0, available: 30_000 });
    expect(deposit.artist).toBe(7_500);
    const balance = artistCutOfPayment({ compensation: fixed, amount: 70_000, bookingTotalCents: 100_000, alreadyAllocated: deposit.artist, available: 70_000 });
    expect(balance.artist).toBe(17_500);
    expect(deposit.artist + balance.artist).toBe(25_000);
    // A third, unexpected payment (overpaid) gives the artist nothing more.
    expect(artistCutOfPayment({ compensation: fixed, amount: 5_000, bookingTotalCents: 100_000, alreadyAllocated: 25_000, available: 5_000 }).artist).toBe(0);
  });

  it("rounding over three payments stays within the fee", () => {
    const fee = { type: "fixed" as const, shareBps: 0, fixedCents: 10_000 };
    let given = 0;
    for (const amount of [33_333, 33_333, 33_334]) {
      given += artistCutOfPayment({ compensation: fee, amount, bookingTotalCents: 100_000, alreadyAllocated: given, available: amount }).artist;
    }
    expect(given).toBeLessThanOrEqual(10_000);
    expect(given).toBeGreaterThanOrEqual(9_998);
  });

  it("caps at what the payment has left and reports the rest as a shortfall", () => {
    // A €500 fee on a €400 booking: the artist can only receive what came in after fees.
    const big = { type: "fixed" as const, shareBps: 0, fixedCents: 50_000 };
    const available = availableForArtist({ amount: 40_000, stripeFee: 0, feeRule: fivePct, stripeFeePaidBy: "agency" });
    expect(available).toBe(38_000);
    const cut = artistCutOfPayment({ compensation: big, amount: 40_000, bookingTotalCents: 40_000, alreadyAllocated: 0, available });
    expect(cut).toEqual({ artist: 38_000, shortfall: 12_000 });
  });

  it("keeps the old percentage behaviour exactly", () => {
    const pct = { type: "percentage" as const, shareBps: 4_000, fixedCents: null };
    for (const amount of [1, 999, 12_345, 150_000]) {
      const cut = artistCutOfPayment({ compensation: pct, amount, bookingTotalCents: 150_000, alreadyAllocated: 0, available: amount });
      const old = splitBookingPayment({ amount, stripeFee: 0, artistShareBps: 4_000, feeRule: noFee, stripeFeePaidBy: "agency" });
      expect(cut.artist).toBe(old.artist);
    }
  });

  it("handles a booking without a total by letting the payment carry what is left", () => {
    expect(artistCutOfPayment({ compensation: fixed, amount: 10_000, bookingTotalCents: 0, alreadyAllocated: 0, available: 10_000 })).toEqual({ artist: 10_000, shortfall: 15_000 });
  });
});

describe("splitBookingPayment with a fixed artist amount", () => {
  it("still adds up to the payment", () => {
    for (const paidBy of ["agency", "platform"] as const) {
      const s = splitBookingPayment({ amount: 100_000, stripeFee: 300, artistShareBps: 0, artistCents: 25_000, feeRule: fivePct, stripeFeePaidBy: paidBy });
      expect(s.artist).toBe(25_000);
      expect(s.artist + s.agency + s.platform + s.stripe).toBe(100_000);
      expect(s.agency).toBeGreaterThanOrEqual(0);
    }
  });

  it("refuses an artist amount larger than what is available", () => {
    expect(() => splitBookingPayment({ amount: 10_000, stripeFee: 0, artistShareBps: 0, artistCents: 9_600, feeRule: fivePct, stripeFeePaidBy: "agency" })).toThrow(RangeError);
  });
});

describe("artistShareOfReceived", () => {
  const pct = { type: "percentage", shareBps: 6_000, fixedCents: null } as const;
  const fixed = { type: "fixed", shareBps: 0, fixedCents: 30_000 } as const;

  it("takes the share of what came in", () => {
    expect(artistShareOfReceived(pct, 36_300, 36_300)).toBe(21_780);
    expect(artistShareOfReceived(pct, 10_000, 36_300)).toBe(6_000);
  });

  it("spreads a fixed fee in proportion, never above the fee", () => {
    expect(artistShareOfReceived(fixed, 50_000, 100_000)).toBe(15_000);
    expect(artistShareOfReceived(fixed, 200_000, 100_000)).toBe(30_000);
  });

  it("owes nothing when nothing came in", () => {
    expect(artistShareOfReceived(pct, 0, 36_300)).toBe(0);
    expect(artistShareOfReceived(fixed, -5, 100_000)).toBe(0);
  });
});
