import { defineRouting } from "next-intl/routing";
import { defaultLocale, locales } from "@stagedesk/core";

// English is the default and has no prefix (/app); Dutch lives under /nl (/nl/app).
// No automatic switching by browser language: everyone starts in English and
// picks another language with the switcher.
export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: "as-needed",
  localeDetection: false,
});

export type Locale = (typeof routing.locales)[number];
