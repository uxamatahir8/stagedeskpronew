import type { createFormatter } from "next-intl";

/** next-intl's formatter, from getFormatter() on the server or useFormatter() in the browser. */
type Formatter = ReturnType<typeof createFormatter>;

export function euro(format: Formatter, cents: number) {
  return format.number(cents / 100, { style: "currency", currency: "EUR" });
}

/** Basis points as a percentage, e.g. 2100 → "21%". */
export function percent(format: Formatter, bps: number) {
  return format.number(bps / 10_000, { style: "percent", maximumFractionDigits: 2 });
}

/** A date-only value ("2027-06-12" or a DATE column) without timezone shifts. */
export function eventDate(format: Formatter, value: string | Date | null, style: "short" | "long" = "long") {
  if (!value) return null;
  const iso = typeof value === "string" ? value : value.toISOString().slice(0, 10);
  const date = new Date(`${iso}T12:00:00Z`);
  return format.dateTime(
    date,
    style === "long"
      ? { weekday: "short", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }
      : { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" },
  );
}

export function dateTime(format: Formatter, value: Date) {
  return format.dateTime(value, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Amount in euros for an input field: 12550 → "125,50". */
export function centsToInput(cents: number, locale: string) {
  return (cents / 100).toLocaleString(locale === "en" ? "en-GB" : "nl-NL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: false,
  });
}

/** First moment of the current calendar month (server time, Europe/Amsterdam in production). */
export function startOfMonth(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}
