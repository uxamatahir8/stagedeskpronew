/**
 * The platform's languages. English is the default and has no URL prefix
 * (/app); every other language lives under its code (/nl/app). Add a language
 * here (and its messages file) to offer it.
 */
export const locales = ["en", "nl"] as const;
export type AppLocale = (typeof locales)[number];
export const defaultLocale: AppLocale = "en";

/** "" for the default language, "/nl" for Dutch: put it in front of an app path. */
export function localePrefix(locale: string | null | undefined) {
  return !locale || locale === defaultLocale || !(locales as readonly string[]).includes(locale) ? "" : `/${locale}`;
}

/** A stored or requested language, falling back to the default. */
export function toLocale(locale: string | null | undefined): AppLocale {
  return (locales as readonly string[]).includes(locale ?? "") ? (locale as AppLocale) : defaultLocale;
}
