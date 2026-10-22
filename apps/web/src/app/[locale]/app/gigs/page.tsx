import { ClipboardListIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { type EventType, todayInNetherlands } from "@stagedesk/core";
import { prisma } from "@stagedesk/db";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { AssignmentStatusBadge } from "@/components/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { eventDate } from "@/lib/format";
import { requirePermission } from "@/lib/viewer";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/gigs">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "gigs" });
  return { title: t("title") };
}

export default async function GigsPage({ params }: PageProps<"/[locale]/app/gigs">) {
  setRequestLocale((await params).locale as Locale);
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Gigs />
    </Suspense>
  );
}

/** The artist's own gigs, at their agency and at partner agencies they're shared with. */
async function myAssignments(userId: string) {
  return prisma.bookingAssignment.findMany({
    where: { artist: { userId }, status: { in: ["pending", "accepted"] } },
    include: {
      artist: { select: { stageName: true } },
      booking: {
        select: {
          trackingCode: true,
          status: true,
          eventType: true,
          eventDate: true,
          startTime: true,
          endTime: true,
          venueName: true,
          venueCity: true,
          organization: { select: { name: true } },
        },
      },
    },
    orderBy: { booking: { eventDate: "asc" } },
  });
}

async function Gigs() {
  const viewer = await requirePermission("artist.gigs");
  const [t, te, format, assignments] = await Promise.all([
    getTranslations("gigs"),
    getTranslations("eventTypes"),
    getFormatter(),
    myAssignments(viewer.user.id),
  ]);
  const today = todayInNetherlands();
  const live = assignments.filter((a) => ["booked", "confirmed", "completed"].includes(a.booking.status));
  const requests = live.filter((a) => a.status === "pending");
  const upcoming = live.filter((a) => a.status === "accepted" && (a.booking.eventDate?.toISOString().slice(0, 10) ?? "") >= today);
  const past = live.filter((a) => a.status === "accepted" && (a.booking.eventDate?.toISOString().slice(0, 10) ?? "") < today);

  const list = (items: typeof live) => (
    <ul className="grid gap-3">
      {items.map((a) => (
        <li key={a.id}>
          <Link href={`/app/gigs/${a.booking.trackingCode}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4 hover:bg-accent/40">
            <div className="grid gap-0.5">
              <span className="font-medium">
                {te(a.booking.eventType as EventType)}
                {a.booking.venueCity && ` · ${a.booking.venueCity}`}
              </span>
              <span className="text-sm text-muted-foreground">
                {eventDate(format, a.booking.eventDate)}
                {a.booking.startTime && ` · ${a.booking.startTime}${a.booking.endTime ? `–${a.booking.endTime}` : ""}`}
                {` · ${a.booking.organization.name}`}
              </span>
            </div>
            <AssignmentStatusBadge status={a.status as "pending"} />
          </Link>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="grid gap-8">
      <PageHeader title={t("title")} description={t("description")} />
      {live.length === 0 ? (
        <EmptyState icon={ClipboardListIcon} title={t("emptyTitle")} description={t("emptyBody")} />
      ) : (
        <>
          {requests.length > 0 && (
            <section className="grid gap-3">
              <h2 className="font-semibold">{t("requests")}</h2>
              {list(requests)}
            </section>
          )}
          {upcoming.length > 0 && (
            <section className="grid gap-3">
              <h2 className="font-semibold">{t("upcoming")}</h2>
              {list(upcoming)}
            </section>
          )}
          {past.length > 0 && (
            <section className="grid gap-3">
              <h2 className="font-semibold text-muted-foreground">{t("past")}</h2>
              {list(past)}
            </section>
          )}
        </>
      )}
    </div>
  );
}
