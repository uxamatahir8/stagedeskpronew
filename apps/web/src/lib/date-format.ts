import type { createFormatter } from "next-intl";
import { type DatePrefs, formatDateTime } from "@stagedesk/core";

type Formatter = ReturnType<typeof createFormatter>;

/**
 * next-intl's formatter with the viewer's date and time preferences applied
 * to dateTime(): their timezone, 12/24-hour clock and date pattern. Call
 * sites keep passing the parts they want (day, month, hour…) as before.
 */
export function withDatePrefs<F extends Formatter>(format: F, prefs: DatePrefs, locale: string): F {
  const dateTime = (value: Date | number, options?: string | Intl.DateTimeFormatOptions) =>
    typeof options === "string"
      ? format.dateTime(value, options)
      : formatDateTime(value, options ?? { day: "numeric", month: "short", year: "numeric" }, prefs, locale);
  return { ...format, dateTime: dateTime as F["dateTime"] };
}
