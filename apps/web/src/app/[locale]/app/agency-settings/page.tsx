import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { formatIban } from "@stagedesk/core";
import { enabledCurrencies, getSetting, prisma } from "@stagedesk/db";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import type { Locale } from "@/i18n/routing";
import { platformDatePrefs } from "@/lib/date-prefs";
import { requireAgency } from "@/lib/viewer";
import { AgencyForm, LogoForm } from "./agency-forms";
import { PaymentMethodsForm } from "./payment-methods-form";
import { ServiceAreaForm } from "./service-area-form";

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
  const [agency, allowed, connected, platformDates, currencyOptions] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: organization.id } }),
    getSetting("payments.methods"),
    prisma.connectedAccount.count({ where: { organizationId: organization.id, artistId: null, chargesEnabled: true } }),
    platformDatePrefs(),
    enabledCurrencies(),
  ]);

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
          currency: agency.currency,
        }}
        dates={{ timeZone: agency.timeZone ?? "", dateFormat: agency.dateFormat ?? "", timeFormat: agency.timeFormat ?? "" }}
        platformDates={platformDates}
        currencyOptions={currencyOptions.includes(agency.currency as never) ? currencyOptions : [agency.currency, ...currencyOptions]}
      />
      <ServiceAreaForm
        initial={{
          acceptsLeads: agency.acceptsLeads,
          regions: Array.isArray(agency.serviceRegions) ? (agency.serviceRegions as string[]) : [],
          radiusKm: agency.serviceRadiusKm ? String(agency.serviceRadiusKm) : "",
          eventTypes: Array.isArray(agency.serviceEventTypes) ? (agency.serviceEventTypes as string[]) : null,
          located: agency.latitude !== null ? [agency.addressLine, agency.city].filter(Boolean).join(", ") || agency.city : null,
          ownCity: agency.city,
        }}
      />
      <PaymentMethodsForm
        values={{
          acceptOnline: agency.acceptOnline,
          acceptBankTransfer: agency.acceptBankTransfer,
          acceptCash: agency.acceptCash,
          iban: agency.iban ? formatIban(agency.iban) : "",
          bankAccountName: agency.bankAccountName ?? "",
          paymentInstructions: agency.paymentInstructions ?? "",
        }}
        allowed={{ online: allowed.online, bankTransfer: allowed.bankTransfer, cash: allowed.cash }}
        stripeConnected={connected > 0}
      />
    </div>
  );
}
