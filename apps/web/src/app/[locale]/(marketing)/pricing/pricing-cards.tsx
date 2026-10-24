"use client";

import { ArrowRightIcon, CheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export interface PricingCard {
  key: string;
  name: string;
  description: string;
  monthly: string;
  yearly: string;
  yearlyPerMonth: string;
  savings: string | null;
  savingsPercent: number;
  /** Set when prices are shown converted: what is actually billed, in euros. */
  billedInEuro: string | null;
  features: string[];
  limits: string[];
  fee: string;
  recommended: boolean;
  /** Free days before the first payment; 0 when the plan has no trial. */
  trialDays: number;
}

/** The plans side by side; the recommended one stands out in the brand's dark purple. */
export function PricingCards({ plans, cta, trialDays }: { plans: PricingCard[]; cta: { href: string; label: string }; trialDays: number }) {
  const t = useTranslations("pricingPage");
  const [interval, setInterval] = useState<"month" | "year">("month");
  const bestSaving = Math.max(0, ...plans.map((p) => p.savingsPercent));
  return (
    <div className="grid gap-10">
      <div className="flex flex-wrap items-center justify-center gap-3">
        <div role="radiogroup" aria-label={t("billingPeriod")} className="inline-flex rounded-full border bg-card p-1 text-sm">
          {(["month", "year"] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={interval === v}
              onClick={() => setInterval(v)}
              className={cn("rounded-full px-5 py-2 font-medium transition-colors", interval === v ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
            >
              {v === "month" ? t("monthly") : t("yearly")}
            </button>
          ))}
        </div>
        {bestSaving > 0 && <span className="rounded-full bg-success/15 px-3 py-1 text-sm font-medium text-success">{t("saveUpTo", { percent: bestSaving })}</span>}
      </div>

      <div className={cn("grid items-stretch gap-6", plans.length >= 3 ? "lg:grid-cols-3" : "mx-auto w-full max-w-4xl md:grid-cols-2")}>
        {plans.map((p) => {
          const dark = p.recommended;
          return (
            <article
              key={p.key}
              className={cn(
                "relative grid grid-rows-[auto_auto_auto_auto_1fr_auto] gap-6 rounded-3xl border p-7",
                dark ? "border-transparent bg-[oklch(0.24_0.08_322)] text-white shadow-2xl shadow-primary/25 lg:-my-4 lg:py-11" : "bg-card",
              )}
            >
              {p.recommended && (
                <span className="absolute -top-3 left-7 rounded-full bg-[oklch(0.66_0.2_352)] px-3 py-1 text-xs font-semibold text-white">{t("recommended")}</span>
              )}
              <div className="grid gap-1.5">
                <h2 className="text-xl font-semibold">{p.name}</h2>
                {p.description && <p className={cn("text-sm", dark ? "text-white/70" : "text-muted-foreground")}>{p.description}</p>}
              </div>
              <div className="grid gap-1">
                <p className="flex items-baseline gap-1.5">
                  <span className="text-5xl font-bold tracking-tight tabular-nums">{interval === "month" ? p.monthly : p.yearlyPerMonth}</span>
                  <span className={cn("text-sm", dark ? "text-white/70" : "text-muted-foreground")}>{t("perMonth")}</span>
                </p>
                <p className={cn("min-h-5 text-sm", dark ? "text-white/70" : "text-muted-foreground")}>
                  {interval === "month" ? t("billedMonthly") : t("billedYearly", { amount: p.yearly })}
                  {interval === "year" && p.savings && <span className={cn("ml-1 font-medium", dark ? "text-[oklch(0.85_0.15_150)]" : "text-success")}>{t("save", { amount: p.savings })}</span>}
                </p>
              </div>
              {p.trialDays > 0 && (
                <p className={cn("-mt-3 w-fit rounded-full px-2.5 py-0.5 text-xs font-medium", dark ? "bg-white/12 text-white" : "bg-success/12 text-success")}>{t("trialCard", { days: p.trialDays })}</p>
              )}
              {p.billedInEuro && <p className={cn("-mt-4 text-xs", dark ? "text-white/60" : "text-muted-foreground")}>{p.billedInEuro}</p>}
              <Button asChild size="lg" variant={dark ? "default" : "outline"} className={cn("w-full", dark && "bg-[oklch(0.66_0.2_352)] text-white hover:bg-[oklch(0.6_0.2_352)]")}>
                <Link href={cta.href}>
                  {cta.label}
                  <ArrowRightIcon />
                </Link>
              </Button>
              <ul className={cn("grid content-start gap-2.5 border-t pt-6 text-sm", dark && "border-white/15")}>
                {[...p.limits, ...p.features].map((f) => (
                  <li key={f} className="flex gap-2.5">
                    <CheckIcon className={cn("mt-0.5 size-4 shrink-0", dark ? "text-[oklch(0.85_0.15_150)]" : "text-success")} aria-hidden />
                    {f}
                  </li>
                ))}
              </ul>
              <p className={cn("text-xs", dark ? "text-white/60" : "text-muted-foreground")}>{p.fee}</p>
            </article>
          );
        })}
      </div>
      {trialDays > 0 && <p className="text-center text-sm text-muted-foreground">{t("trialNote", { days: trialDays })}</p>}
    </div>
  );
}
