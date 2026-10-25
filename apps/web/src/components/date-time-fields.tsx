"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { type DatePrefs, dateFormats, formatDateTime, timeFormats, timeZoneOffset, timeZones } from "@stagedesk/core";
import { FormField } from "@/components/form-field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** "" means "use the default" (the agency's or the platform's). */
export type DatePrefsInput = { timeZone: string; dateFormat: string; timeFormat: string };

const INHERIT = "";

/** "UTC+05:30" → 330, for ordering the timezone list west to east. */
const minutes = (offset: string) => {
  const m = /([+-])(\d{2}):(\d{2})/.exec(offset);
  return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
};

/**
 * Timezone, date format and clock pickers with a live example. Posts
 * timeZone / dateFormat / timeFormat in forms, and reports changes for
 * controlled forms. With `inherited`, each field can follow that default.
 */
export function DateTimeFields({
  idPrefix,
  initial,
  inherited,
  onChange,
}: {
  idPrefix: string;
  initial: DatePrefsInput;
  /** The preferences that apply when a field is left on "default". */
  inherited?: DatePrefs;
  onChange?: (value: DatePrefsInput) => void;
}) {
  const t = useTranslations("dateTime");
  const locale = useLocale();
  const [value, setValue] = useState(initial);
  const [now] = useState(() => new Date());
  const set = (patch: Partial<DatePrefsInput>) => {
    const next = { ...value, ...patch };
    setValue(next);
    onChange?.(next);
  };

  const zones = useMemo(
    () =>
      timeZones()
        .map((z) => ({ zone: z, offset: timeZoneOffset(z, now) }))
        .sort((a, b) => minutes(a.offset) - minutes(b.offset) || a.zone.localeCompare(b.zone)),
    [now],
  );
  const effective: DatePrefs = {
    timeZone: value.timeZone || inherited?.timeZone || "UTC",
    dateFormat: (value.dateFormat || inherited?.dateFormat || "locale") as DatePrefs["dateFormat"],
    timeFormat: (value.timeFormat || inherited?.timeFormat || "24h") as DatePrefs["timeFormat"],
  };
  const sampleDate = (f: DatePrefs["dateFormat"]) => formatDateTime(now, { day: "numeric", month: "short", year: "numeric" }, { ...effective, dateFormat: f }, locale);
  const sampleTime = (f: DatePrefs["timeFormat"]) => formatDateTime(now, { hour: "2-digit", minute: "2-digit" }, { ...effective, timeFormat: f }, locale);
  const zoneLabel = (z: string) => `(${timeZoneOffset(z, now)}) ${z.replaceAll("_", " ")}`;
  const preview = formatDateTime(now, { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }, effective, locale);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField id={`${idPrefix}-tz`} label={t("timeZone")} hint={t("timeZoneHint")} className="sm:col-span-2">
        <Select name="timeZone" value={value.timeZone} onValueChange={(v) => set({ timeZone: v })}>
          <SelectTrigger id={`${idPrefix}-tz`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {inherited && <SelectItem value={INHERIT}>{t("useDefault", { value: zoneLabel(inherited.timeZone) })}</SelectItem>}
            {zones.map(({ zone, offset }) => (
              <SelectItem key={zone} value={zone} textValue={zone}>
                <span className="w-24 shrink-0 font-mono text-xs text-muted-foreground tabular-nums">{offset}</span>
                <span className="truncate">{zone.replaceAll("_", " ")}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>
      <FormField id={`${idPrefix}-df`} label={t("dateFormat")}>
        <Select name="dateFormat" value={value.dateFormat} onValueChange={(v) => set({ dateFormat: v })}>
          <SelectTrigger id={`${idPrefix}-df`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {inherited && <SelectItem value={INHERIT}>{t("useDefault", { value: sampleDate(inherited.dateFormat) })}</SelectItem>}
            {dateFormats.map((f) => (
              <SelectItem key={f} value={f} textValue={f}>
                <span className="tabular-nums">{sampleDate(f)}</span>
                <span className="text-xs text-muted-foreground">{f === "locale" ? t("languageDefault") : f.toUpperCase()}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>
      <FormField id={`${idPrefix}-tf`} label={t("timeFormat")}>
        <Select name="timeFormat" value={value.timeFormat} onValueChange={(v) => set({ timeFormat: v })}>
          <SelectTrigger id={`${idPrefix}-tf`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {inherited && <SelectItem value={INHERIT}>{t("useDefault", { value: sampleTime(inherited.timeFormat) })}</SelectItem>}
            {timeFormats.map((f) => (
              <SelectItem key={f} value={f}>
                {t(`clock_${f}`)} <span className="text-muted-foreground tabular-nums">· {sampleTime(f)}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>
      <p className="text-sm text-muted-foreground sm:col-span-2">
        {t("preview")} <span className="font-medium text-foreground tabular-nums" suppressHydrationWarning>
          {preview}
        </span>
      </p>
    </div>
  );
}
