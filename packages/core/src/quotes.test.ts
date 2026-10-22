import { describe, expect, it } from "vitest";
import { computeQuote, lineSubtotal, parseEuros, parseQuantity } from "./quotes";

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
