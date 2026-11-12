import type { Metadata } from "next";
import { Suspense } from "react";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import type { Locale } from "@/i18n/routing";
import { requireAgency } from "@/lib/viewer";
import { ArrowLeftIcon } from "lucide-react";
import { availableBookingTypes, toDateOnly } from "@stagedesk/db";
import { Link } from "@/i18n/navigation";
import { NewBookingForm } from "./new-booking-form";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/bookings/new">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "newBooking" });
  return { title: t("title") };
}

export default async function NewBookingPage({ params, searchParams }: PageProps<"/[locale]/app/bookings/new">) {
  setRequestLocale((await params).locale as Locale);
  const t = await getTranslations("newBooking");
  return (
    <div className="grid max-w-3xl gap-6">
      <PageHeader title={t("title")} description={t("description")} />
      <Suspense fallback={<Skeleton className="h-[36rem] w-full" />}>
        <Form searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

/** ?date=YYYY-MM-DD (from the calendar) prefills the event date; anything else is ignored. */
function dateParam(value: string | string[] | undefined) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const d = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value ? value : undefined;
}

async function Form({ searchParams }: Pick<PageProps<"/[locale]/app/bookings/new">, "searchParams">) {
  const query = await searchParams;
  const date = dateParam(query["date"]);
  const fromCalendar = query["from"] === "calendar";
  const t = await getTranslations("newBooking");
  const { db, organization } = await requireAgency("agency.bookings.create");
  const [customers, bookingTypes, locale] = await Promise.all([db.member.findMany({
    where: { role: "customer" },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { user: { name: "asc" } },
  }), availableBookingTypes(organization.id), getLocale()]);
  // Same-day bookings are allowed (two artists, two events); the form says how many there are already.
  const sameDay = date ? await db.booking.count({ where: { eventDate: toDateOnly(date), status: { notIn: ["declined", "cancelled", "expired"] } } }) : 0;
  return (
    <>
      {fromCalendar && (
        <Link href={date ? `/app/calendar?month=${date.slice(0, 7)}` : "/app/calendar"} className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeftIcon className="size-4" />
          {t("backToCalendar")}
        </Link>
      )}
      {sameDay > 0 && <p className="rounded-lg border border-warning/50 bg-warning/10 p-3 text-sm">{t("sameDay", { count: sameDay })}</p>}
      <NewBookingForm initialDate={date} bookingTypes={bookingTypes.map((type) => ({ key: type.key, label: locale === "nl" ? type.nameNl : type.nameEn }))} customers={customers.map((c) => ({ id: c.user.id, name: c.user.name, email: c.user.email }))} />
    </>
  );
}
