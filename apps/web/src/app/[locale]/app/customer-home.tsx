import { CalendarHeartIcon, CheckCircle2Icon, MessagesSquareIcon, Music2Icon, PartyPopperIcon, PlusIcon, WalletIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { getFormatter } from "@/lib/formatter";
import { type BookingStatus, type EventType, todayInNetherlands } from "@stagedesk/core";
import type { TenantDb } from "@stagedesk/db";
import { EmptyState } from "@/components/empty-state";
import { StatCard } from "@/components/stat-card";
import { BookingStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { euro, eventDate } from "@/lib/format";

/** Customer home: a countdown to their next event, money, artist, quick links, and asking for a booking. */
export async function CustomerHome({ db, userId, agency }: { db: TenantDb; userId: string; agency: string }) {
  const today = todayInNetherlands();
  const [t, te, tb, format, bookings] = await Promise.all([
    getTranslations("customerHome"),
    getTranslations("eventTypes"),
    getTranslations("bookings"),
    getFormatter(),
    db.booking.findMany({
      where: { customerId: userId, status: { notIn: ["cancelled", "declined", "expired"] } },
      orderBy: [{ eventDate: { sort: "asc", nulls: "last" } }],
      include: { assignments: { where: { status: "accepted" }, take: 1, select: { artist: { select: { stageName: true } } } } },
    }),
  ]);
  const request = (label: string, variant: "default" | "outline" = "default") => (
    <Button asChild variant={variant} data-testid="request-booking">
      <Link href="/app/event/request">
        <PlusIcon />
        {label}
      </Link>
    </Button>
  );
  const next = bookings.find((b) => b.eventDate && b.eventDate.toISOString().slice(0, 10) >= today) ?? bookings[0];
  if (!next) return <EmptyState icon={PartyPopperIcon} title={t("noBooking", { agency })} description={t("noBookingBody")} action={request(t("requestBooking"))} />;

  const days = next.eventDate ? Math.round((next.eventDate.getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86_400_000) : null;
  const artist = next.assignments[0]?.artist.stageName;
  const others = bookings.filter((b) => b.id !== next.id);

  return (
    <>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard index={0} label={t("daysToGo")} value={days === null ? "—" : days < 0 ? t("past") : days} hint={eventDate(format, next.eventDate) ?? undefined} icon={CalendarHeartIcon} />
        <StatCard index={1} label={t("paid")} value={euro(format, next.paidCents, next.currency)} icon={CheckCircle2Icon} />
        <StatCard index={2} label={t("due")} value={euro(format, Math.max(0, next.totalCents - next.paidCents), next.currency)} icon={WalletIcon} />
        <StatCard index={3} label={t("artist")} value={artist ?? "—"} hint={artist ? undefined : t("noArtistYet")} icon={Music2Icon} />
      </section>
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            {te(next.eventType as EventType)}
            <BookingStatusBadge status={next.status as BookingStatus} />
          </CardTitle>
          <CardAction>{request(t("requestAnother"), "outline")}</CardAction>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href={`/app/event?booking=${next.trackingCode}`}>
              <PartyPopperIcon />
              {t("openEvent")}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/app/event?booking=${next.trackingCode}#preferences`}>
              <Music2Icon />
              {t("editPreferences")}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/app/messages/${next.trackingCode}?channel=customer`}>
              <MessagesSquareIcon />
              {t("messageAgency", { agency })}
            </Link>
          </Button>
          {next.totalCents > next.paidCents && (
            <Button asChild variant="outline">
              <Link href="/app/my-payments">
                <WalletIcon />
                {t("pay")}
              </Link>
            </Button>
          )}
        </CardContent>
      </Card>
      {others.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("otherBookings")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {others.map((b) => (
                <li key={b.id}>
                  <Link href={`/app/event?booking=${b.trackingCode}`} className="flex flex-wrap items-center justify-between gap-2 py-3 hover:bg-accent/40">
                    <span className="font-medium">
                      {te(b.eventType as EventType)} · {eventDate(format, b.eventDate, "short") ?? tb("noDate")}
                    </span>
                    <BookingStatusBadge status={b.status as BookingStatus} />
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </>
  );
}
