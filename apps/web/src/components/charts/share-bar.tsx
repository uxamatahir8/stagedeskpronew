"use client";

import { useState } from "react";

export interface ShareItem {
  key: string;
  label: string;
  value: number;
  display: string;
}

/**
 * Part-to-whole in one bar. Categorical hues in a fixed, validated order
 * (chart-1..4; checked for colour-blind separation in light and dark); a
 * fifth category or more folds into a grey "Other". Every segment is named
 * with its value and share in the legend, so colour is never the only key.
 */
const hues = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)"];

export function ShareBar({ items, otherLabel, empty }: { items: ShareItem[]; otherLabel: string; empty: string }) {
  const [active, setActive] = useState<string | null>(null);
  const sorted = [...items].filter((i) => i.value > 0).sort((a, b) => b.value - a.value);
  const total = sorted.reduce((s, i) => s + i.value, 0);
  if (total === 0) return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  const head = sorted.slice(0, 4).map((i, n) => ({ ...i, color: hues[n]! }));
  const rest = sorted.slice(4);
  const segments = rest.length
    ? [...head, { key: "other", label: otherLabel, value: rest.reduce((s, i) => s + i.value, 0), display: "", color: "var(--muted-foreground)" }]
    : head;
  const pct = (v: number) => Math.round((v / total) * 100);
  return (
    <div className="grid gap-3">
      <div className="flex h-3 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={segments.map((s) => `${s.label} ${pct(s.value)}%`).join(", ")}>
        {segments.map((s) => (
          <span
            key={s.key}
            className="h-full transition-opacity first:rounded-l-full last:rounded-r-full"
            style={{ width: `${(s.value / total) * 100}%`, background: s.color, opacity: active && active !== s.key ? 0.35 : 1 }}
            onMouseEnter={() => setActive(s.key)}
            onMouseLeave={() => setActive(null)}
          />
        ))}
      </div>
      <ul className="grid gap-1.5 text-sm">
        {segments.map((s) => (
          <li
            key={s.key}
            className="flex items-center justify-between gap-3 rounded-md px-1 py-0.5 hover:bg-muted/60"
            onMouseEnter={() => setActive(s.key)}
            onMouseLeave={() => setActive(null)}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="size-2.5 shrink-0 rounded-sm" style={{ background: s.color }} aria-hidden />
              <span className="truncate">{s.label}</span>
            </span>
            <span className="shrink-0 tabular-nums">
              {s.display && <span className="mr-2">{s.display}</span>}
              <span className="text-muted-foreground">{pct(s.value)}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
