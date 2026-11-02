import { connection } from "next/server";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Skeleton } from "@/components/ui/skeleton";
import type { Metadata } from "next";
import { prisma } from "@stagedesk/db";
import { PageHeader } from "@/components/page-header";
import { Pill } from "@/components/status-badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Locale } from "@/i18n/routing";
import { requirePermission, viewerCan } from "@/lib/viewer";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { LoginAsArtistButton, PlatformArtistManager } from "./artist-manager";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/platform-artists">): Promise<Metadata> {
  return { title: (await getTranslations({ locale: (await params).locale as Locale, namespace: "platformArtists" }))("title") };
}

export default async function PlatformArtistsPage({ params }: PageProps<"/[locale]/app/platform-artists">) {
  setRequestLocale((await params).locale as Locale);
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <PlatformArtists />
    </Suspense>
  );
}

/** Request-time data (the viewer and the database), so it renders under Suspense after connection(). */
async function PlatformArtists() {
  await connection();
  const viewer = await requirePermission("platform.agencies");
  const canImpersonate = viewerCan(viewer, "platform.users");
  const [t, artists, agencies, bookings] = await Promise.all([
    getTranslations("platformArtists"),
    prisma.artist.findMany({ include: { organization: { select: { name: true, kind: true } }, user: { select: { id: true, email: true, disabledAt: true, platformRole: true } }, shares: { where: { status: "accepted" }, include: { partnerOrganization: { select: { name: true } } } } }, orderBy: { createdAt: "desc" } }),
    prisma.organization.findMany({ where: { kind: "agency", suspendedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.booking.findMany({ where: { status: { in: ["booked", "confirmed"] } }, select: { id: true, trackingCode: true, eventDate: true, organization: { select: { name: true } } }, orderBy: [{ eventDate: "asc" }, { createdAt: "desc" }], take: 200 }),
  ]);
  const artistOptions = artists.filter((a) => a.active).map((a) => ({ id: a.id, label: `${a.stageName} · ${a.organization.name}` }));
  const agencyOptions = agencies.map((a) => ({ id: a.id, label: a.name }));
  const bookingOptions = bookings.map((b) => ({ id: b.id, label: `${b.trackingCode} · ${b.organization.name}${b.eventDate ? ` · ${b.eventDate.toISOString().slice(0, 10)}` : ""}` }));

  return (
    <div className="grid gap-6">
      <PageHeader title={t("title")} description={t("description")} />
      <PlatformArtistManager artists={artistOptions} agencies={agencyOptions} bookings={bookingOptions} />
      <Card className="overflow-x-auto py-0">
        <Table>
          <TableHeader><TableRow><TableHead>{t("artist")}</TableHead><TableHead>{t("account")}</TableHead><TableHead>{t("owner")}</TableHead><TableHead>{t("sharedWith")}</TableHead><TableHead>{t("status")}</TableHead><TableHead>{t("actions")}</TableHead></TableRow></TableHeader>
          <TableBody>
            {artists.map((artist) => (
              <TableRow key={artist.id}>
                <TableCell className="font-medium">
                  <Link href={`/app/platform-artists/${artist.id}`} className="underline-offset-4 hover:underline">
                    {artist.stageName}
                  </Link>
                </TableCell>
                <TableCell>{artist.user?.email ?? "—"}</TableCell>
                <TableCell>{artist.organization.kind === "platform" ? t("ownedByPlatform") : artist.organization.name}</TableCell>
                <TableCell>{artist.shares.map((s) => s.partnerOrganization.name).join(", ") || "—"}</TableCell>
                <TableCell><Pill tone={artist.active ? "success" : "neutral"}>{artist.active ? t("active") : t("inactive")}</Pill></TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/app/platform-artists/${artist.id}`}>{t("manage")}</Link>
                    </Button>
                    {canImpersonate && artist.user && !artist.user.disabledAt && artist.user.platformRole !== "platform_admin" && artist.user.id !== viewer.user.id && <LoginAsArtistButton userId={artist.user.id} />}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
