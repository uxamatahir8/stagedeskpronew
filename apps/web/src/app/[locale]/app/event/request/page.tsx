import { CalendarXIcon } from "lucide-react";
import type { Metadata } from "next";
import { forbidden } from "next/navigation";
import { Suspense } from "react";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { todayInNetherlands } from "@stagedesk/core";
import { agencyFullyBookedDates, agencyTakesRequests, availableBookingTypes, prisma, publicArtists } from "@stagedesk/db";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import type { Locale } from "@/i18n/routing";
import { writeBlocked } from "@/lib/billing";
import { requireViewer } from "@/lib/viewer";
import { RequestForm } from "./request-form";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/event/request">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "customerRequest" });
  return { title: t("title") };
}

export default async function RequestPage({ params, searchParams }: PageProps<"/[locale]/app/event/request">) {
  setRequestLocale((await params).locale as Locale);
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Request searchParams={searchParams} />
    </Suspense>
  );
}

async function Request({ searchParams }: Pick<PageProps<"/[locale]/app/event/request">, "searchParams">) {
  const viewer = await requireViewer();
  // Only agencies this person is a customer of can be chosen.
  const agencies = viewer.memberships.filter((m) => m.role === "customer");
  if (agencies.length === 0) forbidden();
  const asked = (await searchParams)["agency"];
  const agency = agencies.find((a) => a.id === asked) ?? agencies.find((a) => a.id === viewer.organization?.id) ?? agencies[0]!;
  const t = await getTranslations("customerRequest");
  const today = todayInNetherlands();

  const open = (await agencyTakesRequests(agency.id)) && !(await writeBlocked(agency.id));
  const until = new Date(`${today}T00:00:00Z`);
  until.setUTCMonth(until.getUTCMonth() + 18);
  const [artists, fullyBooked, me, bookingTypes, locale] = await Promise.all([
    open ? publicArtists(agency.id) : [],
    open ? agencyFullyBookedDates(agency.id, today, until.toISOString().slice(0, 10)) : [],
    prisma.user.findUniqueOrThrow({ where: { id: viewer.user.id }, select: { name: true, email: true, phone: true } }),
    availableBookingTypes(agency.id),
    getLocale(),
  ]);

  return (
    <div className="grid max-w-3xl gap-6">
      <PageHeader title={t("title")} description={t("description", { agency: agency.name })} />
      {open ? (
        <RequestForm
          agencies={agencies.map((a) => ({ id: a.id, name: a.name }))}
          agency={{ id: agency.id, name: agency.name }}
          artists={artists.map((a) => ({ id: a.id, stageName: a.stageName }))}
          fullyBooked={fullyBooked}
          today={today}
          contact={{ name: me.name, email: me.email, phone: me.phone ?? "" }}
          isActiveAgency={viewer.organization?.id === agency.id}
          bookingTypes={bookingTypes.map((type) => ({ key: type.key, label: locale === "nl" ? type.nameNl : type.nameEn }))}
        />
      ) : (
        <EmptyState icon={CalendarXIcon} title={t("closed", { agency: agency.name })} description={t("closedBody")} />
      )}
    </div>
  );
}
