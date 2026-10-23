"use client";

import { CheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  features: string[];
  limits: string[];
  fee: string;
  recommended: boolean;
}

export function PricingCards({ plans, cta, trialDays }: { plans: PricingCard[]; cta: { href: string; label: string }; trialDays: number }) {
  const t = useTranslations("pricingPage");
  const [interval, setInterval] = useState<"month" | "year">("month");
  return (
    <div className="grid gap-8">
      <Tabs value={interval} onValueChange={(v) => setInterval(v as "month" | "year")} className="w-fit">
        <TabsList>
          <TabsTrigger value="month">{t("monthly")}</TabsTrigger>
          <TabsTrigger value="year">{t("yearly")}</TabsTrigger>
        </TabsList>
      </Tabs>
      <div className={cn("grid gap-6", plans.length >= 3 ? "lg:grid-cols-3" : "md:grid-cols-2")}>
        {plans.map((p) => (
          <article
            key={p.key}
            className={cn("relative grid content-start gap-5 rounded-2xl border bg-card p-6", p.recommended && "border-primary shadow-lg shadow-primary/10 ring-1 ring-primary")}
          >
            {p.recommended && (
              <span className="absolute -top-3 left-6 rounded-full bg-primary px-3 py-0.5 text-xs font-medium text-primary-foreground">{t("recommended")}</span>
            )}
            <div className="grid gap-1">
              <h2 className="text-xl font-semibold">{p.name}</h2>
              {p.description && <p className="text-sm text-muted-foreground">{p.description}</p>}
            </div>
            <div className="grid gap-1">
              <p className="flex items-baseline gap-1.5">
                <span className="text-4xl font-bold tracking-tight tabular-nums">{interval === "month" ? p.monthly : p.yearlyPerMonth}</span>
                <span className="text-sm text-muted-foreground">{t("perMonth")}</span>
              </p>
              <p className="text-sm text-muted-foreground">
                {interval === "month" ? t("billedMonthly") : t("billedYearly", { amount: p.yearly })}
                {interval === "year" && p.savings && <span className="ml-1 font-medium text-success">{t("save", { amount: p.savings })}</span>}
              </p>
            </div>
            <Button asChild variant={p.recommended ? "default" : "outline"}>
              <Link href={cta.href}>{cta.label}</Link>
            </Button>
            <ul className="grid gap-2 text-sm">
              {[...p.limits, ...p.features].map((f) => (
                <li key={f} className="flex gap-2">
                  <CheckIcon className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                  {f}
                </li>
              ))}
            </ul>
            <p className="border-t pt-4 text-sm text-muted-foreground">{p.fee}</p>
          </article>
        ))}
      </div>
      {trialDays > 0 && <p className="text-sm text-muted-foreground">{t("trialNote", { days: trialDays })}</p>}
    </div>
  );
}
