"use client";

import { TableIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useId, useState } from "react";
import { cn } from "@/lib/utils";

export interface ColumnSeries {
  key: string;
  label: string;
  /** A chart token, e.g. "var(--chart-1)". Validated for both themes. */
  color: string;
}

export interface ColumnPoint {
  /** "YYYY-MM" */
  month: string;
  values: number[];
}

/**
 * A clean tick step so four steps cover the data: 1, 2, 2.5 or 5 times a
 * power of ten (counts skip 2.5 and never go below 1, so ticks are whole).
 */
function niceStep(max: number, whole: boolean) {
  const raw = Math.max(max / 4, 1);
  const power = 10 ** Math.floor(Math.log10(raw));
  const factors = whole && power === 1 ? [1, 2, 5, 10] : [1, 2, 2.5, 5, 10];
  return factors.find((f) => f * power >= raw)! * power;
}

/**
 * Grouped columns over months, one baseline, one axis. Hover (or focus) a
 * month for its values; "Table" shows the same numbers as a table.
 */
export function ColumnChart({
  series,
  data,
  unit,
  height = 200,
  label,
}: {
  series: ColumnSeries[];
  data: ColumnPoint[];
  unit: "cents" | "count";
  height?: number;
  /** What the chart shows, for screen readers and the table caption. */
  label: string;
}) {
  const t = useTranslations("charts");
  const format = useFormatter();
  const id = useId();
  const [active, setActive] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);

  const empty = data.every((d) => d.values.every((v) => v === 0));
  // Money is in cents; steps are chosen in euros so ticks read €0 / €2.5K / €5K.
  const scale = unit === "cents" ? 100 : 1;
  const step = niceStep(Math.max(0, ...data.flatMap((d) => d.values)) / scale, unit === "count") * scale;
  const max = step * 4;
  // An empty chart only gets its baseline, not a column of zeros.
  const ticks = empty ? [0] : [0, 1, 2, 3, 4].map((i) => i * step);
  const value = (v: number, compact = false) =>
    unit === "cents"
      ? format.number(v / 100, { style: "currency", currency: "EUR", maximumFractionDigits: 0, ...(compact ? { notation: "compact" } : {}) })
      : format.number(v, compact ? { notation: "compact" } : {});
  const month = (m: string, style: "short" | "long") =>
    format.dateTime(new Date(`${m}-15T12:00:00Z`), style === "short" ? { month: "short" } : { month: "long", year: "numeric" });
  return (
    <figure className="grid gap-3" aria-labelledby={`${id}-caption`}>
      <figcaption id={`${id}-caption`} className="sr-only">
        {label}
      </figcaption>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {series.length > 1 ? (
          <ul className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            {series.map((s) => (
              <li key={s.key} className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm" style={{ background: s.color }} aria-hidden />
                {s.label}
              </li>
            ))}
          </ul>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={() => setAsTable((x) => !x)}
          aria-pressed={asTable}
          className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <TableIcon className="size-3.5" aria-hidden />
          {asTable ? t("showChart") : t("showTable")}
        </button>
      </div>

      {asTable ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-1 pr-4 font-medium">{t("month")}</th>
                {series.map((s) => (
                  <th key={s.key} className="py-1 pr-4 text-right font-medium">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.month} className="border-t">
                  <td className="py-1 pr-4">{month(d.month, "long")}</td>
                  {d.values.map((v, i) => (
                    <td key={series[i]!.key} className="py-1 pr-4 text-right tabular-nums">
                      {value(v)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 pt-2">
          {/* Y axis: clean, compact ticks */}
          <div className="relative w-11 text-right text-[11px] text-muted-foreground tabular-nums" style={{ height }}>
            {ticks.map((tick) => (
              <span key={tick} className="absolute right-0 -translate-y-1/2 leading-none" style={{ bottom: `${(tick / max) * 100}%` }}>
                {value(tick, true)}
              </span>
            ))}
          </div>
          <div className="relative" style={{ height }} onMouseLeave={() => setActive(null)}>
            {ticks.map((tick) => (
              <div key={tick} className="absolute inset-x-0 border-t border-border/70" style={{ bottom: `${(tick / max) * 100}%` }} aria-hidden />
            ))}
            {empty && <p className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">{t("noData")}</p>}
            <div className="absolute inset-0 flex">
              {data.map((d, i) => (
                <button
                  key={d.month}
                  type="button"
                  className={cn("relative flex flex-1 items-end justify-center gap-0.5 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring", active === i && "bg-muted/60")}
                  onMouseEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                  aria-label={`${month(d.month, "long")}: ${d.values.map((v, j) => `${series[j]!.label} ${value(v)}`).join(", ")}`}
                >
                  {d.values.map((v, j) => (
                    <span
                      key={series[j]!.key}
                      className="w-full max-w-6 rounded-t-[4px]"
                      style={{ height: `${(v / max) * 100}%`, minHeight: v > 0 ? 2 : 0, background: series[j]!.color }}
                    />
                  ))}
                  {active === i && (
                    <span
                      role="tooltip"
                      className={cn(
                        "pointer-events-none absolute bottom-full z-10 mb-2 grid min-w-36 gap-1 rounded-lg border bg-popover px-3 py-2 text-left text-xs text-popover-foreground shadow-md",
                        i > data.length / 2 ? "right-0" : "left-0",
                      )}
                    >
                      <span className="font-medium">{month(d.month, "long")}</span>
                      {d.values.map((v, j) => (
                        <span key={series[j]!.key} className="flex items-center justify-between gap-3">
                          <span className="flex items-center gap-1.5 text-muted-foreground">
                            <span className="size-2 rounded-sm" style={{ background: series[j]!.color }} aria-hidden />
                            {series[j]!.label}
                          </span>
                          <span className="font-medium tabular-nums">{value(v)}</span>
                        </span>
                      ))}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
          <span />
          <div className="mt-1.5 flex text-[11px] text-muted-foreground">
            {data.map((d) => (
              <span key={d.month} className="flex-1 text-center">
                {month(d.month, "short")}
              </span>
            ))}
          </div>
        </div>
      )}
    </figure>
  );
}
