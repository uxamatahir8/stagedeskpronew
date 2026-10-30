import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { cookies, headers } from "next/headers";
import { type Currency, convertCents, isCurrency, visitorCountry, visitorCurrency } from "@stagedesk/core";
import { enabledCurrencies, exchangeRates } from "@stagedesk/db";
import { SITE_TAGS } from "./site";

/**
 * The currency a visitor sees prices in: the one they chose (a cookie, set
 * from the site header), else their own country's when it's offered, else
 * euros. Plans are billed in euros; other currencies are shown as an
 * estimate at the ECB reference rate.
 */
export const DISPLAY_CURRENCY_COOKIE = "display_currency";

export async function displayCurrency(): Promise<Currency> {
  const [value, offered, h] = await Promise.all([cookies().then((c) => c.get(DISPLAY_CURRENCY_COOKIE)?.value), siteCurrencies(), headers()]);
  if (isCurrency(value) && offered.includes(value)) return value;
  return visitorCurrency({ country: visitorCountry((name) => h.get(name)), acceptLanguage: h.get("accept-language") }, offered);
}

/** The currencies the admin enabled; changes call updateTag(SITE_TAGS.settings). */
export async function siteCurrencies() {
  "use cache";
  cacheTag(SITE_TAGS.settings);
  cacheLife("hours");
  return enabledCurrencies();
}

export async function siteRates() {
  "use cache";
  cacheTag(SITE_TAGS.settings);
  cacheLife("hours");
  const { rates, date } = await exchangeRates();
  return { rates, date: date?.toISOString().slice(0, 10) ?? null };
}

/** A euro amount in the visitor's currency, or null when there's no rate yet. */
export async function fromEuros(cents: number, to: Currency) {
  if (to === "EUR") return cents;
  return convertCents(cents, "EUR", to, (await siteRates()).rates);
}
