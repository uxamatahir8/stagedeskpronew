import "server-only";
import { getFormatter as getIntlFormatter, getLocale } from "next-intl/server";
import { withDatePrefs } from "./date-format";
import { viewerDatePrefs } from "./date-prefs";

/**
 * The formatter for signed-in pages: dates and times follow the viewer's
 * timezone and format settings. Public, cached pages keep next-intl's own.
 */
export async function getFormatter() {
  const [format, locale, prefs] = await Promise.all([getIntlFormatter(), getLocale(), viewerDatePrefs()]);
  return withDatePrefs(format, prefs, locale);
}
