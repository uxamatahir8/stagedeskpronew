import { LOCALE_COOKIE } from "@stagedesk/core";

/** Saves a language someone picked, so the proxy's first-visit guess never overrides it. */
export function rememberLocale(locale: string) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${365 * 86_400}; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;
}
