import { cn } from "@/lib/utils";

/** "2027-06" → the 6 weeks (Monday first) covering that month, as "YYYY-MM-DD" strings. */
export function monthDays(month: string) {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const first = new Date(Date.UTC(y, m - 1, 1));
  const offset = (first.getUTCDay() + 6) % 7; // Monday = 0
  return Array.from({ length: 42 }, (_, i) => new Date(Date.UTC(y, m - 1, 1 - offset + i)).toISOString().slice(0, 10));
}

export function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

/** Month calendar laid out as a 7-column grid; each day renders its own content. */
export function MonthGrid({
  month,
  today,
  weekdays,
  renderDay,
  dayClassName,
}: {
  month: string;
  today: string;
  weekdays: string[];
  renderDay: (date: string) => React.ReactNode;
  dayClassName?: (date: string) => string | undefined;
}) {
  const days = monthDays(month);
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[640px] grid-cols-7 overflow-hidden rounded-xl border bg-border [gap:1px]">
        {weekdays.map((d) => (
          <div key={d} className="bg-muted px-2 py-1.5 text-xs font-medium text-muted-foreground">
            {d}
          </div>
        ))}
        {days.map((date) => {
          const inMonth = date.startsWith(month);
          return (
            <div
              key={date}
              className={cn("min-h-24 bg-card p-1.5", !inMonth && "bg-muted/40 text-muted-foreground", dayClassName?.(date))}
            >
              <div
                className={cn(
                  "mb-1 flex size-6 items-center justify-center rounded-full text-xs tabular-nums",
                  date === today && "bg-primary font-semibold text-primary-foreground",
                )}
              >
                {Number(date.slice(8))}
              </div>
              {renderDay(date)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Weekday names, Monday first, in the given locale. */
export function weekdayNames(locale: string) {
  const fmt = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "nl-NL", { weekday: "short", timeZone: "UTC" });
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(Date.UTC(2024, 0, 1 + i))));
}
