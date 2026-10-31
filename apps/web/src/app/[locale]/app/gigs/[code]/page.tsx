import { ArrowLeftIcon, BoxesIcon, CalendarIcon, ClockIcon, MapPinIcon, MessagesSquareIcon, UsersIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getFormatter } from "@/lib/formatter";
import { type EventType, todayInNetherlands } from "@stagedesk/core";
import { prisma } from "@stagedesk/db";
import { AssignmentStatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { eventDate, percent } from "@/lib/format";
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

  // Only an assignment for one of the signed-in artist's own profiles.
  const assignment = await prisma.bookingAssignment.findFirst({
    where: { artist: { userId: viewer.user.id }, booking: { trackingCode: code.toUpperCase() }, status: { in: ["pending", "accepted"] } },
    orderBy: { createdAt: "desc" },
    include: {
      booking: {
        include: { organization: { select: { name: true, phone: true, contactEmail: true } }, customer: { select: { name: true } } },
      },
    },
  });
  if (!assignment) notFound();
  const b = assignment.booking;

  // Equipment for this gig, read through the assignment found above (the booking may be another agency's).
  const [t, format, equipmentLines] = await Promise.all([getTranslations(), getFormatter(), prisma.bookingEquipment.count({ where: { bookingId: b.id } })]);
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
            <AssignmentStatusBadge status={assignment.status as "pending"} />
          </div>
          <p className="text-muted-foreground">
            {b.organization.name} · {t("gigs.yourShare", { pct: percent(format, assignment.shareBps) })}
          </p>
        </div>
        {assignment.status === "pending" && <RespondGig assignmentId={assignment.id} />}
        <div className="flex flex-wrap gap-2">
          {assignment.status === "accepted" && b.status === "confirmed" && eventReached && <CompleteGig assignmentId={assignment.id} />}
          {equipmentLines > 0 && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/app/gigs/${b.trackingCode}/equipment`}>
                <BoxesIcon />
                {t("equipment.title")}
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
              {b.startTime ? `${b.startTime}${b.endTime ? ` – ${b.endTime}` : ""}` : "—"}
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
          {b.playlistUrl && (
            <a href={b.playlistUrl} target="_blank" rel="noopener noreferrer" className="w-fit text-primary underline-offset-4 hover:underline">
              {t("booking.playlist")}
            </a>
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
