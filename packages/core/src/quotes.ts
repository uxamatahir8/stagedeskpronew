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
 * What the customer pays upfront: nothing, a percentage of the total, or a
 * fixed amount (never more than the total). A number is a percentage in basis
 * points, as quotes stored it before the other kinds existed.
 */
export const depositTypes = ["none", "percentage", "fixed"] as const;
export type DepositType = (typeof depositTypes)[number];
export type DepositRule = { type: "none" } | { type: "percentage"; bps: BasisPoints } | { type: "fixed"; cents: Cents };

export const isDepositType = (value: unknown): value is DepositType => (depositTypes as readonly unknown[]).includes(value);

export function toDepositRule(rule: DepositRule | BasisPoints): DepositRule {
  return typeof rule === "number" ? (rule === 0 ? { type: "none" } : { type: "percentage", bps: rule }) : rule;
}

/** Reads the columns a quote or agency stores (type, bps, fixed cents); unknown types fall back to the percentage. */
export function depositRuleOf(row: { depositType?: string | null; depositBps?: number | null; depositFixedCents?: number | null }): DepositRule {
  if (row.depositType === "none") return { type: "none" };
  if (row.depositType === "fixed" && row.depositFixedCents != null) return { type: "fixed", cents: row.depositFixedCents };
  return { type: "percentage", bps: row.depositBps ?? 0 };
}

export function assertDepositRule(rule: DepositRule) {
  if (rule.type === "percentage" && (!Number.isSafeInteger(rule.bps) || rule.bps < 0 || rule.bps > 10_000)) {
    throw new RangeError(`depositBps must be 0–10000, got ${rule.bps}`);
  }
  if (rule.type === "fixed") {
    assertCents(rule.cents, "deposit");
    if (rule.cents < 0) throw new RangeError(`a fixed deposit must be ≥ 0, got ${rule.cents}`);
  }
}

export function depositFor(rule: DepositRule, totalCents: Cents): Cents {
  assertDepositRule(rule);
  if (totalCents <= 0) return 0;
  if (rule.type === "none") return 0;
  if (rule.type === "fixed") return Math.min(rule.cents, totalCents);
  return Math.max(0, percentOf(totalCents, rule.bps));
}

/** The columns a quote stores for a rule (depositBps stays meaningful for old readers: 0 unless a percentage). */
export function depositColumns(rule: DepositRule) {
  return {
    depositType: rule.type,
    depositBps: rule.type === "percentage" ? rule.bps : 0,
    depositFixedCents: rule.type === "fixed" ? rule.cents : null,
  };
}

/**
 * Totals for a quote. VAT is calculated once per rate over that rate's
 * subtotal, so per-line rounding can't make the invoice drift.
 */
export function computeQuote(lines: QuoteLineInput[], deposit: DepositRule | BasisPoints): QuoteTotals {
  const rule = toDepositRule(deposit);
  assertDepositRule(rule);

  const priced = lines.map((line) => ({ ...line, subtotalCents: lineSubtotal(line) }));
  const byRate = new Map<number, Cents>();
  for (const line of priced) byRate.set(line.vatBps, (byRate.get(line.vatBps) ?? 0) + line.subtotalCents);

  const vatGroups = [...byRate.entries()]
    .sort(([a], [b]) => b - a)
    .map(([rateBps, baseCents]) => ({ rateBps, baseCents, vatCents: percentOf(baseCents, rateBps) }));

  const subtotalCents = priced.reduce((sum, l) => sum + l.subtotalCents, 0);
  const vatCents = vatGroups.reduce((sum, g) => sum + g.vatCents, 0);
  const totalCents = subtotalCents + vatCents;
  const depositCents = depositFor(rule, totalCents);

  return { lines: priced, vatGroups, subtotalCents, vatCents, totalCents, depositCents, balanceCents: totalCents - depositCents };
}

/** The highest amount a quote or line can hold: below the money columns' limit, and far above any real booking. */
export const MAX_QUOTE_CENTS = 1_000_000_000;

/**
 * Why these totals can't go to a customer, or null when they can. Single
 * discount lines may be negative, but what the customer pays never is.
 */
export function quoteAmountProblem(totals: Pick<QuoteTotals, "lines" | "subtotalCents" | "totalCents">): "negative_total" | "amount_too_high" | null {
  if (totals.totalCents < 0 || totals.subtotalCents < 0) return "negative_total";
  if (totals.totalCents > MAX_QUOTE_CENTS || totals.lines.some((l) => Math.abs(l.subtotalCents) > MAX_QUOTE_CENTS || Math.abs(l.unitPriceCents) > MAX_QUOTE_CENTS)) return "amount_too_high";
  return null;
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

/**
 * The event details a quote is made for. A customer accepts these, so when
 * one changes after the quote was sent the quote is outdated: it can't be
 * accepted until the agency sends a revision. (Partner name, music and notes
 * don't change what is offered.)
 */
export const quoteEventFields = ["eventType", "eventDate", "startTime", "endTime", "venueName", "venueAddress", "venueCity", "guestCount"] as const;
export type QuoteEventField = (typeof quoteEventFields)[number];
export type QuoteEventSnapshot = Record<QuoteEventField, string | number | null>;

/** The snapshot stored on a quote; eventDate as YYYY-MM-DD. */
export function quoteEventSnapshot(b: {
  eventType: string;
  eventDate: Date | string | null;
  startTime: string | null;
  endTime: string | null;
  venueName: string | null;
  venueAddress: string | null;
  venueCity: string | null;
  guestCount: number | null;
}): QuoteEventSnapshot {
  const date = b.eventDate === null ? null : typeof b.eventDate === "string" ? b.eventDate : b.eventDate.toISOString().slice(0, 10);
  return {
    eventType: b.eventType,
    eventDate: date,
    startTime: b.startTime,
    endTime: b.endTime,
    venueName: b.venueName,
    venueAddress: b.venueAddress,
    venueCity: b.venueCity,
    guestCount: b.guestCount,
  };
}

/** Fields that differ between a quote's snapshot and the booking now; [] when it still matches (or has no snapshot: older quotes). */
export function quoteChangedFields(snapshot: unknown, current: QuoteEventSnapshot): QuoteEventField[] {
  if (!snapshot || typeof snapshot !== "object") return [];
  const s = snapshot as Partial<QuoteEventSnapshot>;
  const norm = (v: unknown) => (v === null || v === undefined || v === "" ? "" : String(v).trim().toLowerCase());
  return quoteEventFields.filter((f) => norm(s[f]) !== norm(current[f]));
}
