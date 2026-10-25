import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { platformDatePrefs } from "@/lib/date-prefs";
import { mergeTexts, textOverrides } from "@/lib/site-texts";
import { routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  const [messages, overrides, dates] = await Promise.all([import(`../../messages/${locale}.json`).then((m) => m.default), textOverrides(locale), platformDatePrefs()]);

  return {
    locale,
    // The platform default; signed-in pages apply the viewer's own (lib/formatter).
    timeZone: dates.timeZone,
    // Texts changed in the admin panel (Website texts) win over the files.
    messages: mergeTexts(messages, overrides),
  };
});
