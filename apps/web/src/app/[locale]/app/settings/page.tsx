import type { Metadata } from "next";
import { Suspense } from "react";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { activePlans, getSetting } from "@stagedesk/db";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import type { Locale } from "@/i18n/routing";
import { requirePermission } from "@/lib/viewer";
import { SettingsForms } from "./settings-forms";

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
  const [t, locale, fees, bookings, billing, site, plans] = await Promise.all([
    getTranslations("platformSettings"),
    getLocale(),
    getSetting("fees.platform"),
    getSetting("bookings.defaults"),
    getSetting("billing.defaults"),
    getSetting("site.general"),
    activePlans(),
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
    </div>
  );
}
