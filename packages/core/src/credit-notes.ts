import { type Cents, assertCents } from "./money";

export interface CreditVatGroup {
  rateBps: number;
  baseCents: Cents;
  vatCents: Cents;
}

/**
 * How much of a refund a credit note has to cover. Money the customer paid
 * above the invoice total never was revenue, so returning it needs no credit
 * note; and an invoice can't be credited for more than it was.
 */
export function creditableCents(input: { refundCents: Cents; paidBeforeRefundCents: Cents; invoiceTotalCents: Cents; alreadyCreditedCents: Cents }): Cents {
  const overpaid = Math.max(0, input.paidBeforeRefundCents - input.invoiceTotalCents);
  const room = Math.max(0, input.invoiceTotalCents - input.alreadyCreditedCents);
  return Math.max(0, Math.min(input.refundCents - overpaid, room));
}

/**
 * Splits a credited amount (including VAT) over the invoice's VAT rates in
 * proportion, so the VAT reclaimed matches the VAT that was charged. The parts
 * always add up to the amount: the last rate takes what rounding left over.
 */
export function creditNoteAmounts(creditCents: Cents, invoiceGroups: readonly CreditVatGroup[]) {
  assertCents(creditCents, "creditCents");
  if (creditCents <= 0) throw new RangeError(`a credit must be above zero, got ${creditCents}`);
  const gross = invoiceGroups.reduce((sum, g) => sum + g.baseCents + g.vatCents, 0);
  if (gross <= 0) return { vatGroups: [{ rateBps: 0, baseCents: creditCents, vatCents: 0 }], subtotalCents: creditCents, vatCents: 0, totalCents: creditCents };
  let left = creditCents;
  const vatGroups = invoiceGroups.map((g, i) => {
    const groupGross = g.baseCents + g.vatCents;
    const part = i === invoiceGroups.length - 1 ? left : Math.round((creditCents * groupGross) / gross);
    left -= part;
    const vatCents = groupGross > 0 ? Math.round((part * g.vatCents) / groupGross) : 0;
    return { rateBps: g.rateBps, baseCents: part - vatCents, vatCents };
  });
  const vatCents = vatGroups.reduce((sum, g) => sum + g.vatCents, 0);
  return { vatGroups, subtotalCents: creditCents - vatCents, vatCents, totalCents: creditCents };
}

/** The credit note's own number series per agency, e.g. CN-2026-0007. */
export const creditNoteNumber = (year: number, sequence: number) => `CN-${year}-${String(sequence).padStart(4, "0")}`;
