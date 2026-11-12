import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { artistAdminDetail, prisma } from "@stagedesk/db";
import { PageHeader } from "@/components/page-header";
import { BookingStatusBadge, Pill } from "@/components/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { eventDate } from "@/lib/format";
import { getFormatter } from "@/lib/formatter";
import { requirePermission, viewerCan } from "@/lib/viewer";
import type { BookingStatus } from "@stagedesk/core";
import { ArtistSupport } from "./artist-support";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/platform-artists/[id]">): Promise<Metadata> {
  return { title: (await getTranslations({ locale: (await params).locale as Locale, namespace: "platformArtists" }))("manageTitle") };
}

export default function PlatformArtistPage({ params }: PageProps<"/[locale]/app/platform-artists/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Detail params={params} />
    </Suspense>
  );
}

/** Support's view of one artist: profile, agency, account, gigs and sharing, with the actions to resolve problems. */
async function Detail({ params }: Pick<PageProps<"/[locale]/app/platform-artists/[id]">, "params">) {
  await connection();
  const { id, locale } = await params;
  setRequestLocale(locale as Locale);
  const viewer = await requirePermission("platform.agencies");
  const detail = await artistAdminDetail(id);
  if (!detail) notFound();
  const [t, format] = await Promise.all([getTranslations("platformArtists"), getFormatter()]);
  const { artist, active, history } = detail;
  const user = artist.user;

  return (
    <div className="grid max-w-4xl gap-6">
      <Link href="/app/platform-artists" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" />
        {t("back")}
      </Link>
      <PageHeader title={artist.stageName} description={t("manageDescription")} />

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("profile")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <p>
              {t("owner")}: <span className="font-medium">{artist.organization.kind === "platform" ? t("ownedByPlatform") : artist.organization.name}</span>
              {artist.organization.suspendedAt && <Pill tone="warning"> {t("agencySuspended")}</Pill>}
            </p>
            <div className="flex flex-wrap gap-1">
              <Pill tone={artist.active ? "success" : "neutral"}>{artist.active ? t("active") : t("inactive")}</Pill>
              {artist.lendable && <Pill>{t("lendable")}</Pill>}
              {artist.showOnBookingPage && <Pill>{t("onBookingPage")}</Pill>}
              <Pill>{artist.connectedAccount?.payoutsEnabled ? t("payoutsOn") : t("payoutsOff")}</Pill>
            </div>
            <p className="text-muted-foreground">{t("historyLine", { gigs: history.assignments, ledger: history.ledger, reviews: history.reviews })}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("account")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            {user ? (
              <>
                <p className="font-medium">{user.name}</p>
                <p>{user.email}</p>
                <div className="flex flex-wrap gap-1">
                  <Pill tone={user.emailVerified ? "success" : "warning"}>{user.emailVerified ? t("verified") : t("notVerified")}</Pill>
                  {user.disabledAt && <Pill tone="danger">{t("disabled")}</Pill>}
                  {user._count.accounts === 0 && <Pill tone="warning">{t("noPassword")}</Pill>}
                </div>
              </>
            ) : (
              <p className="text-muted-foreground">{t("noAccount")}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("upcomingGigs")}</CardTitle>
          <CardDescription>{t("upcomingGigsHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          {active.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noUpcoming")}</p>
          ) : (
            <ul className="divide-y text-sm">
              {active.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    <span className="font-mono">{a.booking.trackingCode}</span> · {a.booking.organization.name} · {eventDate(format, a.booking.eventDate, "short") ?? "—"}
                  </span>
                  <span className="flex items-center gap-2">
                    <Pill>{t(`assignment_${a.status as "pending"}`)}</Pill>
                    <BookingStatusBadge status={a.booking.status as BookingStatus} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("sharedWith")}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {artist.shares.length === 0 ? (
            <p className="text-muted-foreground">—</p>
          ) : (
            <ul className="grid gap-1">
              {artist.shares.map((s) => (
                <li key={s.id}>
                  {s.partnerOrganization.name} · <span className="text-muted-foreground">{t(`share_${s.status as "accepted"}`)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <ArtistSupport
        artistId={artist.id}
        canMakeIndependent={
          artist.organization.kind !== "solo" &&
          Boolean(user) &&
          !user?.disabledAt &&
          user?.platformRole !== "platform_admin" &&
          (await prisma.member.count({ where: { userId: user!.id, role: "solo_artist" } })) === 0
        }
        active={artist.active}
        upcoming={active.length}
        shares={artist.shares.filter((s) => s.status === "accepted" || s.status === "pending").length}
        linkedUser={user ? { id: user.id, email: user.email, disabled: user.disabledAt !== null } : null}
        canImpersonate={viewerCan(viewer, "platform.users") && Boolean(user) && !user?.disabledAt && user?.platformRole !== "platform_admin" && user?.id !== viewer.user.id}
        agencyId={artist.organization.kind === "platform" ? null : artist.organization.id}
        deletable={detail.deletable}
      />
    </div>
  );
}
