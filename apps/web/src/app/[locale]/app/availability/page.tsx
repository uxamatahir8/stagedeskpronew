import { CalendarOffIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { getFormatter, getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { todayInNetherlands } from "@stagedesk/core";
import { prisma, toDateOnly } from "@stagedesk/db";
import { EmptyState } from "@/components/empty-state";
import { monthDays, shiftMonth, weekdayNames } from "@/components/month-grid";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requireAgency } from "@/lib/viewer";
import { AvailabilityGrid } from "./availability-grid";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/availability">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "availability" });
  return { title: t("title") };
}

export default async function AvailabilityPage({ params, searchParams }: PageProps<"/[locale]/app/availability">) {
  setRequestLocale((await params).locale as Locale);
  const t = await getTranslations("availability");
  return (
    <div className="grid gap-6">
      <PageHeader title={t("title")} description={t("description")} />
      <Suspense fallback={<Skeleton className="h-[36rem] w-full" />}>
        <Availability searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Availability({ searchParams }: Pick<PageProps<"/[locale]/app/availability">, "searchParams">) {
  const { viewer, db } = await requireAgency("artist.availability");
  const t = await getTranslations();
  const artist = await db.artist.findFirst({ where: { userId: viewer.user.id }, select: { id: true } });
  if (!artist) return <EmptyState icon={CalendarOffIcon} title={t("gigs.noProfile")} />;

  const today = todayInNetherlands();
  const requested = (await searchParams)["month"];
  const month = typeof requested === "string" && /^\d{4}-\d{2}$/.test(requested) ? requested : today.slice(0, 7);
  const days = monthDays(month);
  const range = { gte: toDateOnly(days[0]!), lte: toDateOnly(days.at(-1)!) };

  const [format, locale, blocked, gigs] = await Promise.all([
    getFormatter(),
    getLocale(),
    db.artistUnavailability.findMany({ where: { artistId: artist.id, date: range }, select: { date: true } }),
    prisma.bookingAssignment.findMany({
      where: { artist: { userId: viewer.user.id }, status: { in: ["pending", "accepted"] }, booking: { eventDate: range, status: { in: ["booked", "confirmed"] } } },
      select: { booking: { select: { eventDate: true } } },
    }),
  ]);
  const title = format.dateTime(new Date(`${month}-15T12:00:00Z`), { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="icon-sm" asChild>
          <Link href={`/app/availability?month=${shiftMonth(month, -1)}`} aria-label={t("calendar.previous")}>
            <ChevronLeftIcon />
          </Link>
        </Button>
        <Button variant="outline" size="icon-sm" asChild>
          <Link href={`/app/availability?month=${shiftMonth(month, 1)}`} aria-label={t("calendar.next")}>
            <ChevronRightIcon />
          </Link>
        </Button>
        <h2 className="text-lg font-semibold capitalize">{title}</h2>
        <div className="ml-auto flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-3 rounded bg-destructive/20" /> {t("availability.unavailable")}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-3 rounded bg-success/25" /> {t("availability.gig")}
          </span>
        </div>
      </div>
      <AvailabilityGrid
        month={month}
        today={today}
        weekdays={weekdayNames(locale)}
        blocked={blocked.map((b) => b.date.toISOString().slice(0, 10))}
        gigs={gigs.flatMap((g) => (g.booking.eventDate ? [g.booking.eventDate.toISOString().slice(0, 10)] : []))}
      />
    </div>
  );
}
