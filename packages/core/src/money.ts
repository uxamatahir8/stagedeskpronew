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

/** An IBAN without spaces, in capitals: "NL91 abna 0417 1643 00" → "NL91ABNA0417164300". */
export function normalizeIban(value: string) {
  return value.replace(/\s+/g, "").toUpperCase();
}

/** Checks the IBAN structure and its mod-97 check digits (ISO 13616). */
export function isValidIban(value: string) {
  const iban = normalizeIban(value);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  if (iban.startsWith("NL") && iban.length !== 18) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const digits = rearranged.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rest = 0;
  for (const d of digits) rest = (rest * 10 + Number(d)) % 97;
  return rest === 1;
}

/** "NL91ABNA0417164300" → "NL91 ABNA 0417 1643 00", the way people read and type it. */
export function formatIban(value: string) {
  return normalizeIban(value).replace(/(.{4})/g, "$1 ").trim();
}
