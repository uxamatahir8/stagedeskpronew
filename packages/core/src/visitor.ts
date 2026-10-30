import { type Currency, currencies } from "./currency";
import type { AppLocale } from "./locale";

/**
 * First guesses for a visitor who hasn't chosen yet: Dutch for visitors in
 * the Netherlands, English for everyone else; prices in their own country's
 * currency when it's offered. The country comes from the edge (Cloudflare,
 * Vercel, CloudFront or a reverse proxy adding a header); without one, the
 * browser's language list stands in.
 */

/** The language someone chose (or was given on their first visit); the language switchers update it. */
export const LOCALE_COOKIE = "visitor_locale";

/** Country headers set by common CDNs and proxies, most specific first. */
const countryHeaders = ["cf-ipcountry", "x-vercel-ip-country", "cloudfront-viewer-country", "x-country-code", "x-geo-country"];

/** The visitor's country (ISO 3166 alpha-2, upper case), or null when no edge told us. */
export function visitorCountry(header: (name: string) => string | null | undefined): string | null {
  for (const name of countryHeaders) {
    const value = header(name)?.trim().toUpperCase();
    // Cloudflare answers XX for unknown and T1 for Tor.
    if (value && /^[A-Z]{2}$/.test(value) && value !== "XX" && value !== "T1") return value;
  }
  return null;
}

/** The languages in an Accept-Language header, most wanted first: "nl-BE,nl;q=0.9,en;q=0.8" → nl-BE, nl, en. */
export function acceptedLanguages(header: string | null | undefined): { language: string; region: string | null }[] {
  if (!header) return [];
  return header
    .split(",")
    .map((part, index) => {
      const [tag = "", ...params] = part.trim().split(";");
      const q = Number(params.find((p) => p.trim().startsWith("q="))?.trim().slice(2) ?? 1);
      const [language = "", region] = tag.trim().split("-");
      return { language: language.toLowerCase(), region: region && /^[a-z]{2}$/i.test(region) ? region.toUpperCase() : null, q: Number.isFinite(q) ? q : 0, index };
    })
    .filter((l) => /^[a-z]{2,3}$/.test(l.language) && l.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index)
    .map(({ language, region }) => ({ language, region }));
}

/** Countries where Dutch is spoken alongside other languages: the browser's language decides there. */
const partlyDutch = new Set(["BE", "SR", "CW", "AW", "SX"]);

export function visitorLocale(input: { country: string | null; acceptLanguage: string | null | undefined }): AppLocale {
  const browserDutch = acceptedLanguages(input.acceptLanguage)[0]?.language === "nl";
  if (input.country === "NL") return "nl";
  if (input.country) return partlyDutch.has(input.country) && browserDutch ? "nl" : "en";
  return browserDutch ? "nl" : "en";
}

const euroCountries = new Set([
  "AT", "BE", "CY", "DE", "EE", "ES", "FI", "FR", "GR", "HR", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PT", "SI", "SK",
  "AD", "MC", "SM", "VA", "ME", "XK",
]);
/** Countries with their own currency among the ones StageDesk can show. */
const countryCurrency: Record<string, Currency> = {
  US: "USD", GB: "GBP", CH: "CHF", LI: "CHF", SE: "SEK", NO: "NOK", DK: "DKK", PL: "PLN", CZ: "CZK", CA: "CAD", AU: "AUD",
  PK: "PKR", IN: "INR", AE: "AED", SA: "SAR", TR: "TRY", NZ: "NZD", ZA: "ZAR", SG: "SGD", HK: "HKD", MX: "MXN", BR: "BRL",
};

/** The currency of a country, if StageDesk knows one for it. */
export function currencyForCountry(country: string | null): Currency | null {
  if (!country) return null;
  if (euroCountries.has(country)) return "EUR";
  return countryCurrency[country] ?? null;
}

/**
 * Prices in the visitor's own currency when the platform offers it, else euros.
 * Without a country, the region in the browser's language ("en-GB") is used.
 */
export function visitorCurrency(input: { country: string | null; acceptLanguage: string | null | undefined }, offered: readonly string[]): Currency {
  const country = input.country ?? acceptedLanguages(input.acceptLanguage).find((l) => l.region)?.region ?? null;
  const guess = currencyForCountry(country);
  return guess && offered.includes(guess) && (currencies as readonly string[]).includes(guess) ? guess : "EUR";
}

/** Search engines and link previews: they always get the address they asked for. */
export function isCrawler(userAgent: string | null | undefined) {
  return !!userAgent && /bot|crawl|spider|slurp|facebookexternalhit|embedly|preview|lighthouse|headless/i.test(userAgent);
}
