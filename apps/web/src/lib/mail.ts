import "server-only";

export { deliver } from "./deliver";

export const appUrl = process.env.BETTER_AUTH_URL ?? process.env.APP_URL ?? "http://localhost:3000";

/** Absolute app URL in a language: Dutch has no prefix, English lives under /en. */
export function absoluteUrl(locale: string, path: string) {
  return `${appUrl}${locale === "en" ? "/en" : ""}${path}`;
}

export const userLocale = (locale: string | null | undefined): "nl" | "en" => (locale === "en" ? "en" : "nl");
