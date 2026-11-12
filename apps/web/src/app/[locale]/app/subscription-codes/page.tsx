import type { Metadata } from "next";
import { Suspense } from "react";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { listPlatformPromoCodes, planKeysOf, prisma } from "@stagedesk/db";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import type { Locale } from "@/i18n/routing";
import { getFormatter } from "@/lib/formatter";
import { euro, eventDate } from "@/lib/format";
import { requirePermission } from "@/lib/viewer";
import { SubscriptionCodes } from "./codes";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/subscription-codes">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "promoCodes" });
  return { title: t("platformTitle") };
}

export default async function SubscriptionCodesPage({ params }: PageProps<"/[locale]/app/subscription-codes">) {
  setRequestLocale((await params).locale as Locale);
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Codes />
    </Suspense>
  );
}

async function Codes() {
  await requirePermission("platform.plans");
  const [t, format, locale, codes, plans] = await Promise.all([
    getTranslations("promoCodes"),
    getFormatter(),
    getLocale(),
    listPlatformPromoCodes(),
    prisma.plan.findMany({ where: { active: true }, orderBy: { position: "asc" }, select: { key: true, name: true } }),
  ]);
  const planName = (key: string) => {
    const name = plans.find((p) => p.key === key)?.name as Record<string, string> | undefined;
    return name?.[locale] ?? name?.["nl"] ?? key;
  };
  return (
    <div className="grid gap-6">
      <PageHeader title={t("platformTitle")} description={t("platformDescription")} />
      <SubscriptionCodes
        plans={plans.map((p) => ({ key: p.key, name: planName(p.key) }))}
        codes={codes.map((c) => ({
          id: c.id,
          code: c.code,
          description: c.description,
          discount: c.discountType === "percentage" ? `${(c.percentBps ?? 0) / 100}%` : euro(format, c.amountCents ?? 0),
          duration: c.duration === "repeating" ? t("duration_months", { count: c.durationMonths ?? 1 }) : t(`duration_${c.duration as "once" | "forever"}`),
          plans: planKeysOf(c).map(planName).join(", ") || t("allPlans"),
          uses: c.maxRedemptions ? `${c._count.redemptions} / ${c.maxRedemptions}` : String(c._count.redemptions),
          expires: c.expiresAt ? (eventDate(format, c.expiresAt, "short") ?? "") : "—",
          firstOnly: c.firstSubscriptionOnly,
          active: c.active,
          inStripe: Boolean(c.stripePromotionCodeId),
        }))}
      />
    </div>
  );
}
