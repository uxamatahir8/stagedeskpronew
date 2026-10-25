"use client";

import { TableIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useFormatter } from "@/components/date-prefs";
import { useId, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * One measure over months as a line with a soft area: crosshair and tooltip
 * on hover or focus, the last point emphasised, and a table view. Ticks are
 * clean steps from zero.
 */
export function AreaTrend({
  data,
  label,
  unit,
  currency = "EUR",
  height = 180,
}: {
  data: { month: string; value: number }[];
  label: string;
  unit: "cents" | "count";
  currency?: string;
  height?: number;
}) {
  const t = useTranslations("charts");
  const format = useFormatter();
  const id = useId();
  const [active, setActive] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  const values = data.map((d) => d.value);
  const empty = values.every((v) => v === 0);
  const scale = unit === "cents" ? 100 : 1;
  const raw = Math.max(1, ...values) / scale / 4;
  const power = 10 ** Math.floor(Math.log10(Math.max(raw, 1)));
  const step = ([1, 2, 2.5, 5, 10].find((f) => f * power >= raw) ?? 10) * power * scale;
  const max = step * 4;
  const value = (v: number, compact = false) =>
    unit === "cents"
      ? format.number(v / 100, { style: "currency", currency, maximumFractionDigits: 0, ...(compact ? { notation: "compact" } : {}) })
      : format.number(v, compact ? { notation: "compact" } : {});
  const month = (m: string, style: "short" | "long") => format.dateTime(new Date(`${m}-15T12:00:00Z`), style === "short" ? { month: "short" } : { month: "long", year: "numeric" });
  const W = 600;
  const x = (i: number) => (data.length === 1 ? W / 2 : (i / (data.length - 1)) * W);
  const y = (v: number) => height - (v / max) * height;
  const line = data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(" ");
  const last = data.length - 1;

  return (
    <figure className="grid gap-3" aria-labelledby={`${id}-c`}>
      <figcaption id={`${id}-c`} className="sr-only">
        {label}
      </figcaption>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setAsTable((v) => !v)}
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
                <th className="py-1 text-right font-medium">{label}</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.month} className="border-t">
                  <td className="py-1 pr-4">{month(d.month, "long")}</td>
                  <td className="py-1 text-right tabular-nums">{value(d.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2">
          <div className="relative w-11 text-right text-[11px] text-muted-foreground tabular-nums" style={{ height }}>
            {[0, 1, 2, 3, 4].map((n) => (
              <span key={n} className="absolute right-0 -translate-y-1/2 leading-none" style={{ bottom: `${n * 25}%` }}>
                {value(n * step, true)}
              </span>
            ))}
          </div>
          <div className="relative" style={{ height }} onMouseLeave={() => setActive(null)}>
            {[0, 1, 2, 3, 4].map((n) => (
              <div key={n} className="absolute inset-x-0 border-t border-border/70" style={{ bottom: `${n * 25}%` }} aria-hidden />
            ))}
            {empty && <p className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">{t("noData")}</p>}
            <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
              {!empty && (
                <>
                  <path d={`${line} L${x(last)},${height} L${x(0)},${height} Z`} fill="var(--chart-1)" fillOpacity={0.12} />
                  <path d={line} fill="none" stroke="var(--chart-1)" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
                </>
              )}
              {active !== null && <line x1={x(active)} x2={x(active)} y1={0} y2={height} stroke="var(--muted-foreground)" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}
            </svg>
            {!empty &&
              data.map((d, i) =>
                i === last || i === active ? (
                  <span
                    key={d.month}
                    className="pointer-events-none absolute size-2.5 -translate-x-1/2 translate-y-1/2 rounded-full border-2 border-card bg-[var(--chart-1)]"
                    style={{ left: `${(x(i) / W) * 100}%`, bottom: `${(d.value / max) * 100}%` }}
                    aria-hidden
                  />
                ) : null,
              )}
            <div className="absolute inset-0 flex">
              {data.map((d, i) => (
                <button
                  key={d.month}
                  type="button"
                  className="relative flex-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onMouseEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                  aria-label={`${month(d.month, "long")}: ${value(d.value)}`}
                >
                  {active === i && (
                    <span
                      role="tooltip"
                      className={cn(
                        "pointer-events-none absolute top-0 z-10 grid min-w-28 gap-0.5 rounded-lg border bg-popover px-3 py-2 text-left text-xs text-popover-foreground shadow-md",
                        i > data.length / 2 ? "right-1/2" : "left-1/2",
                      )}
                    >
                      <span className="text-muted-foreground">{month(d.month, "long")}</span>
                      <span className="font-medium tabular-nums">{value(d.value)}</span>
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
          <span />
          <div className="mt-1.5 flex text-[11px] text-muted-foreground">
            {data.map((d, i) => (
              <span key={d.month} className="flex-1 text-center">
                {data.length > 8 && i % 2 === 1 ? "" : month(d.month, "short")}
              </span>
            ))}
          </div>
        </div>
      )}
    </figure>
  );
}
