import { describe, expect, it } from "vitest";
import { creditableCents, creditNoteAmounts, creditNoteNumber } from "./credit-notes";

describe("creditableCents", () => {
  const base = { refundCents: 10_000, paidBeforeRefundCents: 50_000, invoiceTotalCents: 100_000, alreadyCreditedCents: 0 };

  it("credits a refund of money the invoice covered", () => {
    expect(creditableCents(base)).toBe(10_000);
  });

  it("needs no credit note for returning an overpayment", () => {
    expect(creditableCents({ ...base, paidBeforeRefundCents: 110_000, refundCents: 10_000 })).toBe(0);
  });

  it("credits only the part beyond the overpayment", () => {
    expect(creditableCents({ ...base, paidBeforeRefundCents: 105_000, refundCents: 10_000 })).toBe(5_000);
  });

  it("never credits more than the invoice has left", () => {
    expect(creditableCents({ ...base, alreadyCreditedCents: 95_000 })).toBe(5_000);
    expect(creditableCents({ ...base, alreadyCreditedCents: 100_000 })).toBe(0);
  });
});

describe("creditNoteAmounts", () => {
  it("takes the VAT out of the credited amount", () => {
    expect(creditNoteAmounts(12_100, [{ rateBps: 2_100, baseCents: 75_000, vatCents: 15_750 }])).toEqual({
      vatGroups: [{ rateBps: 2_100, baseCents: 10_000, vatCents: 2_100 }],
      subtotalCents: 10_000,
      vatCents: 2_100,
      totalCents: 12_100,
    });
  });

  it("splits over several rates and still adds up to the cent", () => {
    const groups = [
      { rateBps: 2_100, baseCents: 10_000, vatCents: 2_100 },
      { rateBps: 900, baseCents: 3_333, vatCents: 300 },
      { rateBps: 0, baseCents: 1_111, vatCents: 0 },
    ];
    for (const credit of [1, 7, 333, 9_999, 17_144]) {
      const r = creditNoteAmounts(credit, groups);
      expect(r.vatGroups.reduce((s, g) => s + g.baseCents + g.vatCents, 0)).toBe(credit);
      expect(r.subtotalCents + r.vatCents).toBe(credit);
    }
  });

  it("refuses a credit of nothing", () => {
    expect(() => creditNoteAmounts(0, [])).toThrow(RangeError);
  });
});

it("numbers per year in its own series", () => {
  expect(creditNoteNumber(2026, 7)).toBe("CN-2026-0007");
});
