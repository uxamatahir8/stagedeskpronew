/**
 * An event's start and end as shown everywhere ("20:00 – 01:00 (+1 day)").
 * An end at or before the start is the next morning: overnight events are
 * normal for parties, so it's marked rather than refused. `nextDay` is the
 * translated mark, e.g. "(+1 day)".
 */
export function eventTimeRange(start: string | null | undefined, end: string | null | undefined, nextDay: string, separator = " – "): string | null {
  if (!start) return null;
  if (!end) return start;
  return `${start}${separator}${end}${endsNextDay(start, end) ? ` ${nextDay}` : ""}`;
}

/** Whether an end time ("HH:MM") falls on the day after the start. */
export function endsNextDay(start: string, end: string) {
  return end <= start;
}
