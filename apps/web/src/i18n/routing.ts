import { defineRouting } from "next-intl/routing";

// Dutch is the default and has no prefix (/app); English lives under /en (/en/app).
export const routing = defineRouting({
  locales: ["nl", "en"],
  defaultLocale: "nl",
  localePrefix: "as-needed",
});

export type Locale = (typeof routing.locales)[number];
