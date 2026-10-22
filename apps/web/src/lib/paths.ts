/** Adds the locale prefix (none for Dutch) to an app path, for URLs built outside next-intl's Link. */
export function localePath(locale: string, path: string) {
  return `${locale === "en" ? "/en" : ""}${path}`;
}

/** Accepts only same-site paths like "/app/team", so `?next=` can't redirect off-site. */
export function safeNext(value: string | null | undefined, fallback = "/app") {
  return value && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : fallback;
}
