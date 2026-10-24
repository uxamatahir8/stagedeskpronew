import { CalendarHeartIcon, CheckCircle2Icon, MessagesSquareIcon, Music2Icon, PartyPopperIcon, WalletIcon } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { type BookingStatus, type EventType, todayInNetherlands } from "@stagedesk/core";
import type { TenantDb } from "@stagedesk/db";
import { EmptyState } from "@/components/empty-state";
import { StatCard } from "@/components/stat-card";
import { BookingStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { euro, eventDate } from "@/lib/format";

/** Customer home: a countdown to their next event, money, artist, and quick links. */
export async function CustomerHome({ db, userId, agency }: { db: TenantDb; userId: string; agency: string }) {
  const today = todayInNetherlands();
  const [t, te, format, bookings] = await Promise.all([
    getTranslations("customerHome"),
    getTranslations("eventTypes"),
    getFormatter(),
    db.booking.findMany({
      where: { customerId: userId, status: { notIn: ["cancelled", "declined", "expired"] } },
      orderBy: [{ eventDate: { sort: "asc", nulls: "last" } }],
      include: { assignments: { where: { status: "accepted" }, take: 1, select: { artist: { select: { stageName: true } } } } },
    }),
  ]);
  const next = bookings.find((b) => b.eventDate && b.eventDate.toISOString().slice(0, 10) >= today) ?? bookings[0];
  if (!next) return <EmptyState icon={PartyPopperIcon} title={t("noBooking", { agency })} />;

  const days = next.eventDate ? Math.round((next.eventDate.getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86_400_000) : null;
  const artist = next.assignments[0]?.artist.stageName;

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
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href={`/app/event?booking=${next.trackingCode}`}>
              <PartyPopperIcon />
              {t("openEvent")}
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
    </>
  );
}
