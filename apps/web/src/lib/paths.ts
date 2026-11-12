import { localePrefix, safeRedirectPath } from "@stagedesk/core";

/** Adds the locale prefix (none for English) to an app path, for URLs built outside next-intl's Link. */
export function localePath(locale: string, path: string) {
  return `${localePrefix(locale)}${path}`;
}

/** Accepts only same-site paths like "/app/team", so `?next=` can't redirect off-site (rules in core). */
export function safeNext(value: string | null | undefined, fallback = "/app") {
  return safeRedirectPath(value) ?? fallback;
}
