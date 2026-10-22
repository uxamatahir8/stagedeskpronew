import type { Metadata } from "next";
import { Suspense } from "react";
import { getFormatter, getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { feeRuleSchema, parseLimits } from "@stagedesk/core";
import { prisma } from "@stagedesk/db";
import { PageHeader } from "@/components/page-header";
import { Pill } from "@/components/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Locale } from "@/i18n/routing";
import { centsToInput, euro } from "@/lib/format";
import { requirePermission } from "@/lib/viewer";
import { type PlanValues, PlanDialog } from "./plan-dialog";

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
      <Card>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("nameNl")}</TableHead>
                <TableHead className="text-right">{t("monthly")}</TableHead>
                <TableHead className="text-right">{t("yearly")}</TableHead>
                <TableHead>{t("limits")}</TableHead>
                <TableHead>Stripe</TableHead>
                <TableHead className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {plans.map((p) => {
                const limits = parseLimits(p.limits);
                return (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2 font-medium">
                        {String(text(p.name, locale === "en" ? "en" : "nl") ?? p.key)}
                        {p.recommended && <Pill tone="brand">{t("recommended")}</Pill>}
                        {!p.visible && <Pill>{t("hidden")}</Pill>}
                        {!p.active && <Pill tone="danger">{t("inactive")}</Pill>}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        <span className="font-mono">{p.key}</span> · {t("agencies", { count: p._count.subscriptions })}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{euro(format, p.monthlyPriceCents)}</TableCell>
                    <TableCell className="text-right tabular-nums">{euro(format, p.yearlyPriceCents)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {limits.maxArtists ?? "∞"} / {limits.maxStaff ?? "∞"} / {limits.maxBookingsPerMonth ?? "∞"}
                    </TableCell>
                    <TableCell>
                      {p.stripeMonthlyPriceId ? <Pill tone="success">{t("synced")}</Pill> : <Pill tone="warning">{t("notSynced")}</Pill>}
                    </TableCell>
                    <TableCell>
                      <PlanDialog plan={toValues(p)} nextPosition={plans.length} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
