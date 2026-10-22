import { type BasisPoints, type Cents, assertCents, percentOf } from "./money";

/** Quantities are stored in hundredths so 1.5 hours is exact (150). */
export interface QuoteLineInput {
  description: string;
  quantityHundredths: number;
  /** Price per unit excluding VAT. Negative for a discount line. */
  unitPriceCents: Cents;
  vatBps: BasisPoints;
}

export interface QuoteLine extends QuoteLineInput {
  subtotalCents: Cents;
}

export interface VatGroup {
  rateBps: BasisPoints;
  baseCents: Cents;
  vatCents: Cents;
}

export interface QuoteTotals {
  lines: QuoteLine[];
  /** One entry per VAT rate, as Dutch invoices require. */
  vatGroups: VatGroup[];
  subtotalCents: Cents;
  vatCents: Cents;
  totalCents: Cents;
  depositCents: Cents;
  balanceCents: Cents;
}

export function lineSubtotal(line: Pick<QuoteLineInput, "quantityHundredths" | "unitPriceCents">): Cents {
  if (!Number.isSafeInteger(line.quantityHundredths) || line.quantityHundredths <= 0) {
    throw new RangeError(`quantityHundredths must be a positive integer, got ${line.quantityHundredths}`);
  }
  assertCents(line.unitPriceCents, "unitPriceCents");
  const raw = (line.quantityHundredths * line.unitPriceCents) / 100;
  return Math.sign(raw) * Math.round(Math.abs(raw));
}

/**
 * Totals for a quote. VAT is calculated once per rate over that rate's
 * subtotal, so per-line rounding can't make the invoice drift.
 */
export function computeQuote(lines: QuoteLineInput[], depositBps: BasisPoints): QuoteTotals {
  if (depositBps < 0 || depositBps > 10_000) throw new RangeError(`depositBps must be 0–10000, got ${depositBps}`);

  const priced = lines.map((line) => ({ ...line, subtotalCents: lineSubtotal(line) }));
  const byRate = new Map<number, Cents>();
  for (const line of priced) byRate.set(line.vatBps, (byRate.get(line.vatBps) ?? 0) + line.subtotalCents);

  const vatGroups = [...byRate.entries()]
    .sort(([a], [b]) => b - a)
    .map(([rateBps, baseCents]) => ({ rateBps, baseCents, vatCents: percentOf(baseCents, rateBps) }));

  const subtotalCents = priced.reduce((sum, l) => sum + l.subtotalCents, 0);
  const vatCents = vatGroups.reduce((sum, g) => sum + g.vatCents, 0);
  const totalCents = subtotalCents + vatCents;
  const depositCents = Math.max(0, percentOf(totalCents, depositBps));

  return { lines: priced, vatGroups, subtotalCents, vatCents, totalCents, depositCents, balanceCents: totalCents - depositCents };
}

/** "1,5" or "1.5" → 150. Returns null for anything that isn't a positive amount with ≤2 decimals. */
export function parseQuantity(value: string): number | null {
  const match = value.trim().replace(",", ".").match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) return null;
  const hundredths = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return hundredths > 0 ? hundredths : null;
}

/** "1.250,50", "1250.5", "€ 99" → cents. Accepts Dutch and English separators. */
export function parseEuros(value: string): Cents | null {
  let v = value.trim().replace(/[€\s]/g, "");
  const negative = v.startsWith("-");
  if (negative) v = v.slice(1);
  // The last separator followed by 1–2 digits is the decimal mark; others group thousands.
  const match = v.match(/^(\d{1,3}(?:[.,]\d{3})*|\d+)(?:[.,](\d{1,2}))?$/);
  if (!match) return null;
  const whole = Number(match[1]!.replace(/[.,]/g, ""));
  const cents = Number((match[2] ?? "").padEnd(2, "0"));
  const total = whole * 100 + cents;
  return negative ? -total : total;
}
