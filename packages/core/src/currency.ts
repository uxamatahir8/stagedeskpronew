import type { Cents } from "./money";

/**
 * Currencies an agency can work in, and visitors can view prices in. All use
 * two decimals, so amounts stay integer cents (minor units) everywhere.
 */
export const currencies = ["EUR", "USD", "GBP", "CHF", "SEK", "NOK", "DKK", "PLN", "CZK", "CAD", "AUD"] as const;
export type Currency = (typeof currencies)[number];

export function isCurrency(value: unknown): value is Currency {
  return typeof value === "string" && (currencies as readonly string[]).includes(value);
}

/** One euro in each currency (ECB reference rates). EUR itself is 1. */
export type RateTable = Partial<Record<Currency, number>>;

/**
 * Converts an amount between currencies through the euro, rounded to whole
 * cents. Returns null when a rate is missing, so callers never show a guess.
 */
export function convertCents(amount: Cents, from: Currency, to: Currency, rates: RateTable): Cents | null {
  if (from === to) return amount;
  const fromRate = from === "EUR" ? 1 : rates[from];
  const toRate = to === "EUR" ? 1 : rates[to];
  if (!fromRate || !toRate) return null;
  return Math.round((amount / fromRate) * toRate);
}

/** Stripe wants lowercase ISO codes. */
export const stripeCurrency = (currency: string) => currency.toLowerCase();

/**
 * The ECB daily reference rates (eurofxref-daily.xml) as a table plus the
 * publication date; only currencies StageDesk supports are kept.
 */
export function parseEcbRates(xml: string): { date: string; rates: RateTable } | null {
  const date = /time=['"](\d{4}-\d{2}-\d{2})['"]/.exec(xml)?.[1];
  if (!date) return null;
  const rates: RateTable = {};
  for (const m of xml.matchAll(/currency=['"]([A-Z]{3})['"]\s+rate=['"]([\d.]+)['"]/g)) {
    const [, code, rate] = m;
    if (isCurrency(code) && code !== "EUR" && Number(rate) > 0) rates[code] = Number(rate);
  }
  return Object.keys(rates).length > 0 ? { date, rates } : null;
}

/**
 * A platform fee rule is set in euros; for an agency working in another
 * currency its fixed, minimum and maximum amounts are converted at today's
 * rate when the fee is fixed for a booking. Without a rate it stays as is.
 */
export function feeRuleInCurrency<T extends { fixedCents: number; minCents: number | null; maxCents: number | null }>(rule: T, currency: string, rates: RateTable): T {
  if (currency === "EUR" || !isCurrency(currency)) return rule;
  const convert = (cents: number) => convertCents(cents, "EUR", currency, rates) ?? cents;
  return {
    ...rule,
    fixedCents: convert(rule.fixedCents),
    minCents: rule.minCents === null ? null : convert(rule.minCents),
    maxCents: rule.maxCents === null ? null : convert(rule.maxCents),
  };
}
