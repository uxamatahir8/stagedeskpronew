import { localePrefix } from "@stagedesk/core";
import "server-only";

export { deliver } from "./deliver";

export const appUrl = process.env.BETTER_AUTH_URL ?? process.env.APP_URL ?? "http://localhost:3000";

/** Absolute app URL in a language: English has no prefix, other languages live under their code (/nl). */
export function absoluteUrl(locale: string, path: string) {
  return `${appUrl}${localePrefix(locale)}${path}`;
}

export const userLocale = (locale: string | null | undefined): "nl" | "en" => (locale === "nl" ? "nl" : "en");
