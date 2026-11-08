import type { Metadata } from "next";
import { Suspense } from "react";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { activePlans, availableBookingTypes, ecbRates, getSetting } from "@stagedesk/db";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import type { Locale } from "@/i18n/routing";
import { requirePermission } from "@/lib/viewer";
import { AffiliateProgramForm } from "./affiliate-program-form";
import { CurrenciesForm } from "./currencies-form";
import { MarketplaceForm } from "./marketplace-form";
import { SettingsForms } from "./settings-forms";
import { SiteProofForm } from "./site-proof-form";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/settings">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "platformSettings" });
  return { title: t("title") };
}

export default async function SettingsPage({ params }: PageProps<"/[locale]/app/settings">) {
  setRequestLocale((await params).locale as Locale);
  return (
    <Suspense fallback={<Skeleton className="h-[40rem] w-full" />}>
      <Settings />
    </Suspense>
  );
}

async function Settings() {
  await requirePermission("platform.settings");
  const [t, locale, fees, bookings, billing, site, plans, program, currencySetting, ecb, marketplace, proof, eventTypes] = await Promise.all([
    getTranslations("platformSettings"),
    getLocale(),
    getSetting("fees.platform"),
    getSetting("bookings.defaults"),
    getSetting("billing.defaults"),
    getSetting("site.general"),
    activePlans(),
    getSetting("affiliates.program"),
    getSetting("currencies"),
    ecbRates(),
    getSetting("marketplace"),
    getSetting("site.proof"),
    availableBookingTypes(),
  ]);
  return (
    <div className="grid max-w-3xl gap-6">
      <PageHeader title={t("title")} description={t("description")} />
      <SettingsForms
        fees={fees}
        bookings={bookings}
        billing={billing}
        site={site}
        plans={plans.map((p) => ({ key: p.key, name: String(((p.name ?? {}) as Record<string, string>)[locale] ?? p.key) }))}
      />
      <CurrenciesForm value={currencySetting} ecb={ecb.map((r) => ({ currency: r.currency, perEur: Number(r.perEur), date: r.rateDate.toISOString().slice(0, 10) }))} />
      <SiteProofForm value={proof} />
      <MarketplaceForm value={marketplace} eventTypes={eventTypes.map((type) => ({ key: type.key, label: locale === "nl" ? type.nameNl : type.nameEn }))} />
      <AffiliateProgramForm program={program} />
    </div>
  );
}
