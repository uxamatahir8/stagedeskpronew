import { cn } from "@/lib/utils";

export interface BarItem {
  key: string;
  label: React.ReactNode;
  value: number;
  /** How the value is written (money, a count with a unit…); the raw number by default. */
  display?: string;
  href?: string;
}

/**
 * Ranked horizontal bars: label, bar and value on one row, with the share of
 * the total when `share` is set. One hue (it's magnitude, not identity), so
 * the values are always written out.
 */
export function BarList({ items, share = false, empty, max: limit = 6 }: { items: BarItem[]; share?: boolean; empty: string; max?: number }) {
  const shown = items.filter((i) => i.value > 0).slice(0, limit);
  if (shown.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  const top = Math.max(...shown.map((i) => i.value));
  const total = items.reduce((s, i) => s + i.value, 0);
  return (
    <ul className="grid gap-2.5">
      {shown.map((i) => (
        <li key={i.key} className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto] items-center gap-3 text-sm">
          <span className="truncate" title={typeof i.label === "string" ? i.label : undefined}>
            {i.href ? (
              <a href={i.href} className="underline-offset-4 hover:underline">
                {i.label}
              </a>
            ) : (
              i.label
            )}
          </span>
          <span className="h-2 overflow-hidden rounded-full bg-primary/10" aria-hidden>
            <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.max(2, (i.value / top) * 100)}%` }} />
          </span>
          <span className={cn("text-right tabular-nums", share && "min-w-[5.5rem]")}>
            {i.display ?? i.value}
            {share && total > 0 && <span className="ml-1.5 text-xs text-muted-foreground">{Math.round((i.value / total) * 100)}%</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}
