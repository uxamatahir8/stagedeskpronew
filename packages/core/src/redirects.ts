/**
 * A same-site path to send someone to after signing in (`?next=`), or null.
 * Browsers drop tabs and newlines from URLs and read "\" as "/", so
 * "/\t/evil.example" becomes "//evil.example", another site: anything with
 * control characters or backslashes is refused, and what's left must stay on
 * the site when resolved.
 */
export function safeRedirectPath(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return null;
  const base = "http://stagedesk.invalid";
  try {
    return new URL(value, base).origin === base ? value : null;
  } catch {
    return null;
  }
}
