import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { type EventType, todayInNetherlands } from "@stagedesk/core";
import { prisma, toDateOnly } from "@stagedesk/db";
import { ArtistAvatar } from "@/components/artist-avatar";
import { Pill } from "@/components/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { eventDate, percent } from "@/lib/format";
import { requireAgency } from "@/lib/viewer";
import { ArtistDialog, PhotoUpload, Sharing, UnavailableDates } from "../artist-forms";

export const metadata: Metadata = {};

export default function ArtistPage({ params }: PageProps<"/[locale]/app/artists/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-[36rem] w-full" />}>
      <Artist params={params} />
    </Suspense>
  );
}

async function Artist({ params }: Pick<PageProps<"/[locale]/app/artists/[id]">, "params">) {
  const { id, locale } = await params;
  setRequestLocale(locale as Locale);
  const { organization, db } = await requireAgency("agency.artists");
  const today = todayInNetherlands();

  const artist = await db.artist.findFirst({
    where: { id },
    include: {
      user: { select: { name: true, email: true } },
      unavailability: { where: { date: { gte: toDateOnly(today) } }, orderBy: { date: "asc" } },
      shares: { include: { partnerOrganization: { select: { name: true } } }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!artist) notFound();

  const [t, te, format, members, gigs] = await Promise.all([
    getTranslations("artists"),
    getTranslations("eventTypes"),
    getFormatter(),
    db.member.findMany({ where: { role: "artist" }, include: { user: { select: { id: true, name: true, email: true } } } }),
    // Gigs can be at partner agencies too when the artist is shared.
    prisma.bookingAssignment.findMany({
      where: {
        artistId: artist.id,
        status: { in: ["pending", "accepted"] },
        booking: { eventDate: { gte: toDateOnly(today) }, status: { in: ["booked", "confirmed"] } },
      },
      include: { booking: { select: { trackingCode: true, eventDate: true, eventType: true, venueCity: true, organizationId: true } } },
      orderBy: { booking: { eventDate: "asc" } },
    }),
  ]);
  const others = new Set((await db.artist.findMany({ where: { userId: { not: null }, id: { not: artist.id } }, select: { userId: true } })).map((a) => a.userId));
  const accounts = members.filter((m) => !others.has(m.userId)).map((m) => ({ id: m.user.id, label: `${m.user.name} · ${m.user.email}` }));
  const genres = Array.isArray(artist.genres) ? (artist.genres as string[]) : [];

  return (
    <div className="grid gap-6">
      <Link href="/app/artists" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" />
        {t("back")}
      </Link>

      <div className="flex flex-wrap items-start gap-5">
        <ArtistAvatar name={artist.stageName} photoUrl={artist.photoUrl} size="lg" />
        <div className="grid min-w-0 flex-1 gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{artist.stageName}</h1>
            {!artist.active && <Pill>{t("inactive")}</Pill>}
          </div>
          {genres.length > 0 && <p className="text-muted-foreground">{genres.join(" · ")}</p>}
          <p className="text-sm text-muted-foreground">
            {t("share")}: {percent(format, artist.defaultShareBps)}
            {artist.user && ` · ${artist.user.name} (${artist.user.email})`}
          </p>
          <div className="flex flex-wrap gap-2">
            <ArtistDialog
              accounts={accounts}
              artist={{
                id: artist.id,
                stageName: artist.stageName,
                genres: genres.join(", "),
                bio: artist.bio ?? "",
                sharePct: String(artist.defaultShareBps / 100),
                userId: artist.userId,
                active: artist.active,
                showOnBookingPage: artist.showOnBookingPage,
                mediaLinks: (Array.isArray(artist.mediaLinks) ? (artist.mediaLinks as string[]) : []).join("\n"),
              }}
            />
            <PhotoUpload artistId={artist.id} />
          </div>
        </div>
      </div>

      {artist.bio && <p className="max-w-prose whitespace-pre-line text-sm">{artist.bio}</p>}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("upcoming")}</CardTitle>
          </CardHeader>
          <CardContent>
            {gigs.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noGigs")}</p>
            ) : (
              <ul className="divide-y text-sm">
                {gigs.map((g) => (
                  <li key={g.id} className="flex flex-wrap justify-between gap-2 py-2">
                    {g.booking.organizationId === organization.id ? (
                      <Link href={`/app/bookings/${g.booking.trackingCode}`} className="font-medium hover:underline">
                        {te(g.booking.eventType as EventType)}
                        {g.booking.venueCity && ` · ${g.booking.venueCity}`}
                      </Link>
                    ) : (
                      <span className="font-medium">{te(g.booking.eventType as EventType)}</span>
                    )}
                    <span className="tabular-nums text-muted-foreground">{eventDate(format, g.booking.eventDate, "short")}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("unavailableTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <UnavailableDates artistId={artist.id} dates={artist.unavailability.map((u) => u.date.toISOString().slice(0, 10))} today={today} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("sharing")}</CardTitle>
            <CardDescription>{t("sharingHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Sharing artistId={artist.id} shares={artist.shares.map((s) => ({ id: s.id, agency: s.partnerOrganization.name, status: s.status }))} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
