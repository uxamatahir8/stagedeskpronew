"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useLocale, useTranslations } from "next-intl";
import flatpickr from "flatpickr";
import { english } from "flatpickr/dist/l10n/default";
import { Dutch } from "flatpickr/dist/l10n/nl";
import { CalendarClockIcon, CalendarIcon, ClockIcon } from "lucide-react";
import type { DatePrefs } from "@stagedesk/core";
import { useDatePrefs } from "@/components/date-prefs";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type DatePickerMode = "date" | "time" | "datetime";

type Locale = flatpickr.CustomLocale;

// The typings leave out the locale argument the static helpers take at runtime.
const formatWith = flatpickr.formatDate as (date: Date, format: string, locale: Locale) => string;
const parseWith = flatpickr.parseDate as (date: string, format: string, timeless: boolean, locale: Locale) => Date | undefined;

const locales: Record<string, Locale> = {
  nl: Dutch,
  en: { ...english, firstDayOfWeek: 1 },
};

/** The viewer's date pattern in flatpickr tokens; "locale" follows how each language writes a short date. */
function dateTokens(format: DatePrefs["dateFormat"], lang: string) {
  switch (format) {
    case "dd-mm-yyyy":
      return "d-m-Y";
    case "dd/mm/yyyy":
      return "d/m/Y";
    case "mm/dd/yyyy":
      return "m/d/Y";
    case "yyyy-mm-dd":
      return "Y-m-d";
    case "d mmm yyyy":
      return "j M Y";
    case "mmm d, yyyy":
      return "M j, Y";
    default:
      return lang === "en" ? "M j, Y" : "j M Y";
  }
}

function displayFormat(mode: DatePickerMode, prefs: DatePrefs, lang: string) {
  const time = prefs.timeFormat === "12h" ? "h:i K" : "H:i";
  if (mode === "time") return time;
  const date = dateTokens(prefs.dateFormat, lang);
  return mode === "date" ? date : `${date} ${time}`;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** The value forms post, as the native inputs did: 2026-10-26, 14:30 or 2026-10-26T14:30. */
function toValue(d: Date, mode: DatePickerMode) {
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return mode === "date" ? date : mode === "time" ? time : `${date}T${time}`;
}

function fromValue(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const m = /^(?:(\d{4})-(\d{2})-(\d{2}))?(?:[T ]?(\d{2}):(\d{2}))?$/.exec(value);
  if (!m || (!m[1] && !m[4])) return undefined;
  const d = m[1] ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date();
  d.setHours(m[4] ? Number(m[4]) : 0, m[5] ? Number(m[5]) : 0, 0, 0);
  return d;
}

/**
 * A flatpickr date, time or date-and-time field. Typing works too, in the
 * viewer's date pattern or as 2026-10-26. With `name`, a hidden input posts
 * the value in the native formats (yyyy-mm-dd, HH:mm, yyyy-mm-ddTHH:mm), and
 * `value`/`onChange` use the same strings. Other props go to the visible input,
 * so `id`, `required` and `aria-*` work with FormField as before.
 */
export function DatePicker({
  mode = "date",
  name,
  value,
  defaultValue,
  onChange,
  min,
  max,
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "type" | "value" | "defaultValue" | "onChange" | "min" | "max"> & {
  mode?: DatePickerMode;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  min?: string;
  max?: string;
}) {
  const t = useTranslations("datePicker");
  const lang = useLocale();
  const prefs = useDatePrefs();
  const locale = locales[lang] ?? locales.en;
  const format = displayFormat(mode, prefs, lang);

  const inputRef = useRef<HTMLInputElement>(null);
  const fpRef = useRef<flatpickr.Instance>(null);
  const [own, setOwn] = useState(defaultValue ?? "");
  const current = value ?? own;
  const [initialText] = useState(() => {
    const d = fromValue(current);
    return d ? formatWith(d, format, locale) : "";
  });

  const initial = useEffectEvent(() => ({
    defaultDate: fromValue(current),
    ...(mode === "time"
      ? { minTime: min, maxTime: max }
      : { minDate: fromValue(min), maxDate: fromValue(max) }),
  }));
  const changed = useEffectEvent((d: Date | undefined, sync = true) => {
    const next = d ? toValue(d, mode) : "";
    if (next === current) return;
    const apply = () => {
      setOwn(next);
      onChange?.(next);
    };
    // Synchronously, so the hidden input is current when Enter or a click submits the form right after.
    if (sync) flushSync(apply);
    else apply();
  });
  // The value last handed to flatpickr, so only real changes of `value` move the calendar.
  const shown = useRef(value);

  useEffect(() => {
    const input = inputRef.current!;
    const closeOnEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Ahead of Radix, so Escape closes the calendar and not the dialog around it.
      e.stopPropagation();
      const fp = fpRef.current!;
      if (fp.calendarContainer.contains(document.activeElement)) input.focus();
      fp.close();
    };
    const fp = flatpickr(input, {
      locale,
      dateFormat: format,
      allowInput: true,
      disableMobile: true,
      enableTime: mode !== "date",
      noCalendar: mode === "time",
      time_24hr: prefs.timeFormat !== "12h",
      minuteIncrement: 5,
      ...initial(),
      // Inside a dialog the calendar must be part of it, or Radix treats clicks on it as outside clicks.
      appendTo: input.closest<HTMLElement>('[role="dialog"]') ?? undefined,
      position: place,
      parseDate: (text, tokens) => fromValue(text.trim()) ?? parseWith(text.trim(), tokens, mode === "date", locale) ?? new Date(NaN),
      onChange: ([d]) => changed(d),
      onOpen: () => window.addEventListener("keydown", closeOnEscape, true),
      onClose: () => window.removeEventListener("keydown", closeOnEscape, true),
    });
    fpRef.current = fp;
    // Text typed before hydration: flatpickr parses what's in the field without reporting a change.
    if (fp.selectedDates[0]) changed(fp.selectedDates[0], false);
    return () => {
      window.removeEventListener("keydown", closeOnEscape, true);
      fp.destroy();
      fpRef.current = null;
    };
  }, [mode, format, locale, prefs.timeFormat]);

  useEffect(() => {
    if (mode === "time") fpRef.current?.set({ minTime: min, maxTime: max });
    else fpRef.current?.set({ minDate: fromValue(min), maxDate: fromValue(max) });
  }, [mode, min, max]);

  useEffect(() => {
    const fp = fpRef.current;
    if (!fp || value === undefined || value === shown.current) return;
    shown.current = value;
    const selected = fp.selectedDates[0];
    if ((selected ? toValue(selected, mode) : "") === value) return;
    const d = fromValue(value);
    if (d) fp.setDate(d, false);
    else fp.clear(false);
  }, [value, mode]);

  const Icon = mode === "time" ? ClockIcon : mode === "datetime" ? CalendarClockIcon : CalendarIcon;
  return (
    <div className={cn("relative", className)}>
      <Input
        ref={inputRef}
        autoComplete="off"
        placeholder={t(mode)}
        defaultValue={initialText}
        className="pr-8"
        {...props}
      />
      <Icon className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      {name && <input type="hidden" name={name} value={current} />}
    </div>
  );
}

/**
 * Below the field, or above it when there is no room, kept inside the viewport.
 * Coordinates are relative to the calendar's container: the page, or the
 * dialog it was appended to.
 */
function place(fp: flatpickr.Instance) {
  const cal = fp.calendarContainer;
  const host = cal.parentElement;
  if (!host) return;
  const field = fp._input.getBoundingClientRect();
  const gap = 4;
  const height = cal.offsetHeight;
  const width = cal.offsetWidth;
  const below = window.innerHeight - field.bottom >= height + gap || field.top < height + gap;
  const top = below ? field.bottom + gap : field.top - height - gap;
  const left = Math.max(8, Math.min(field.left, window.innerWidth - width - 8));
  const origin =
    host === document.body
      ? { top: -window.scrollY, left: -window.scrollX }
      : (() => {
          const r = host.getBoundingClientRect();
          return { top: r.top + host.clientTop - host.scrollTop, left: r.left + host.clientLeft - host.scrollLeft };
        })();
  cal.style.top = `${top - origin.top}px`;
  cal.style.left = `${left - origin.left}px`;
  cal.style.right = "auto";
}
