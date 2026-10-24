import "server-only";
import { cacheLife } from "next/cache";
import { cookies } from "next/headers";
import { type Currency, convertCents, isCurrency } from "@stagedesk/core";
import { exchangeRates } from "@stagedesk/db";

/**
 * The currency a visitor chose to see prices in (a cookie, set from the site
 * header). Plans are billed in euros; other currencies are shown as an
 * estimate at the ECB reference rate.
 */
export const DISPLAY_CURRENCY_COOKIE = "display_currency";

export async function displayCurrency(): Promise<Currency> {
  const value = (await cookies()).get(DISPLAY_CURRENCY_COOKIE)?.value;
  return isCurrency(value) ? value : "EUR";
}

export async function siteRates() {
  "use cache";
  cacheLife("hours");
  const { rates, date } = await exchangeRates();
  return { rates, date: date?.toISOString().slice(0, 10) ?? null };
}

/** A euro amount in the visitor's currency, or null when there's no rate yet. */
export async function fromEuros(cents: number, to: Currency) {
  if (to === "EUR") return cents;
  return convertCents(cents, "EUR", to, (await siteRates()).rates);
}
