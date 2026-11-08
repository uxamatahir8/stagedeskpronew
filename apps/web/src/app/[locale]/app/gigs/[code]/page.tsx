import { ArrowLeftIcon, BoxesIcon, CalendarIcon, ClipboardListIcon, ClockIcon, MapPinIcon, MessagesSquareIcon, UsersIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getFormatter } from "@/lib/formatter";
import { type EventType, gigState, playlistLink, todayInNetherlands, eventTimeRange } from "@stagedesk/core";
import { currentArtistProfile, liveAssignmentOnBooking, prisma } from "@stagedesk/db";
import { EmptyState } from "@/components/empty-state";
import { GigStateBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { euro, eventDate, percent } from "@/lib/format";
import { requirePermission } from "@/lib/viewer";
import { CompleteGig, RespondGig } from "./gig-actions";

export default function GigPage({ params }: PageProps<"/[locale]/app/gigs/[code]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Gig params={params} />
    </Suspense>
  );
}

const listOf = (value: unknown) => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []);

async function Gig({ params }: Pick<PageProps<"/[locale]/app/gigs/[code]">, "params">) {
  const { code, locale } = await params;
  setRequestLocale(locale as Locale);
  const viewer = await requirePermission("artist.gigs");

  // The one artist access policy: their own open assignment, while they still work for that profile's agency.
  const assignment = await prisma.bookingAssignment.findFirst({
    where: liveAssignmentOnBooking(viewer.user.id, code),
    orderBy: { createdAt: "desc" },
    include: {
      booking: {
        include: { organization: { select: { name: true, phone: true, contactEmail: true } }, customer: { select: { name: true } } },
      },
    },
  });
  if (!assignment) {
    // A link from an older notification or email: say what happened instead of a dead end. Nothing
    // about the booking is shown any more, only that this artist's own assignment ended.
    const ended = await prisma.bookingAssignment.findFirst({
      where: { artist: currentArtistProfile(viewer.user.id), booking: { trackingCode: code.toUpperCase() } },
      orderBy: { createdAt: "desc" },
      select: { status: true, createdAt: true, booking: { select: { status: true, eventDate: true, organization: { select: { name: true } } } } },
    });
    if (!ended) notFound();
    const t = await getTranslations("gigs");
    const state = gigState(
      { assignmentStatus: ended.status, bookingStatus: ended.booking.status, eventDate: ended.booking.eventDate?.toISOString().slice(0, 10) ?? null, createdAt: ended.createdAt },
      todayInNetherlands(),
    );
    return (
      <div className="grid max-w-3xl gap-6">
        <Link href="/app/gigs" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeftIcon className="size-4" />
          {t("back")}
        </Link>
        <EmptyState icon={ClipboardListIcon} title={t("endedTitle", { agency: ended.booking.organization.name })} description={<GigStateBadge state={state} />} />
      </div>
    );
  }
  const b = assignment.booking;
  const state = gigState({ assignmentStatus: assignment.status, bookingStatus: b.status, eventDate: b.eventDate?.toISOString().slice(0, 10) ?? null, createdAt: assignment.createdAt }, todayInNetherlands());
  const playlist = playlistLink(b.playlistUrl);

  // Equipment for this gig, read through the assignment found above (the booking may be another agency's).
  const [t, format, equipmentLines] = await Promise.all([getTranslations(), getFormatter(), prisma.bookingEquipment.aggregate({ where: { bookingId: b.id }, _count: { _all: true }, _sum: { quantity: true, loadedQty: true } })]);
  const equipmentCount = equipmentLines._count._all;
  const today = todayInNetherlands();
  const eventReached = b.eventDate !== null && b.eventDate.toISOString().slice(0, 10) <= today;
  const dos = listOf(b.dos);
  const donts = listOf(b.donts);

  return (
    <div className="grid max-w-3xl gap-6">
      <Link href="/app/gigs" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" />
        {t("gigs.back")}
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{t(`eventTypes.${b.eventType as EventType}`)}</h1>
            <GigStateBadge state={state} />
          </div>
          <p className="text-muted-foreground">
            {b.organization.name} ·{" "}
            {assignment.compensationType === "fixed" && assignment.fixedFeeCents !== null
              ? t("gigs.yourFee", { amount: euro(format, assignment.fixedFeeCents, b.currency) })
              : t("gigs.yourShare", { pct: percent(format, assignment.shareBps) })}
          </p>
        </div>
        {assignment.status === "pending" && <RespondGig assignmentId={assignment.id} />}
        <div className="flex flex-wrap gap-2">
          {assignment.status === "accepted" && b.status === "confirmed" && eventReached && <CompleteGig assignmentId={assignment.id} />}
          {equipmentCount > 0 && (
            <Button asChild variant={assignment.status === "accepted" ? "default" : "outline"} size="sm">
              <Link href={`/app/gigs/${b.trackingCode}/equipment`}>
                <BoxesIcon />
                {t("equipment.checklist", { loaded: equipmentLines._sum.loadedQty ?? 0, planned: equipmentLines._sum.quantity ?? 0 })}
              </Link>
            </Button>
          )}
          <Button asChild variant="outline" size="sm">
            <Link href={`/app/messages/${b.trackingCode}?channel=artist`}>
              <MessagesSquareIcon />
              {t("messages.messageAgency")}
            </Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("gigs.brief")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm">
          <dl className="grid gap-3 sm:grid-cols-2">
            <Item icon={CalendarIcon} label={t("newBooking.eventDate")}>{eventDate(format, b.eventDate) ?? t("bookings.noDate")}</Item>
            <Item icon={ClockIcon} label={t("newBooking.startTime")}>
              {eventTimeRange(b.startTime, b.endTime, t("ui.nextDay")) ?? "—"}
            </Item>
            <Item icon={MapPinIcon} label={t("newBooking.venue")}>
              {[b.venueName, b.venueAddress, b.venueCity].filter(Boolean).join(", ") || "—"}
            </Item>
            <Item icon={UsersIcon} label={t("newBooking.guestCount")}>{b.guestCount ? t("booking.guests", { count: b.guestCount }) : "—"}</Item>
            {b.customer && <Item label={t("booking.customer")}>{b.customer.name}{b.partnerName && ` & ${b.partnerName}`}</Item>}
            {(b.organization.phone || b.organization.contactEmail) && (
              <Item label={t("gigs.contact")}>{[b.organization.phone, b.organization.contactEmail].filter(Boolean).join(" · ")}</Item>
            )}
          </dl>
          {(dos.length > 0 || donts.length > 0) && (
            <div className="grid gap-3 sm:grid-cols-2">
              {dos.length > 0 && (
                <div>
                  <p className="mb-1 font-medium">{t("booking.dos")}</p>
                  <ul className="list-disc pl-4 text-muted-foreground">{dos.map((d) => <li key={d}>{d}</li>)}</ul>
                </div>
              )}
              {donts.length > 0 && (
                <div>
                  <p className="mb-1 font-medium">{t("booking.donts")}</p>
                  <ul className="list-disc pl-4 text-muted-foreground">{donts.map((d) => <li key={d}>{d}</li>)}</ul>
                </div>
              )}
            </div>
          )}
          {b.preferredGenre && (
            <div>
              <p className="mb-1 font-medium">{t("bookingPage.genre")}</p>
              <p className="text-muted-foreground">{b.preferredGenre}</p>
            </div>
          )}
          {b.playlistUrl && /^https?:\/\//i.test(b.playlistUrl) && (
            <a href={b.playlistUrl} target="_blank" rel="noopener noreferrer" className="w-fit text-primary underline-offset-4 hover:underline">
              {playlist ? t(`customerEvent.provider_${playlist.provider}`) : t("booking.playlist")}
            </a>
          )}
          {b.musicRequests && (
            <div>
              <p className="mb-1 font-medium">{t("customerEvent.musicRequests")}</p>
              <p className="whitespace-pre-line text-muted-foreground">{b.musicRequests}</p>
            </div>
          )}
          {b.specialRequests && (
            <div>
              <p className="mb-1 font-medium">{t("customerEvent.specialRequests")}</p>
              <p className="whitespace-pre-line text-muted-foreground">{b.specialRequests}</p>
            </div>
          )}
          {b.message && <p className="rounded-lg bg-muted/60 p-3 whitespace-pre-line">{b.message}</p>}
        </CardContent>
      </Card>
    </div>
  );
}

function Item({ icon: Icon, label, children }: { icon?: React.ComponentType<{ className?: string }>; label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="flex items-center gap-1.5 text-muted-foreground">
        {Icon && <Icon className="size-3.5" />}
        {label}
      </dt>
      <dd>{children}</dd>
    </div>
  );
}
