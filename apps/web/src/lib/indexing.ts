/**
 * Whether search engines may index this deployment. Staging (an address that
 * starts with "staging.") and any server with SITE_NOINDEX=true are kept out:
 * robots.txt disallows everything, the sitemap is empty and every response
 * says X-Robots-Tag: noindex (next.config.ts). No server-only guard: next.config uses it too.
 */
export function indexingAllowed(env: Record<string, string | undefined> = process.env) {
  if (env["SITE_NOINDEX"] === "true") return false;
  const url = env["APP_URL"] ?? env["BETTER_AUTH_URL"] ?? "";
  try {
    return !new URL(url).hostname.startsWith("staging.");
  } catch {
    return true;
  }
}
