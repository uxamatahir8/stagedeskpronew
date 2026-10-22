import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { prisma } from "@stagedesk/db";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import type { Locale } from "@/i18n/routing";
import { requireAgency } from "@/lib/viewer";
import { AgencyForm, LogoForm } from "./agency-forms";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/agency-settings">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "agencySettings" });
  return { title: t("title") };
}

export default async function AgencySettingsPage({ params }: PageProps<"/[locale]/app/agency-settings">) {
  setRequestLocale((await params).locale as Locale);
  return (
    <Suspense fallback={<Skeleton className="h-[40rem] w-full" />}>
      <AgencySettings />
    </Suspense>
  );
}

async function AgencySettings() {
  const { organization } = await requireAgency("agency.settings");
  const t = await getTranslations("agencySettings");
  // The id comes from the viewer's own membership, so this reads only their agency.
  const agency = await prisma.organization.findUniqueOrThrow({ where: { id: organization.id } });

  return (
    <div className="grid max-w-3xl gap-8">
      <PageHeader title={t("title")} description={t("description")} />
      <LogoForm name={agency.name} logo={agency.logo} />
      <AgencyForm
        values={{
          name: agency.name,
          kvkNumber: agency.kvkNumber ?? "",
          vatNumber: agency.vatNumber ?? "",
          contactEmail: agency.contactEmail ?? "",
          phone: agency.phone ?? "",
          website: agency.website ?? "",
          addressLine: agency.addressLine ?? "",
          postalCode: agency.postalCode ?? "",
          city: agency.city ?? "",
          brandColor: agency.brandColor ?? "",
        }}
      />
    </div>
  );
}
