import "server-only";

export const appUrl = process.env.BETTER_AUTH_URL ?? process.env.APP_URL ?? "http://localhost:3000";

/** Absolute app URL in a language: Dutch has no prefix, English lives under /en. */
export function absoluteUrl(locale: string, path: string) {
  return `${appUrl}${locale === "en" ? "/en" : ""}${path}`;
}

/** Sends email in the background so the visitor never waits on the mail server. */
export function deliver(task: Promise<unknown>) {
  task.catch((error: unknown) => console.error("[mail] delivery failed", error));
}

export const userLocale = (locale: string | null | undefined): "nl" | "en" => (locale === "en" ? "en" : "nl");
