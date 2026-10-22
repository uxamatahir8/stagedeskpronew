import { CalendarIcon, FileDownIcon, MapPinIcon, PartyPopperIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { getFormatter, getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { type BookingStatus, type EventType, paymentStatus, todayInNetherlands } from "@stagedesk/core";
import { QuoteTable } from "@/components/booking/quote-table";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Stars } from "@/components/stars";
import { BookingStatusBadge, PaymentStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { euro, eventDate } from "@/lib/format";
import { requireAgency } from "@/lib/viewer";
import { ReviewForm } from "./review-form";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/event">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "customerEvent" });
  return { title: t("title") };
}

export default async function EventPage({ params, searchParams }: PageProps<"/[locale]/app/event">) {
  setRequestLocale((await params).locale as Locale);
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Event searchParams={searchParams} />
    </Suspense>
  );
}

async function Event({ searchParams }: Pick<PageProps<"/[locale]/app/event">, "searchParams">) {
  const { viewer, organization, db } = await requireAgency("customer.event");
  const [t, format, locale] = await Promise.all([getTranslations(), getFormatter(), getLocale()]);

  // Only the signed-in customer's own bookings at this agency.
  const bookings = await db.booking.findMany({
    where: { customerId: viewer.user.id },
    orderBy: [{ eventDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
    include: {
      quotes: { where: { status: { in: ["sent", "accepted"] } }, orderBy: { version: "desc" }, include: { items: { orderBy: { position: "asc" } } } },
      assignments: { where: { status: "accepted" }, include: { artist: { select: { stageName: true, photoUrl: true } } } },
      invoices: { select: { id: true, number: true } },
      review: true,
    },
  });
  if (bookings.length === 0) {
    return (
      <div className="grid gap-6">
        <PageHeader title={t("customerEvent.title")} />
        <EmptyState icon={PartyPopperIcon} title={t("customerEvent.noBooking", { agency: organization.name })} />
      </div>
    );
  }

  const today = todayInNetherlands();
  const requested = (await searchParams)["booking"];
  const upcoming = bookings.find((b) => b.eventDate && b.eventDate.toISOString().slice(0, 10) >= today && !["cancelled", "declined"].includes(b.status));
  const booking = bookings.find((b) => b.trackingCode === requested) ?? upcoming ?? bookings[0]!;
  const status = booking.status as BookingStatus;
  const quote = booking.quotes.find((q) => q.status === "accepted") ?? booking.quotes[0] ?? null;
  const artist = booking.assignments[0]?.artist ?? null;
  const daysToGo = booking.eventDate
    ? Math.round((booking.eventDate.getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86_400_000)
    : null;
  const langPrefix = locale === "en" ? "/en" : "";

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t(`eventTypes.${booking.eventType as EventType}`)}
        description={t(`customerEvent.status_${status}`, { agency: organization.name })}
        actions={<BookingStatusBadge status={status} />}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid content-start gap-6">
          {status === "quoted" && quote?.status === "sent" && (
            <Card className="border-primary/40 bg-accent/40">
              <CardContent className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-medium">{t("customerEvent.status_quoted")}</p>
                <Button asChild>
                  <a href={`${langPrefix}/q/${quote.token}`}>{t("customerEvent.viewQuote")}</a>
                </Button>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>{t("customerEvent.details")}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
              <p className="flex items-center gap-2">
                <CalendarIcon className="size-4 text-muted-foreground" />
                {eventDate(format, booking.eventDate) ?? t("bookings.noDate")}
                {booking.startTime && ` · ${booking.startTime}${booking.endTime ? `–${booking.endTime}` : ""}`}
              </p>
              <p className="flex items-center gap-2">
                <MapPinIcon className="size-4 text-muted-foreground" />
                {[booking.venueName, booking.venueCity].filter(Boolean).join(", ") || "—"}
              </p>
              {daysToGo !== null && daysToGo >= 0 && openOrBooked(status) && (
                <p className="text-2xl font-semibold tracking-tight sm:col-span-2">{t("customerEvent.daysToGo", { count: daysToGo })}</p>
              )}
            </CardContent>
          </Card>

          {quote && (
            <Card>
              <CardHeader>
                <CardTitle>{t("customerEvent.quote")}</CardTitle>
              </CardHeader>
              <CardContent>
                <QuoteTable quote={quote} />
              </CardContent>
            </Card>
          )}

          {(status === "completed" || status === "settled") && (
            <Card>
              <CardHeader>
                <CardTitle>{t("customerEvent.review")}</CardTitle>
              </CardHeader>
              <CardContent>
                {booking.review ? (
                  <div className="grid gap-2 text-sm">
                    <Stars rating={booking.review.rating} />
                    {booking.review.comment && <p className="whitespace-pre-line">{booking.review.comment}</p>}
                    <p className="text-muted-foreground">{t("customerEvent.reviewThanks")}</p>
                  </div>
                ) : (
                  <ReviewForm bookingId={booking.id} />
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="grid content-start gap-6">
          {artist && (
            <Card>
              <CardHeader>
                <CardTitle>{t("customerEvent.yourArtist")}</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center gap-3">
                {artist.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- served from /files
                  <img src={artist.photoUrl} alt="" className="size-12 rounded-xl object-cover" />
                ) : null}
                <span className="font-medium">{artist.stageName}</span>
              </CardContent>
            </Card>
          )}

          {booking.totalCents > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {t("customerEvent.payments")}
                  <PaymentStatusBadge status={paymentStatus(booking.paidCents, booking.totalCents, booking.depositCents)} />
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm">
                <p>{t("customerEvent.paidOf", { paid: euro(format, booking.paidCents), total: euro(format, booking.totalCents) })}</p>
                {booking.invoices.map((inv) => (
                  <Button key={inv.id} variant="outline" size="sm" asChild className="w-fit">
                    <a href={`/api/pdf/invoice/${inv.id}?lang=${locale}`} target="_blank" rel="noopener">
                      <FileDownIcon />
                      {t("customerEvent.invoice", { number: inv.number })}
                    </a>
                  </Button>
                ))}
              </CardContent>
            </Card>
          )}

          {bookings.length > 1 && (
            <Card>
              <CardHeader>
                <CardTitle>{t("customerEvent.otherBookings")}</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="grid gap-2 text-sm">
                  {bookings
                    .filter((b) => b.id !== booking.id)
                    .map((b) => (
                      <li key={b.id}>
                        <Link href={`/app/event?booking=${b.trackingCode}`} className="hover:underline">
                          {t(`eventTypes.${b.eventType as EventType}`)} · {eventDate(format, b.eventDate, "short") ?? t("bookings.noDate")}
                        </Link>
                      </li>
                    ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function openOrBooked(status: BookingStatus) {
  return ["inquiry", "quoted", "booked", "confirmed"].includes(status);
}
