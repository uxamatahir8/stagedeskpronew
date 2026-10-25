import type { Metadata } from "next";
import { Suspense } from "react";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { getFormatter } from "@/lib/formatter";
import { feeRuleSchema, parseLimits } from "@stagedesk/core";
import { prisma } from "@stagedesk/db";
import { PageHeader } from "@/components/page-header";
import { Pill } from "@/components/status-badge";
import { DataTable } from "@/components/list/data-table";
import { Skeleton } from "@/components/ui/skeleton";
import type { Locale } from "@/i18n/routing";
import { centsToInput, euro } from "@/lib/format";
import { requirePermission } from "@/lib/viewer";
import { type PlanValues, PlanDialog } from "./plan-dialog";
import { SyncPlanButton } from "./sync-button";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/plans">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "plans" });
  return { title: t("title") };
}

export default async function PlansPage({ params }: PageProps<"/[locale]/app/plans">) {
  setRequestLocale((await params).locale as Locale);
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Plans />
    </Suspense>
  );
}

const text = (v: unknown, l: "nl" | "en") => ((v ?? {}) as Record<string, unknown>)[l];

// Plans keep the admin's own order unless a column is clicked.
const spec = { sorts: ["position", "name", "monthly", "yearly", "agencies"], defaultSort: "position", defaultDir: "asc" as const, filters: { state: ["active", "hidden", "inactive"], stripe: ["synced", "unsynced"] } };

async function Plans() {
  await requirePermission("platform.plans");
  const [t, format, locale, plans] = await Promise.all([
    getTranslations("plans"),
    getFormatter(),
    getLocale(),
    prisma.plan.findMany({ orderBy: [{ position: "asc" }, { monthlyPriceCents: "asc" }], include: { _count: { select: { subscriptions: true } } } }),
  ]);

  const toValues = (p: (typeof plans)[number]): PlanValues => {
    const fee = feeRuleSchema.safeParse(p.feeRule);
    const features = (l: "nl" | "en") => ((text(p.features, l) as string[] | undefined) ?? []).join("\n");
    return {
      id: p.id,
      key: p.key,
      nameNl: String(text(p.name, "nl") ?? ""),
      nameEn: String(text(p.name, "en") ?? ""),
      descriptionNl: String(text(p.description, "nl") ?? ""),
      descriptionEn: String(text(p.description, "en") ?? ""),
      monthly: centsToInput(p.monthlyPriceCents, locale),
      yearly: centsToInput(p.yearlyPriceCents, locale),
      trialEnabled: p.trialEnabled,
      trialDays: p.trialDays,
      featuresNl: features("nl"),
      featuresEn: features("en"),
      limits: parseLimits(p.limits),
      feeRule: p.feeRule && fee.success ? fee.data : null,
      recommended: p.recommended,
      visible: p.visible,
      active: p.active,
      position: p.position,
    };
  };

  return (
    <div className="grid gap-6">
      <PageHeader title={t("title")} description={t("description")} actions={<PlanDialog nextPosition={plans.length} />} />
      <DataTable
        spec={spec}
        placeholder={t("searchPlaceholder")}
        filters={[
          { key: "state", label: t("state"), options: [{ value: "active", label: t("stateActive") }, { value: "hidden", label: t("hidden") }, { value: "inactive", label: t("inactive") }] },
          { key: "stripe", label: "Stripe", options: [{ value: "synced", label: t("synced") }, { value: "unsynced", label: t("notSynced") }] },
        ]}
        columns={[
          { label: t("nameNl"), sort: "name" },
          { label: t("monthly"), sort: "monthly", align: "right" },
          { label: t("yearly"), sort: "yearly", align: "right" },
          { label: t("limits") },
          { label: t("agenciesCol"), sort: "agencies", align: "right" },
          { label: "Stripe" },
          { label: "", className: "w-0" },
        ]}
        rows={plans.map((p) => {
          const limits = parseLimits(p.limits);
          const name = String(text(p.name, locale === "en" ? "en" : "nl") ?? p.key);
          return {
            id: p.id,
            text: `${name} ${p.key}`,
            values: { position: p.position, name, monthly: p.monthlyPriceCents, yearly: p.yearlyPriceCents, agencies: p._count.subscriptions },
            facets: { state: !p.active ? "inactive" : !p.visible ? "hidden" : "active", stripe: p.stripeMonthlyPriceId ? "synced" : "unsynced" },
            cells: [
              <div key="n">
                <div className="flex flex-wrap items-center gap-2 font-medium">
                  {name}
                  {p.recommended && <Pill tone="brand">{t("recommended")}</Pill>}
                  {!p.visible && <Pill>{t("hidden")}</Pill>}
                  {!p.active && <Pill tone="danger">{t("inactive")}</Pill>}
                </div>
                <div className="text-xs text-muted-foreground">
                  <span className="font-mono">{p.key}</span> · {p.trialEnabled ? t("trialOn", { days: p.trialDays }) : t("trialOff")}
                </div>
              </div>,
              euro(format, p.monthlyPriceCents),
              euro(format, p.yearlyPriceCents),
              <span key="l" className="text-sm text-muted-foreground">
                {limits.maxArtists ?? "∞"} / {limits.maxStaff ?? "∞"} / {limits.maxBookingsPerMonth ?? "∞"}
              </span>,
              p._count.subscriptions,
              p.stripeMonthlyPriceId ? (
                <Pill key="s" tone="success">{t("synced")}</Pill>
              ) : (
                <div key="s" className="flex flex-wrap items-center gap-2">
                  <Pill tone="warning">{t("notSynced")}</Pill>
                  <SyncPlanButton planId={p.id} />
                </div>
              ),
              <PlanDialog key="e" plan={toValues(p)} nextPosition={plans.length} />,
            ],
          };
        })}
      />
    </div>
  );
}
