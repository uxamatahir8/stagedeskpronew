import type { Metadata } from "next";
import { Suspense } from "react";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { listBookingPromoCodes } from "@stagedesk/db";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import type { Locale } from "@/i18n/routing";
import { getFormatter } from "@/lib/formatter";
import { centsToInput, euro, eventDate } from "@/lib/format";
import { requireAgency } from "@/lib/viewer";
import { BookingPromoCodes } from "./codes";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/promo-codes">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "promoCodes" });
  return { title: t("agencyTitle") };
}

export default async function PromoCodesPage({ params }: PageProps<"/[locale]/app/promo-codes">) {
  setRequestLocale((await params).locale as Locale);
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Codes />
    </Suspense>
  );
}

const ymd = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

async function Codes() {
  const { organization } = await requireAgency("agency.services");
  const [t, format, locale, codes] = await Promise.all([getTranslations("promoCodes"), getFormatter(), getLocale(), listBookingPromoCodes(organization.id)]);
  return (
    <div className="grid gap-6">
      <PageHeader title={t("agencyTitle")} description={t("agencyDescription")} />
      <BookingPromoCodes
        codes={codes.map((c) => ({
          id: c.id,
          discount: c.discountType === "percentage" ? `${(c.percentBps ?? 0) / 100}%` : euro(format, c.amountCents ?? 0),
          valid:
            c.validFrom || c.validUntil
              ? `${c.validFrom ? (eventDate(format, c.validFrom, "short") ?? "") : "…"} – ${c.validUntil ? (eventDate(format, c.validUntil, "short") ?? "") : "…"}`
              : t("always"),
          minimum: c.minTotalCents ? euro(format, c.minTotalCents) : "—",
          uses: c.maxRedemptions ? `${c._count.redemptions} / ${c.maxRedemptions}` : String(c._count.redemptions),
          used: c._count.redemptions > 0,
          values: {
            code: c.code,
            description: c.description ?? "",
            discountType: c.discountType === "fixed" ? "fixed" : "percentage",
            amount: c.discountType === "fixed" ? centsToInput(c.amountCents ?? 0, locale) : String((c.percentBps ?? 0) / 100),
            minimum: c.minTotalCents ? centsToInput(c.minTotalCents, locale) : "",
            validFrom: ymd(c.validFrom),
            validUntil: ymd(c.validUntil),
            max: c.maxRedemptions ? String(c.maxRedemptions) : "",
            active: c.active,
          },
        }))}
      />
    </div>
  );
}
