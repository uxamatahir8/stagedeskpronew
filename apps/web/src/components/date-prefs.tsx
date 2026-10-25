"use client";

import { createContext, useContext, useMemo } from "react";
import { useFormatter as useIntlFormatter, useLocale } from "next-intl";
import { type DatePrefs, defaultDatePrefs } from "@stagedesk/core";
import { withDatePrefs } from "@/lib/date-format";

const DatePrefsContext = createContext<DatePrefs>(defaultDatePrefs);

/** Hands the viewer's date and time settings to client components inside the app. */
export function DatePrefsProvider({ prefs, children }: { prefs: DatePrefs; children: React.ReactNode }) {
  return <DatePrefsContext.Provider value={prefs}>{children}</DatePrefsContext.Provider>;
}

export const useDatePrefs = () => useContext(DatePrefsContext);

/** next-intl's useFormatter with the viewer's timezone, clock and date pattern applied. */
export function useFormatter() {
  const format = useIntlFormatter();
  const prefs = useDatePrefs();
  const locale = useLocale();
  return useMemo(() => withDatePrefs(format, prefs, locale), [format, prefs, locale]);
}
