import { CalendarClockIcon, CalendarIcon, HandCoinsIcon, InboxIcon, MapPinIcon, WalletIcon } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { type EventType, percentOf, todayInNetherlands } from "@stagedesk/core";
import { prisma, toDateOnly } from "@stagedesk/db";
import { EmptyState } from "@/components/empty-state";
import { StatCard } from "@/components/stat-card";
import { AssignmentStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { euro, eventDate } from "@/lib/format";

const listOf = (value: unknown) => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && v.trim() !== "") : []);

/** Artist home: requests to answer, the next gigs with their brief, and earnings. */
export async function ArtistHome({ userId }: { userId: string }) {
  const today = todayInNetherlands();
  const yearStart = new Date(`${today.slice(0, 4)}-01-01T00:00:00Z`);
  // An artist's own gigs, at their agency and at partner agencies they're shared with.
  const [t, te, format, assignments, paid] = await Promise.all([
    getTranslations("artistHome"),
    getTranslations("eventTypes"),
    getFormatter(),
    prisma.bookingAssignment.findMany({
      where: { artist: { userId }, status: { in: ["pending", "accepted"] }, booking: { status: { in: ["booked", "confirmed"] }, eventDate: { gte: toDateOnly(today) } } },
      orderBy: { booking: { eventDate: "asc" } },
      take: 20,
      include: {
        artist: { select: { stageName: true } },
        booking: {
          select: {
            trackingCode: true, eventType: true, eventDate: true, startTime: true, endTime: true, venueName: true, venueCity: true,
            guestCount: true, totalCents: true, currency: true, dos: true, donts: true, playlistUrl: true, organization: { select: { name: true } },
          },
        },
      },
    }),
    prisma.ledgerEntry.aggregate({
      where: { type: { in: ["transfer", "transfer_reversal"] }, party: "artist", createdAt: { gte: yearStart }, artistId: { in: (await prisma.artist.findMany({ where: { userId }, select: { id: true } })).map((a) => a.id) } },
      _sum: { amountCents: true },
    }),
  ]);
  const requests = assignments.filter((a) => a.status === "pending");
  const gigs = assignments.filter((a) => a.status === "accepted");
  // In the currency of the next gig; gigs in another currency are left out of the sum.
  const currency = gigs[0]?.booking.currency ?? "EUR";
  const upcoming = gigs.filter((a) => a.booking.currency === currency).reduce((sum, a) => sum + percentOf(a.booking.totalCents, a.shareBps), 0);
  const next = gigs[0];

  return (
    <>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard index={0} label={t("nextGig")} value={next ? (eventDate(format, next.booking.eventDate, "short") ?? "—") : "—"} hint={next ? next.booking.organization.name : t("noGigs")} icon={CalendarClockIcon} />
        <StatCard index={1} label={t("requests")} value={requests.length} icon={InboxIcon} />
        <StatCard index={2} label={t("upcomingEarnings")} value={euro(format, upcoming, currency)} hint={t("gigCount", { count: gigs.length })} icon={HandCoinsIcon} />
        <StatCard index={3} label={t("paidThisYear")} value={euro(format, paid._sum.amountCents ?? 0, currency)} icon={WalletIcon} />
      </section>

      {requests.length > 0 && (
        <Card className="border-warning/60">
          <CardHeader>
            <CardTitle>{t("requestsTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {requests.map((a) => (
                <li key={a.id}>
                  <Link href={`/app/gigs/${a.booking.trackingCode}`} className="flex flex-wrap items-center justify-between gap-2 py-3 hover:bg-accent/40">
                    <span className="grid">
                      <span className="font-medium">
                        {te(a.booking.eventType as EventType)} · {eventDate(format, a.booking.eventDate, "short")}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {a.booking.organization.name} · {a.artist.stageName}
                      </span>
                    </span>
                    <AssignmentStatusBadge status="pending" />
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("nextGigs")}</CardTitle>
          <CardAction>
            <Button asChild variant="outline" size="sm">
              <Link href="/app/gigs">{t("allGigs")}</Link>
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {gigs.length === 0 ? (
            <EmptyState icon={CalendarIcon} title={t("noGigs")} />
          ) : (
            <ul className="grid gap-4">
              {gigs.slice(0, 3).map((a) => {
                const b = a.booking;
                const dos = listOf(b.dos);
                const donts = listOf(b.donts);
                return (
                  <li key={a.id} className="grid gap-2 rounded-lg border p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <Link href={`/app/gigs/${b.trackingCode}`} className="font-medium underline-offset-4 hover:underline">
                        {te(b.eventType as EventType)} · {eventDate(format, b.eventDate)}
                      </Link>
                      <span className="text-sm text-muted-foreground">{b.organization.name}</span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      {(b.startTime || b.endTime) && <span>{[b.startTime, b.endTime].filter(Boolean).join("–")}</span>}
                      {(b.venueName || b.venueCity) && (
                        <span className="flex items-center gap-1">
                          <MapPinIcon className="size-3.5" aria-hidden />
                          {[b.venueName, b.venueCity].filter(Boolean).join(", ")}
                        </span>
                      )}
                      {b.guestCount && <span>{t("guests", { count: b.guestCount })}</span>}
                    </div>
                    {(dos.length > 0 || donts.length > 0) && (
                      <div className="grid gap-2 text-sm sm:grid-cols-2">
                        {dos.length > 0 && (
                          <p>
                            <span className="font-medium">{t("dos")}:</span> {dos.join(", ")}
                          </p>
                        )}
                        {donts.length > 0 && (
                          <p>
                            <span className="font-medium">{t("donts")}:</span> {donts.join(", ")}
                          </p>
                        )}
                      </div>
                    )}
                    {b.playlistUrl && (
                      <a href={b.playlistUrl} target="_blank" rel="noopener noreferrer" className="w-fit text-sm text-primary underline-offset-4 hover:underline">
                        {t("playlist")}
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
