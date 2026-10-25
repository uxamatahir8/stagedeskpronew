import { CheckIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { getFormatter } from "@/lib/formatter";
import { countLimits, featureFlags, feeRuleSchema, parseLimits } from "@stagedesk/core";
import { activePlans, agencyBilling, agencyUsage, effectiveFeeSnapshot, planTrialDays, prisma, trialEligible } from "@stagedesk/db";
import { isStripeConfigured } from "@stagedesk/payments";
import { FormMessage } from "@/components/auth/auth-card";
import { PageHeader } from "@/components/page-header";
import { Pill } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { Locale } from "@/i18n/routing";
import { dateTime, euro, percent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { requireAgency } from "@/lib/viewer";
import { CancelPlan } from "./cancel-plan";
import { ManageBillingButton, PlanPicker } from "./plan-picker";
import { ReferralCard } from "./referral-card";
import { confirmCheckoutReturn } from "@/lib/checkout-return";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/billing">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "billing" });
  return { title: t("title") };
}

export default async function BillingPage({ params, searchParams }: PageProps<"/[locale]/app/billing">) {
  setRequestLocale((await params).locale as Locale);
  return (
    <Suspense fallback={<Skeleton className="h-[40rem] w-full" />}>
      <Billing searchParams={searchParams} />
    </Suspense>
  );
}

const loc = (value: unknown, locale: string) => {
  const v = (value ?? {}) as Record<string, string | string[]>;
  return v[locale] ?? v["nl"] ?? "";
};

async function Billing({ searchParams }: Pick<PageProps<"/[locale]/app/billing">, "searchParams">) {
  const { organization } = await requireAgency("agency.billing");
  // Back from Checkout: apply the subscription now rather than waiting for the webhook.
  await confirmCheckoutReturn((await searchParams)["session_id"], { organizationId: organization.id });
  // Independent artists see the Artist plans; agencies the agency plans.
  const { kind } = await prisma.organization.findUniqueOrThrow({ where: { id: organization.id }, select: { kind: true } });
  const [t, format, locale, billing, usage, plans, fee, org, eligible] = await Promise.all([
    getTranslations("billing"),
    getFormatter(),
    getLocale(),
    agencyBilling(organization.id),
    agencyUsage(organization.id),
    activePlans(kind === "solo" ? "artist" : "agency"),
    effectiveFeeSnapshot(organization.id),
    prisma.organization.findUniqueOrThrow({ where: { id: organization.id }, select: { stripeCustomerId: true } }),
    trialEligible(organization.id),
  ]);
  const { subscription, plan, limits, access } = billing;
  const query = await searchParams;
  const done = query["checkout"] === "success";
  // Straight after creating the agency: choosing a plan is the next step.
  const welcome = query["welcome"] === "1" && !subscription;

  const statusLine = (() => {
    if (!subscription) return t("status_none");
    if (access.reason === "trial") return t(subscription.cancelAtPeriodEnd ? "status_cancels" : "status_trial", { date: dateTime(format, access.until!) });
    if (access.reason === "grace") return t("status_grace", { date: dateTime(format, access.until!) });
    if (access.reason === "active" && subscription.currentPeriodEnd) {
      return subscription.cancelAtPeriodEnd
        ? t("status_cancels", { date: dateTime(format, subscription.currentPeriodEnd) })
        : t("status_renews", { date: dateTime(format, subscription.currentPeriodEnd) });
    }
    return t(`status_${access.reason}`);
  })();
  const feeText = fee.rule.type === "none" ? t("noFee") : t("platformFee", { fee: describeFee(fee.rule, format) });

  return (
    <div className="grid gap-6">
      <PageHeader title={t("title")} description={t("description")} />
      {done && <FormMessage tone="success">{t("checkoutDone")}</FormMessage>}
      {query["checkout"] === "switched" && <FormMessage tone="success">{t("switched")}</FormMessage>}
      {welcome && (
        <div className="grid gap-1 rounded-xl border border-primary/40 bg-primary/5 p-4">
          <p className="font-semibold">{t("welcomeTitle")}</p>
          <p className="text-sm text-muted-foreground">{t("welcomeBody")}</p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className={cn(access.level === "read_only" && subscription && "border-destructive/50")}>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              {t("currentPlan")}
              {plan && <Pill tone={access.level === "read_only" ? "danger" : access.reason === "grace" ? "warning" : "success"}>{loc(plan.name, locale)}</Pill>}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <p className="font-medium">{statusLine}</p>
            {access.level === "read_only" && <p className={subscription ? "text-destructive" : "text-muted-foreground"}>{t(subscription ? "readOnlyBody" : "noneBody")}</p>}
            <p className="text-muted-foreground">{feeText}</p>
            <div className="flex flex-wrap gap-2">
              {org.stripeCustomerId && <ManageBillingButton />}
              {/* Only a running Stripe subscription can be cancelled here; a plan the admin granted is managed by StageDesk. */}
              {subscription?.stripeSubscriptionId && ["active", "trialing", "past_due"].includes(subscription.status) && (
                <CancelPlan
                  cancelling={subscription.cancelAtPeriodEnd}
                  endsOn={dateTime(format, (subscription.status === "trialing" ? subscription.trialEndsAt : subscription.currentPeriodEnd) ?? new Date())}
                />
              )}
            </div>
          </CardContent>
        </Card>

        {/* Seats, artists and website features are agency matters; an independent artist has none of them. */}
        {kind !== "solo" && (
        <Card>
          <CardHeader>
            <CardTitle>{t("usage")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            {countLimits
              .filter((k) => k !== "storageGb")
              .map((key) => {
                const max = limits[key];
                const used = usage[key];
                const pct = max ? Math.min(100, Math.round((used / max) * 100)) : 0;
                return (
                  <div key={key} className="grid gap-1">
                    <div className="flex justify-between">
                      <span>{t(`limit_${key}`)}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {max === null ? `${used} · ${t("unlimited")}` : t("of", { used, max })}
                      </span>
                    </div>
                    {max !== null && (
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className={cn("h-full rounded-full", pct >= 100 ? "bg-destructive" : pct >= 80 ? "bg-warning" : "bg-primary")} style={{ width: `${pct}%` }} />
                      </div>
                    )}
                  </div>
                );
              })}
            <ul className="mt-2 grid gap-1">
              {featureFlags.map((flag) => (
                <li key={flag} className={cn("flex items-center gap-2", !limits[flag] && "text-muted-foreground line-through")}>
                  <CheckIcon className={cn("size-4", limits[flag] ? "text-success" : "opacity-30")} aria-hidden />
                  {t(`flag_${flag}`)}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        )}
      </div>

      <PlanPicker
        stripeReady={await isStripeConfigured()}
        // The agency's plan unless cancelled; "paid" when active or on a Stripe trial (card on file).
        current={
          subscription && subscription.status !== "canceled"
            ? {
                planId: subscription.planId,
                interval: subscription.interval === "year" ? "year" : "month",
                paid: access.reason === "active" || (Boolean(subscription.stripeSubscriptionId) && subscription.status === "trialing" && access.level === "full"),
              }
            : null
        }
        switching={Boolean(subscription?.stripeSubscriptionId && access.level === "full")}
        plans={plans
          .filter((p) => p.visible)
          .map((p) => {
            const planFee = feeRuleSchema.safeParse(p.feeRule);
            return {
              id: p.id,
              name: loc(p.name, locale) as string,
              description: loc(p.description, locale) as string,
              monthly: euro(format, p.monthlyPriceCents),
              yearly: euro(format, p.yearlyPriceCents),
              features: (loc(p.features, locale) as unknown as string[]) || [],
              recommended: p.recommended,
              trialDays: planTrialDays(p, eligible),
              synced: Boolean(p.stripeMonthlyPriceId && p.stripeYearlyPriceId),
              fee: planFee.success && p.feeRule ? (planFee.data.type === "none" ? t("noFee") : t("platformFee", { fee: describeFee(planFee.data, format) })) : null,
              artists: parseLimits(p.limits).maxArtists,
            };
          })}
      />

      {kind !== "solo" && <ReferralCard organizationId={organization.id} />}
    </div>
  );
}

function describeFee(rule: { type: string; percentageBps: number; fixedCents: number }, format: Awaited<ReturnType<typeof getFormatter>>) {
  const parts = [];
  if (rule.type === "percentage" || rule.type === "percentage_plus_fixed") parts.push(percent(format, rule.percentageBps));
  if (rule.type === "fixed" || rule.type === "percentage_plus_fixed") parts.push(euro(format, rule.fixedCents));
  return parts.join(" + ");
}
