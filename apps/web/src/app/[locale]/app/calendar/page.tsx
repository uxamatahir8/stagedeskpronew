import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { getFormatter } from "@/lib/formatter";
import { type BookingStatus, todayInNetherlands } from "@stagedesk/core";
import { toDateOnly } from "@stagedesk/db";
import { MonthGrid, monthDays, shiftMonth, weekdayNames } from "@/components/month-grid";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import { requireAgency } from "@/lib/viewer";

const chip: Partial<Record<BookingStatus, string>> = {
  inquiry: "bg-info/12 text-info",
  quoted: "bg-warning/18 text-foreground",
  booked: "bg-primary/12 text-primary",
  confirmed: "bg-success/14 text-success",
  completed: "bg-muted text-muted-foreground",
  settled: "bg-muted text-muted-foreground",
};

export async function generateMetadata({ params }: PageProps<"/[locale]/app/calendar">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "calendar" });
  return { title: t("title") };
}

export default async function CalendarPage({ params, searchParams }: PageProps<"/[locale]/app/calendar">) {
  setRequestLocale((await params).locale as Locale);
  const t = await getTranslations("calendar");
  return (
    <div className="grid gap-6">
      <PageHeader title={t("title")} description={t("description")} />
      <Suspense fallback={<Skeleton className="h-[36rem] w-full" />}>
        <Calendar searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Calendar({ searchParams }: Pick<PageProps<"/[locale]/app/calendar">, "searchParams">) {
  const { db } = await requireAgency("agency.calendar");
  const today = todayInNetherlands();
  const requested = (await searchParams)["month"];
  const month = typeof requested === "string" && /^\d{4}-\d{2}$/.test(requested) ? requested : today.slice(0, 7);
  const days = monthDays(month);

  const [t, format, locale, bookings] = await Promise.all([
    getTranslations("calendar"),
    getFormatter(),
    getLocale(),
    db.booking.findMany({
      where: {
        eventDate: { gte: toDateOnly(days[0]!), lte: toDateOnly(days.at(-1)!) },
        status: { notIn: ["declined", "cancelled", "expired"] },
      },
      include: { customer: { select: { name: true } } },
      orderBy: { startTime: "asc" },
    }),
  ]);
  const byDay = Map.groupBy(bookings, (b) => b.eventDate!.toISOString().slice(0, 10));
  const title = format.dateTime(new Date(`${month}-15T12:00:00Z`), { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="icon-sm" asChild>
          <Link href={`/app/calendar?month=${shiftMonth(month, -1)}`} aria-label={t("previous")}>
            <ChevronLeftIcon />
          </Link>
        </Button>
        <Button variant="outline" size="icon-sm" asChild>
          <Link href={`/app/calendar?month=${shiftMonth(month, 1)}`} aria-label={t("next")}>
            <ChevronRightIcon />
          </Link>
        </Button>
        <h2 className="text-lg font-semibold capitalize">{title}</h2>
        <Button variant="ghost" size="sm" asChild className="ml-auto">
          <Link href="/app/calendar">{t("today")}</Link>
        </Button>
      </div>
      <MonthGrid
        month={month}
        today={today}
        weekdays={weekdayNames(locale)}
        renderDay={(date) => {
          const list = byDay.get(date) ?? [];
          return (
            <ul className="grid gap-1">
              {list.slice(0, 3).map((b) => (
                <li key={b.id}>
                  <Link
                    href={`/app/bookings/${b.trackingCode}`}
                    className={cn("block truncate rounded px-1.5 py-0.5 text-xs font-medium", chip[b.status as BookingStatus])}
                  >
                    {b.startTime && <span className="tabular-nums">{b.startTime} </span>}
                    {b.customer?.name ?? b.trackingCode}
                  </Link>
                </li>
              ))}
              {list.length > 3 && <li className="px-1.5 text-xs text-muted-foreground">{t("more", { count: list.length - 3 })}</li>}
            </ul>
          );
        }}
      />
    </div>
  );
}
