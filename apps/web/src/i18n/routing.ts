import { defineRouting } from "next-intl/routing";
import { defaultLocale, locales } from "@stagedesk/core";

// English is the default and has no prefix (/app); Dutch lives under /nl (/nl/app).
// next-intl's own detection stays off: the proxy picks Dutch for visitors in the
// Netherlands on their first visit and remembers it (chooseLanguage in proxy.ts),
// and the language switchers overwrite that choice.
export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: "as-needed",
  localeDetection: false,
});

export type Locale = (typeof routing.locales)[number];
