"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * What a partner could earn: agencies referred per month on a plan, at the
 * program's rate, for the program's commission period (null = lifetime).
 */
export function EarningsCalculator({
  plans,
  rateBps,
  months,
}: {
  plans: { key: string; name: string; monthlyCents: number }[];
  rateBps: number;
  months: number | null;
}) {
  const t = useTranslations("partnerPages");
  const format = useFormatter();
  const [perMonth, setPerMonth] = useState(2);
  const [planKey, setPlanKey] = useState(plans.find((p) => p.key === "pro")?.key ?? plans[0]?.key ?? "");
  const plan = plans.find((p) => p.key === planKey) ?? plans[0];
  if (!plan) return null;

  const commission = (plan.monthlyCents * rateBps) / 10_000;
  const earningAt = (month: number) => perMonth * Math.min(month, months ?? month);
  const monthlyAfterYear = earningAt(12) * commission;
  const firstYear = Array.from({ length: 12 }, (_, i) => earningAt(i + 1) * commission).reduce((a, b) => a + b, 0);
  const perAgency = commission * (months ?? 12);
  const money = (cents: number) => format.number(cents / 100, { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

  return (
    <div className="grid gap-6 rounded-3xl border bg-card p-6 sm:p-8">
      <h2 className="text-xl font-semibold">{t("calcTitle")}</h2>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="grid gap-2">
          <label htmlFor="calc-agencies" className="flex items-baseline justify-between text-sm font-medium">
            {t("calcAgencies")}
            <span className="text-2xl font-bold tabular-nums">{perMonth}</span>
          </label>
          <input id="calc-agencies" type="range" min={1} max={20} value={perMonth} onChange={(e) => setPerMonth(Number(e.target.value))} className="accent-primary" />
        </div>
        <div className="grid gap-2">
          <span className="text-sm font-medium">{t("calcPlan")}</span>
          <div role="radiogroup" aria-label={t("calcPlan")} className="flex flex-wrap gap-2">
            {plans.map((p) => (
              <button
                key={p.key}
                type="button"
                role="radio"
                aria-checked={p.key === plan.key}
                onClick={() => setPlanKey(p.key)}
                className={cn("rounded-full border px-3.5 py-1.5 text-sm", p.key === plan.key ? "border-primary bg-primary/10 font-medium text-primary" : "hover:border-primary/40")}
              >
                {p.name} · {money(p.monthlyCents)}
              </button>
            ))}
          </div>
        </div>
      </div>
      <dl className="grid gap-4 sm:grid-cols-3">
        {[
          [t("calcPerMonth"), money(monthlyAfterYear)],
          [t("calcFirstYear"), money(firstYear)],
          [t("calcTotal"), money(perAgency)],
        ].map(([label, value], i) => (
          <div key={label} className={cn("grid gap-1 rounded-2xl p-4", i === 0 ? "bg-[oklch(0.24_0.08_322)] text-white" : "bg-muted/60")}>
            <dt className={cn("text-sm", i === 0 ? "text-white/75" : "text-muted-foreground")}>{label}</dt>
            <dd className="text-3xl font-bold tracking-tight tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-muted-foreground">{t("calcNote", { rate: format.number(rateBps / 10_000, { style: "percent", maximumFractionDigits: 2 }) })}</p>
    </div>
  );
}
