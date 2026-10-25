"use client";

import { CheckIcon, CreditCardIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useRedirect } from "@/components/redirect-button";
import { Pill } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { billingPortalAction, choosePlanAction } from "./actions";

interface PlanCard {
  id: string;
  name: string;
  description: string;
  monthly: string;
  yearly: string;
  features: string[];
  recommended: boolean;
  /** Free days this agency gets on the plan; 0 for none. */
  trialDays: number;
  synced: boolean;
  fee: string | null;
  artists: number | null;
}

export function PlanPicker({
  plans,
  current: currentSub,
  switching,
  stripeReady,
}: {
  plans: PlanCard[];
  /** The agency's plan; `paid` is false while it still has to be paid (overdue, or a trial without card). */
  current: { planId: string; interval: "month" | "year"; paid: boolean } | null;
  /** The agency has a running Stripe subscription: choosing a plan switches it. */
  switching: boolean;
  stripeReady: boolean;
}) {
  const t = useTranslations("billing");
  const [interval, setInterval] = useState<"month" | "year">(currentSub?.interval ?? "month");
  const [pending, go] = useRedirect();

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        <Tabs value={interval} onValueChange={(v) => setInterval(v as "month" | "year")}>
          <TabsList>
            <TabsTrigger value="month">{t("monthly")}</TabsTrigger>
            <TabsTrigger value="year">{t("yearly")}</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      {!stripeReady && <p className="text-sm text-muted-foreground">{t("stripeMissing")}</p>}
      <ul className="grid gap-4 md:grid-cols-3">
        {plans.map((p) => {
          const mine = p.id === currentSub?.planId;
          // The plan you're on and paying for can't be bought again; one still to pay can.
          const current = mine && interval === currentSub.interval && currentSub.paid;
          const trialDays = currentSub ? 0 : p.trialDays;
          const label = current
            ? t("current")
            : mine && !currentSub.paid
              ? t("payFor", { plan: p.name })
              : currentSub
                ? t("changeTo", { plan: p.name })
                : trialDays > 0
                  ? t("startTrial", { days: trialDays })
                  : t("choose", { plan: p.name });
          return (
            <li key={p.id} className={cn("grid content-start gap-4 rounded-2xl border bg-card p-5", mine ? "border-primary ring-2 ring-primary" : p.recommended && "border-primary/50")}>
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-lg font-semibold">{p.name}</h3>
                <span className="flex flex-wrap gap-1.5">
                  {mine && <Pill tone="success">{t("yourPlan")}</Pill>}
                  {trialDays > 0 && <Pill tone="success">{t("trialBadge", { days: trialDays })}</Pill>}
                  {p.recommended && !mine && <Pill tone="brand">{t("recommended")}</Pill>}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">{p.description}</p>
              <p className="text-3xl font-semibold tracking-tight tabular-nums">
                {interval === "month" ? p.monthly : p.yearly}
                <span className="text-base font-normal text-muted-foreground">{interval === "month" ? t("perMonth") : t("perYear")}</span>
              </p>
              <ul className="grid gap-1.5 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <CheckIcon className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                    {f}
                  </li>
                ))}
                {p.fee && <li className="text-muted-foreground">{p.fee}</li>}
              </ul>
              <Button
                variant={mine || (!currentSub && p.recommended) ? "default" : "outline"}
                disabled={pending || current || !stripeReady}
                onClick={() => go(() => choosePlanAction(p.id, interval))}
              >
                {label}
              </Button>
              {trialDays > 0 && <p className="text-xs text-muted-foreground">{t("trialTerms")}</p>}
              {switching && !current && <p className="text-xs text-muted-foreground">{t("switchTerms")}</p>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function ManageBillingButton() {
  const t = useTranslations("billing");
  const [pending, go] = useRedirect();
  return (
    <Button variant="outline" size="sm" className="w-fit" disabled={pending} onClick={() => go(billingPortalAction)}>
      <CreditCardIcon />
      {t("manage")}
    </Button>
  );
}
