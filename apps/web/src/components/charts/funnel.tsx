export interface FunnelStep {
  key: string;
  label: string;
  value: number;
}

/**
 * Stages from first contact to done: each bar is a share of the first stage,
 * and between steps the conversion from the step before is written out.
 */
export function Funnel({ steps, conversionLabel }: { steps: FunnelStep[]; conversionLabel: (pct: number) => string }) {
  const first = Math.max(1, steps[0]?.value ?? 0);
  return (
    <ol className="grid gap-1">
      {steps.map((s, i) => {
        const prev = steps[i - 1];
        const conv = prev && prev.value > 0 ? Math.round((s.value / prev.value) * 100) : null;
        return (
          <li key={s.key} className="grid gap-1">
            {conv !== null && <span className="pl-2 text-xs text-muted-foreground">↓ {conversionLabel(conv)}</span>}
            <div className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)_3.5rem] items-center gap-3 text-sm">
              <span className="truncate text-muted-foreground">{s.label}</span>
              <span className="h-6 overflow-hidden rounded-md bg-primary/8" aria-hidden>
                <span className="block h-full rounded-md bg-primary/80" style={{ width: `${Math.max(1.5, (s.value / first) * 100)}%` }} />
              </span>
              <span className="text-right font-medium tabular-nums">{s.value}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
