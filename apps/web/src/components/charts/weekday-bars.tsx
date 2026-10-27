import { getFormatter, getTranslations } from "next-intl/server";

/**
 * Seven columns, Monday first, for "on which day do events happen". One hue
 * (it's a magnitude); the busiest day is marked with its value. A table with
 * the same numbers is there for screen readers.
 */
export async function WeekdayBars({ data, label }: { data: { key: string; value: number }[]; label: string }) {
  const [format, t] = await Promise.all([getFormatter(), getTranslations("charts")]);
  // 2024-01-01 was a Monday.
  const day = (i: number, style: "short" | "long") => format.dateTime(new Date(Date.UTC(2024, 0, 1 + i, 12)), { weekday: style, timeZone: "UTC" });
  const max = Math.max(1, ...data.map((d) => d.value));
  const peak = data.reduce((best, d) => (d.value > best.value ? d : best), data[0] ?? { key: "0", value: 0 });
  const empty = data.every((d) => d.value === 0);

  if (empty) return <p className="py-10 text-center text-sm text-muted-foreground">{t("noData")}</p>;
  return (
    <figure className="grid gap-2">
      <div className="flex h-40 items-end gap-2" aria-hidden>
        {data.map((d, i) => (
          <div key={d.key} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <span className="text-[11px] text-muted-foreground tabular-nums">{d === peak ? format.number(d.value) : ""}</span>
            <div
              className="w-full max-w-10 rounded-t-[4px]"
              style={{ height: `${Math.max(2, (d.value / max) * 100)}%`, background: "var(--chart-1)", opacity: d === peak ? 1 : 0.55 }}
              title={`${day(i, "long")}: ${d.value}`}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-2 border-t pt-1.5" aria-hidden>
        {data.map((d, i) => (
          <span key={d.key} className="flex-1 text-center text-xs text-muted-foreground">
            {day(i, "short")}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>{label}</caption>
        <tbody>
          {data.map((d, i) => (
            <tr key={d.key}>
              <th scope="row">{day(i, "long")}</th>
              <td>{d.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
