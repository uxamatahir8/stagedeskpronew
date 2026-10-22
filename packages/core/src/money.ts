/**
 * All money is integer cents. Percentages are basis points (1% = 100 bps),
 * so no floating-point value ever touches an amount.
 */
export type Cents = number;
export type BasisPoints = number;

export function assertCents(value: number, label = "amount"): asserts value is Cents {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} must be an integer number of cents, got ${value}`);
  }
}

/** Share of an amount, rounded half away from zero to the nearest cent. */
export function percentOf(amount: Cents, bps: BasisPoints): Cents {
  assertCents(amount);
  const raw = (amount * bps) / 10_000;
  return Math.sign(raw) * Math.round(Math.abs(raw));
}

export function formatMoney(amount: Cents, locale: "nl" | "en" = "nl", currency = "EUR"): string {
  return new Intl.NumberFormat(locale === "nl" ? "nl-NL" : "en-NL", {
    style: "currency",
    currency,
  }).format(amount / 100);
}
