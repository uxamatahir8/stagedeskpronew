import { describe, expect, it } from "vitest";
import { computeQuote, MAX_QUOTE_CENTS, quoteAmountProblem, depositColumns, depositFor, depositRuleOf, lineSubtotal, parseEuros, parseQuantity, quoteChangedFields, quoteEventSnapshot } from "./quotes";

describe("computeQuote", () => {
  it("prices a wedding quote with two VAT rates", () => {
    const q = computeQuote(
      [
        { description: "DJ, per uur", quantityHundredths: 600, unitPriceCents: 12_500, vatBps: 2_100 },
        { description: "Ceremoniegeluid", quantityHundredths: 100, unitPriceCents: 25_000, vatBps: 2_100 },
        { description: "Reiskosten", quantityHundredths: 100, unitPriceCents: 4_500, vatBps: 0 },
      ],
      3_000,
    );
    expect(q.subtotalCents).toBe(104_500);
    expect(q.vatGroups).toEqual([
      { rateBps: 2_100, baseCents: 100_000, vatCents: 21_000 },
      { rateBps: 0, baseCents: 4_500, vatCents: 0 },
    ]);
    expect(q.totalCents).toBe(125_500);
    expect(q.depositCents).toBe(37_650);
    expect(q.balanceCents).toBe(87_850);
  });

  it("calculates VAT per rate, not per line, so rounding can't drift", () => {
    const lines = Array.from({ length: 3 }, () => ({
      description: "x",
      quantityHundredths: 100,
      unitPriceCents: 333,
      vatBps: 2_100,
    }));
    // Per line: 69.93 → 70 each = 210. Per rate: 999 * 21% = 209.79 → 210.
    expect(computeQuote(lines, 0).vatCents).toBe(210);
  });

  it("handles fractional quantities and discount lines", () => {
    expect(lineSubtotal({ quantityHundredths: 150, unitPriceCents: 12_500 })).toBe(18_750);
    const q = computeQuote(
      [
        { description: "DJ", quantityHundredths: 400, unitPriceCents: 10_000, vatBps: 2_100 },
        { description: "Korting", quantityHundredths: 100, unitPriceCents: -5_000, vatBps: 2_100 },
      ],
      0,
    );
    expect(q.subtotalCents).toBe(35_000);
    expect(q.totalCents).toBe(42_350);
  });

  it("rejects zero quantities and bad deposits", () => {
    expect(() => lineSubtotal({ quantityHundredths: 0, unitPriceCents: 100 })).toThrow(RangeError);
    expect(() => computeQuote([], 12_000)).toThrow(RangeError);
  });

  it("totals an empty quote at zero", () => {
    expect(computeQuote([], 3_000).totalCents).toBe(0);
  });
});

describe("parsers", () => {
  it("reads quantities with a comma or a dot", () => {
    expect(parseQuantity("1,5")).toBe(150);
    expect(parseQuantity("6")).toBe(600);
    expect(parseQuantity("0.25")).toBe(25);
    expect(parseQuantity("0")).toBeNull();
    expect(parseQuantity("1.234")).toBeNull();
    expect(parseQuantity("abc")).toBeNull();
  });

  it("reads Dutch and English amounts", () => {
    expect(parseEuros("1.250,50")).toBe(125_050);
    expect(parseEuros("1,250.50")).toBe(125_050);
    expect(parseEuros("€ 99")).toBe(9_900);
    expect(parseEuros("125,5")).toBe(12_550);
    expect(parseEuros("-50")).toBe(-5_000);
    expect(parseEuros("12,34,5")).toBeNull();
  });
});

describe("deposit rules", () => {
  const lines = [{ description: "DJ", quantityHundredths: 100, unitPriceCents: 100_000, vatBps: 2_100 }];

  it("no upfront payment means a deposit of 0", () => {
    expect(computeQuote(lines, { type: "none" }).depositCents).toBe(0);
    expect(computeQuote(lines, 0).depositCents).toBe(0);
  });

  it("a percentage works as before, given as a rule or as basis points", () => {
    expect(computeQuote(lines, { type: "percentage", bps: 3_000 }).depositCents).toBe(36_300);
    expect(computeQuote(lines, 3_000).depositCents).toBe(36_300);
  });

  it("a fixed amount is taken as is and never exceeds the total", () => {
    const q = computeQuote(lines, { type: "fixed", cents: 25_000 });
    expect(q.depositCents).toBe(25_000);
    expect(q.balanceCents).toBe(121_000 - 25_000);
    expect(computeQuote(lines, { type: "fixed", cents: 500_000 }).depositCents).toBe(121_000);
  });

  it("refuses impossible rules", () => {
    expect(() => computeQuote(lines, { type: "percentage", bps: 10_001 })).toThrow(RangeError);
    expect(() => computeQuote(lines, { type: "fixed", cents: -1 })).toThrow(RangeError);
    expect(() => computeQuote(lines, { type: "fixed", cents: 1.5 })).toThrow(RangeError);
  });

  it("reads stored columns, old quotes included", () => {
    expect(depositRuleOf({ depositBps: 3_000 })).toEqual({ type: "percentage", bps: 3_000 });
    expect(depositRuleOf({ depositType: "none", depositBps: 0 })).toEqual({ type: "none" });
    expect(depositRuleOf({ depositType: "fixed", depositBps: 0, depositFixedCents: 20_000 })).toEqual({ type: "fixed", cents: 20_000 });
    expect(depositColumns({ type: "fixed", cents: 20_000 })).toEqual({ depositType: "fixed", depositBps: 0, depositFixedCents: 20_000 });
    expect(depositFor({ type: "fixed", cents: 20_000 }, 0)).toBe(0);
  });
});

describe("quote event snapshot", () => {
  const booking = { eventType: "wedding", eventDate: new Date("2027-06-12T00:00:00Z"), startTime: "20:00", endTime: null, venueName: "Tivoli", venueAddress: null, venueCity: "Utrecht", guestCount: 100 };
  it("matches the booking it was taken from, ignoring case and empty vs null", () => {
    const snap = quoteEventSnapshot(booking);
    expect(snap.eventDate).toBe("2027-06-12");
    expect(quoteChangedFields(snap, quoteEventSnapshot({ ...booking, venueCity: "utrecht ", endTime: "" as unknown as null }))).toEqual([]);
  });
  it("names what changed", () => {
    const snap = quoteEventSnapshot(booking);
    expect(quoteChangedFields(snap, quoteEventSnapshot({ ...booking, eventDate: "2027-06-13", guestCount: 140 }))).toEqual(["eventDate", "guestCount"]);
  });
  it("treats older quotes without a snapshot as matching", () => {
    expect(quoteChangedFields(null, quoteEventSnapshot(booking))).toEqual([]);
  });
});

describe("quoteAmountProblem", () => {
  const line = (unitPriceCents: number) => ({ description: "x", quantityHundredths: 100, unitPriceCents, vatBps: 2_100 });

  it("allows a discount line while the total stays at zero or above", () => {
    expect(quoteAmountProblem(computeQuote([line(10_000), line(-2_500)], 0))).toBeNull();
    expect(quoteAmountProblem(computeQuote([line(1_000), line(-1_000)], 0))).toBeNull();
  });

  it("refuses a total below zero", () => {
    expect(quoteAmountProblem(computeQuote([line(-500)], 0))).toBe("negative_total");
    expect(quoteAmountProblem(computeQuote([line(100), line(-500)], 0))).toBe("negative_total");
  });

  it("refuses amounts above what the money columns are meant to hold", () => {
    expect(quoteAmountProblem(computeQuote([line(MAX_QUOTE_CENTS)], 0))).toBe("amount_too_high");
    // A huge line can't be hidden behind an equally huge discount.
    expect(quoteAmountProblem(computeQuote([line(MAX_QUOTE_CENTS * 2), line(-MAX_QUOTE_CENTS * 2)], 0))).toBe("amount_too_high");
  });
});
