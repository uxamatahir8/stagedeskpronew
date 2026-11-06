import { chosenLocale, LOCALE_COOKIE } from "@stagedesk/core";

/** Saves a language someone picked, which the proxy's detection never overrides. */
export function rememberLocale(locale: string) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${365 * 86_400}; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;
}

/** The language this visitor picked, or null when it's being detected. */
export function savedLocale() {
  return chosenLocale(document.cookie.match(new RegExp(`(?:^|; )${LOCALE_COOKIE}=([^;]*)`))?.[1]);
}

/** Drops that choice: from the next page load the language is detected again. */
export function forgetLocale() {
  document.cookie = `${LOCALE_COOKIE}=; path=/; max-age=0; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;
}
