/**
 * How dates and times are shown. The platform sets the defaults, an agency
 * can choose its own, and each person can override both for themselves.
 */
export const dateFormats = ["locale", "dd-mm-yyyy", "dd/mm/yyyy", "mm/dd/yyyy", "yyyy-mm-dd", "d mmm yyyy", "mmm d, yyyy"] as const;
export type DateFormat = (typeof dateFormats)[number];

export const timeFormats = ["24h", "12h"] as const;
export type TimeFormat = (typeof timeFormats)[number];

export type DatePrefs = { timeZone: string; dateFormat: DateFormat; timeFormat: TimeFormat };

export const defaultDatePrefs: DatePrefs = { timeZone: "Europe/Amsterdam", dateFormat: "locale", timeFormat: "24h" };

/** Partial preferences as stored on an agency or a person; null means "use the level above". */
export type DatePrefsLayer = { timeZone?: string | null; dateFormat?: string | null; timeFormat?: string | null } | null | undefined;

export function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const isDateFormat = (v: unknown): v is DateFormat => dateFormats.includes(v as DateFormat);
export const isTimeFormat = (v: unknown): v is TimeFormat => timeFormats.includes(v as TimeFormat);

/** Every IANA timezone the runtime knows, falling back to a short list on old runtimes. */
export function timeZones(): string[] {
  const all = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  return all.length ? [...new Set(["UTC", ...all])] : ["UTC", "Europe/Amsterdam", "Europe/London", "Europe/Berlin", "America/New_York", "Asia/Karachi"];
}

/** The first valid value from the most specific layer wins (person, then agency, then platform). */
export function resolveDatePrefs(...layers: DatePrefsLayer[]): DatePrefs {
  const out = { ...defaultDatePrefs };
  for (const layer of [...layers].reverse()) {
    if (!layer) continue;
    if (layer.timeZone && isTimeZone(layer.timeZone)) out.timeZone = layer.timeZone;
    if (isDateFormat(layer.dateFormat)) out.dateFormat = layer.dateFormat;
    if (isTimeFormat(layer.timeFormat)) out.timeFormat = layer.timeFormat;
  }
  return out;
}

/** "UTC+05:00"-style offset of a timezone at a moment, for labels in a picker. */
export function timeZoneOffset(timeZone: string, at = new Date()): string {
  const part = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" }).formatToParts(at).find((p) => p.type === "timeZoneName");
  const raw = part?.value ?? "GMT";
  return raw === "GMT" ? "UTC+00:00" : raw.replace("GMT", "UTC");
}

/**
 * Formats like Intl.DateTimeFormat, with the person's preferences applied:
 * their timezone (unless the caller pins one, as date-only values do with UTC),
 * their 12/24-hour clock, and, for full dates, their chosen date pattern.
 */
export function formatDateTime(date: Date | number, options: Intl.DateTimeFormatOptions, prefs: DatePrefs, locale: string): string {
  const timeZone = options.timeZone ?? prefs.timeZone;
  const hasTime = options.hour !== undefined || options.minute !== undefined || options.timeStyle !== undefined;
  const clock: Intl.DateTimeFormatOptions = options.hour12 !== undefined || options.hourCycle ? {} : { hourCycle: prefs.timeFormat === "12h" ? "h12" : "h23" };
  const hasDate = options.day !== undefined && options.month !== undefined;

  if (!hasDate || prefs.dateFormat === "locale" || options.dateStyle || options.timeStyle) {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone, ...(hasTime ? clock : {}) }).format(date);
  }

  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(date)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value]),
  ) as { year: string; month: string; day: string };
  const { year: y, month: m, day: d } = parts;
  const withYear = options.year !== undefined;
  const monthName = () => new Intl.DateTimeFormat(locale, { timeZone, month: options.month === "long" ? "long" : "short" }).format(date);

  let text: string;
  switch (prefs.dateFormat) {
    case "dd-mm-yyyy":
      text = withYear ? `${d}-${m}-${y}` : `${d}-${m}`;
      break;
    case "dd/mm/yyyy":
      text = withYear ? `${d}/${m}/${y}` : `${d}/${m}`;
      break;
    case "mm/dd/yyyy":
      text = withYear ? `${m}/${d}/${y}` : `${m}/${d}`;
      break;
    case "yyyy-mm-dd":
      text = withYear ? `${y}-${m}-${d}` : `${m}-${d}`;
      break;
    case "d mmm yyyy":
      text = withYear ? `${Number(d)} ${monthName()} ${y}` : `${Number(d)} ${monthName()}`;
      break;
    case "mmm d, yyyy":
      text = withYear ? `${monthName()} ${Number(d)}, ${y}` : `${monthName()} ${Number(d)}`;
      break;
  }
  if (options.weekday) text = `${new Intl.DateTimeFormat(locale, { timeZone, weekday: options.weekday }).format(date)} ${text}`;
  if (hasTime) {
    const time = new Intl.DateTimeFormat(locale, { timeZone, hour: options.hour ?? "2-digit", minute: options.minute ?? "2-digit", second: options.second, ...clock }).format(date);
    text = `${text}, ${time}`;
  }
  return text;
}
