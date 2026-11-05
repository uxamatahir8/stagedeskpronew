import { Suspense } from "react";
import { forbidden } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { availableBookingTypes } from "@stagedesk/db";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import type { Locale } from "@/i18n/routing";
import { requireViewer } from "@/lib/viewer";
import { BookingTypeManager } from "./booking-type-manager";

export default async function BookingTypesPage({ params }: PageProps<"/[locale]/app/booking-types">) {
  setRequestLocale((await params).locale as Locale);
  return <Suspense fallback={<Skeleton className="h-80" />}><Types /></Suspense>;
}

async function Types() {
  const viewer = await requireViewer();
  const platform = viewer.permissions.includes("platform.settings");
  if (!platform && (!viewer.organization || !viewer.permissions.includes("agency.booking-types"))) forbidden();
  const [t, rows] = await Promise.all([getTranslations("bookingTypesAdmin"), availableBookingTypes(viewer.organization?.id, true)]);
  const shown = platform ? rows.filter((r) => r.organizationId === null) : rows;
  return <div className="grid gap-6"><PageHeader title={t("title")} description={t(platform ? "descriptionPlatform" : "descriptionAgency")} /><BookingTypeManager platform={platform} rows={shown} /></div>;
}
