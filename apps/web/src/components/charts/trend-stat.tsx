import { ArrowDownRightIcon, ArrowRightIcon, ArrowUpRightIcon, type LucideIcon } from "lucide-react";
import { StatCard, type StatTone } from "@/components/stat-card";
import { cn } from "@/lib/utils";

/**
 * A KPI with its change against the previous period. The arrow and the words
 * carry the direction (never colour alone); colour says whether that's good:
 * for most numbers up is good, for some (open claims, cancellations) down is.
 */
export function TrendStat({
  label,
  value,
  current,
  previous,
  vsLabel,
  newLabel = "new",
  goodWhen = "up",
  spark,
  hint,
  icon,
  tone,
  index,
}: {
  label: string;
  value: React.ReactNode;
  /** The raw numbers compared; the change is shown as a percentage (or "new" from zero). */
  current: number;
  previous: number;
  /** e.g. "vs last month" */
  vsLabel: string;
  /** Shown instead of a percentage when the previous period was zero. */
  newLabel?: string;
  goodWhen?: "up" | "down";
  /** Values over time, oldest first, for a small line under the number. */
  spark?: number[];
  hint?: React.ReactNode;
  icon?: LucideIcon;
  tone?: StatTone;
  index?: number;
}) {
  const diff = current - previous;
  const pct = previous === 0 ? null : Math.round((diff / previous) * 100);
  const direction = diff === 0 ? "flat" : diff > 0 ? "up" : "down";
  const good = direction === "flat" ? null : direction === goodWhen;
  const Arrow = direction === "up" ? ArrowUpRightIcon : direction === "down" ? ArrowDownRightIcon : ArrowRightIcon;
  const text = pct === null ? (current === 0 ? "0%" : newLabel) : `${pct > 0 ? "+" : ""}${pct}%`;
  return (
    <StatCard
      label={label}
      value={value}
      icon={icon}
      tone={tone}
      index={index}
      hint={
        <span className="grid gap-2">
          <span className="flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-medium tabular-nums",
                good === null ? "bg-muted text-muted-foreground" : good ? "bg-success/14 text-success" : "bg-destructive/12 text-destructive",
              )}
            >
              <Arrow className="size-3" aria-hidden />
              {text}
            </span>
            <span>{vsLabel}</span>
            {hint && <span>· {hint}</span>}
          </span>
          {spark && spark.length > 1 && <Sparkline values={spark} />}
        </span>
      }
    />
  );
}

/** A small trend line with the last point marked; decoration for the number above it, so hidden from screen readers. */
export function Sparkline({ values, height = 28 }: { values: number[]; height?: number }) {
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const w = 100;
  const x = (i: number) => (i / (values.length - 1)) * w;
  const y = (v: number) => height - 2 - ((v - min) / span) * (height - 6);
  const line = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(" ");
  const last = values.length - 1;
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="h-7 w-full overflow-visible" aria-hidden>
      <path d={`${line} L${w},${height} L0,${height} Z`} fill="var(--chart-1)" fillOpacity={0.12} />
      <path d={line} fill="none" stroke="var(--chart-1)" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(last)} cy={y(values[last]!)} r={3} fill="var(--chart-1)" stroke="var(--card)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
