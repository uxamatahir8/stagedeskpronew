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
  synced: boolean;
  fee: string | null;
  artists: number | null;
}

export function PlanPicker({ plans, currentPlanId, stripeReady }: { plans: PlanCard[]; currentPlanId: string | null; stripeReady: boolean }) {
  const t = useTranslations("billing");
  const [interval, setInterval] = useState<"month" | "year">("month");
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
          const current = p.id === currentPlanId;
          return (
            <li key={p.id} className={cn("grid content-start gap-4 rounded-2xl border bg-card p-5", p.recommended && "border-primary ring-1 ring-primary")}>
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-lg font-semibold">{p.name}</h3>
                {p.recommended && <Pill tone="brand">{t("recommended")}</Pill>}
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
                variant={p.recommended ? "default" : "outline"}
                disabled={pending || current || !stripeReady || !p.synced}
                title={!p.synced ? t("planNotSynced") : undefined}
                onClick={() => go(() => choosePlanAction(p.id, interval))}
              >
                {current ? t("current") : t("choose", { plan: p.name })}
              </Button>
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
