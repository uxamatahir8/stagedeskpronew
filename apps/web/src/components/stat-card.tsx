import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type StatTone = "violet" | "pink" | "teal" | "amber" | "blue";

/** Each tone tints the icon chip and the card's corner wash; the number itself stays in text colour. */
const tones: Record<StatTone, { chip: string; wash: string }> = {
  violet: { chip: "bg-primary/12 text-primary", wash: "from-primary/10" },
  pink: { chip: "bg-magenta/12 text-magenta", wash: "from-magenta/10" },
  teal: { chip: "bg-chart-2/14 text-chart-2", wash: "from-chart-2/10" },
  amber: { chip: "bg-warning/18 text-foreground", wash: "from-warning/14" },
  blue: { chip: "bg-info/12 text-info", wash: "from-info/10" },
};
const order: StatTone[] = ["violet", "pink", "teal", "amber"];

/**
 * One KPI: label, value and an optional hint line. Values use tabular figures.
 * Without a tone, cards in a row are coloured in a fixed order by `index`.
 */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone,
  index = 0,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: LucideIcon;
  tone?: StatTone;
  index?: number;
  className?: string;
}) {
  const style = tones[tone ?? order[index % order.length]!];
  return (
    <div className={cn("relative grid content-start gap-2 overflow-hidden rounded-xl border bg-card p-4", className)}>
      <div aria-hidden className={cn("pointer-events-none absolute -top-10 -right-10 size-32 rounded-full bg-gradient-to-br to-transparent blur-xl", style.wash)} />
      {/* The header keeps the chip's height with or without an icon, so values line up across a row. */}
      <div className="relative flex min-h-8 items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>{label}</span>
        {Icon && (
          <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", style.chip)}>
            <Icon className="size-4" aria-hidden />
          </span>
        )}
      </div>
      <div className="relative text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
      {hint && <div className="relative text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}
