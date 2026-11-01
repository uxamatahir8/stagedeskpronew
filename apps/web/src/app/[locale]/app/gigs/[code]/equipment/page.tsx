import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { EquipmentWorkspace } from "@/components/inventory/equipment-workspace";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requireEquipmentAccess } from "@/lib/equipment-access";
import { equipmentWorkspace } from "@/lib/equipment-view";
import { getFormatter } from "@/lib/formatter";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/gigs/[code]/equipment">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "equipment" });
  return { title: t("title") };
}

export default function GigEquipmentPage({ params }: PageProps<"/[locale]/app/gigs/[code]/equipment">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Equipment params={params} />
    </Suspense>
  );
}

/**
 * The assigned artist's view of their gig's equipment. They see the list;
 * they record loading and returns once they accepted the gig and the agency
 * allows it. Withdrawn or declined assignments get a 404.
 */
async function Equipment({ params }: Pick<PageProps<"/[locale]/app/gigs/[code]/equipment">, "params">) {
  await connection();
  const { locale, code } = await params;
  setRequestLocale(locale as Locale);
  const access = await requireEquipmentAccess(code, "artist");
  const [t, ti, format] = await Promise.all([getTranslations("equipment"), getTranslations("inventory"), getFormatter()]);
  const data = await equipmentWorkspace(access, { kind: (k) => ti(`kind_${k as "case"}`), status: (s) => ti(`status_${s as "lost"}`) });
  if (!data) notFound();
  const { view, props } = data;
  const date = view.booking.eventDate ? format.dateTime(view.booking.eventDate, { weekday: "short", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : t("noDate");
  const title = `${view.booking.trackingCode} · ${date}`;

  return (
    <div className="grid max-w-4xl gap-6">
      <Link href={`/app/gigs/${view.booking.trackingCode}`} className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" />
        {t("backToGig")}
      </Link>
      <PageHeader title={t("title")} description={[title, view.booking.venueName, view.booking.venueCity].filter(Boolean).join(" · ")} />
      {!access.canHandle && <p className="text-sm text-muted-foreground">{t("artistReadOnly")}</p>}
      <EquipmentWorkspace {...props} title={title} />
    </div>
  );
}
