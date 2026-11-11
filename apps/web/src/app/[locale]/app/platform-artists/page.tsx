import { artistAssignableStatuses, artistHoldStatuses, type ListSpec, parseListQuery } from "@stagedesk/core";
import { MicVocalIcon } from "lucide-react";
import { connection } from "next/server";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Skeleton } from "@/components/ui/skeleton";
import type { Metadata } from "next";
import { type Prisma, prisma } from "@stagedesk/db";
import { EmptyState } from "@/components/empty-state";
import { ListPager, ListToolbar, SortHead } from "@/components/list/list-controls";
import { PageHeader } from "@/components/page-header";
import { Pill } from "@/components/status-badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Locale } from "@/i18n/routing";
import { requirePermission, viewerCan } from "@/lib/viewer";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { ChangeRoleButton, LoginAsArtistButton, PlatformArtistManager } from "./artist-manager";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/platform-artists">): Promise<Metadata> {
  return { title: (await getTranslations({ locale: (await params).locale as Locale, namespace: "platformArtists" }))("title") };
}

export default async function PlatformArtistsPage({ params, searchParams }: PageProps<"/[locale]/app/platform-artists">) {
  setRequestLocale((await params).locale as Locale);
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <PlatformArtists searchParams={searchParams} />
    </Suspense>
  );
}

const spec = {
  sorts: ["name", "created"],
  defaultSort: "created",
  defaultDir: "desc",
  filters: {
    // Where the artist works: StageDesk's managed pool, an agency, or their own business.
    works: ["platform", "agency", "independent"],
    status: ["active", "inactive"],
    account: ["linked", "none"],
  },
} as const satisfies ListSpec;

const kindOf = { platform: "platform", agency: "agency", independent: "solo" } as const;

/** Request-time data (the viewer and the database), so it renders under Suspense after connection(). */
async function PlatformArtists({ searchParams }: Pick<PageProps<"/[locale]/app/platform-artists">, "searchParams">) {
  await connection();
  const viewer = await requirePermission("platform.agencies");
  const canImpersonate = viewerCan(viewer, "platform.users");
  const query = parseListQuery(await searchParams, spec);
  const { works, status, account } = query.filters;

  // Platform-wide on purpose: the admin manages every agency's artists.
  const where: Prisma.ArtistWhereInput = {
    ...(query.q
      ? { OR: [{ stageName: { contains: query.q } }, { user: { is: { email: { contains: query.q } } } }, { organization: { name: { contains: query.q } } }] }
      : {}),
    ...(works ? { organization: { kind: kindOf[works as keyof typeof kindOf] } } : {}),
    ...(status ? { active: status === "active" } : {}),
    ...(account ? { userId: account === "linked" ? { not: null } : null } : {}),
  };
  const [t, tl, artists, total, pickable, agencies, bookings] = await Promise.all([
    getTranslations("platformArtists"),
    getTranslations("list"),
    prisma.artist.findMany({
      where,
      include: { organization: { select: { name: true, kind: true } }, user: { select: { id: true, email: true, disabledAt: true, platformRole: true } }, shares: { where: { status: "accepted" }, include: { partnerOrganization: { select: { name: true } } } } },
      orderBy: query.sort === "name" ? [{ stageName: query.dir }, { createdAt: "desc" }] : [{ createdAt: query.dir }],
      skip: (query.page - 1) * query.size,
      take: query.size,
    }),
    prisma.artist.count({ where }),
    // For the share and assign cards: every active profile, not only this page of the list.
    prisma.artist.findMany({ where: { active: true }, select: { id: true, stageName: true, organization: { select: { name: true, kind: true } } }, orderBy: { stageName: "asc" } }),
    prisma.organization.findMany({ where: { kind: "agency", suspendedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.booking.findMany({ where: { status: { in: [...artistAssignableStatuses] } }, select: { id: true, trackingCode: true, eventDate: true, organization: { select: { name: true } } }, orderBy: [{ eventDate: "asc" }, { createdAt: "desc" }], take: 200 }),
  ]);
  const placeName = (o: { name: string; kind: string }) => (o.kind === "platform" ? t("ownedByPlatform") : o.kind === "solo" ? t("independentLabel") : o.name);
  const artistOptions = pickable.map((a) => ({ id: a.id, label: `${a.stageName} · ${placeName(a.organization)}` }));
  // Who can change role: an active profile with a working account.
  const upcoming = await prisma.bookingAssignment.groupBy({
    by: ["artistId"],
    where: { artistId: { in: artists.map((a) => a.id) }, status: { in: ["pending", "accepted"] }, booking: { status: { in: [...artistHoldStatuses] } } },
    _count: { _all: true },
  });
  const upcomingOf = new Map(upcoming.map((u) => [u.artistId, u._count._all]));
  const movable = new Map(
    artists
      .filter((a) => a.active && a.user && !a.user.disabledAt && a.user.platformRole !== "platform_admin")
      .map((a) => [a.id, { id: a.id, stageName: a.stageName, organizationId: a.organizationId, kind: a.organization.kind, upcoming: upcomingOf.get(a.id) ?? 0 }]),
  );
  const agencyOptions = agencies.map((a) => ({ id: a.id, label: a.name }));
  const bookingOptions = bookings.map((b) => ({ id: b.id, label: `${b.trackingCode} · ${b.organization.name}${b.eventDate ? ` · ${b.eventDate.toISOString().slice(0, 10)}` : ""}` }));
  const filtered = Boolean(query.q) || Object.keys(query.filters).length > 0;

  return (
    <div className="grid gap-6">
      <PageHeader title={t("title")} description={t("description")} />
      <PlatformArtistManager artists={artistOptions} agencies={agencyOptions} bookings={bookingOptions} />

      <div className="grid gap-3">
        <h2 className="text-lg font-semibold">{t("listTitle")}</h2>
        <ListToolbar
          spec={spec}
          placeholder={t("searchPlaceholder")}
          filters={[
            { key: "works", label: t("filterWorks"), options: spec.filters.works.map((v) => ({ value: v, label: t(`works_${v}`) })) },
            { key: "status", label: t("status"), options: spec.filters.status.map((v) => ({ value: v, label: t(v) })) },
            { key: "account", label: t("account"), options: spec.filters.account.map((v) => ({ value: v, label: t(`account_${v}`) })) },
          ]}
        />
        {artists.length === 0 ? (
          <EmptyState icon={MicVocalIcon} title={filtered ? tl("noMatches") : t("empty")} />
        ) : (
          <Card className="overflow-x-auto py-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortHead spec={spec} column="name">{t("artist")}</SortHead>
                  <TableHead>{t("account")}</TableHead>
                  <TableHead>{t("owner")}</TableHead>
                  <TableHead>{t("sharedWith")}</TableHead>
                  <TableHead>{t("status")}</TableHead>
                  <SortHead spec={spec} column="created">{t("added")}</SortHead>
                  <TableHead>{t("actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {artists.map((artist) => (
                  <TableRow key={artist.id}>
                    <TableCell className="font-medium">
                      <Link href={`/app/platform-artists/${artist.id}`} className="underline-offset-4 hover:underline">
                        {artist.stageName}
                      </Link>
                    </TableCell>
                    <TableCell>{artist.user?.email ?? "—"}</TableCell>
                    <TableCell>{placeName(artist.organization)}</TableCell>
                    <TableCell>{artist.shares.map((s) => s.partnerOrganization.name).join(", ") || "—"}</TableCell>
                    <TableCell>
                      <Pill tone={artist.active ? "success" : "neutral"}>{artist.active ? t("active") : t("inactive")}</Pill>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{artist.createdAt.toISOString().slice(0, 10)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/app/platform-artists/${artist.id}`}>{t("manage")}</Link>
                        </Button>
                        {movable.has(artist.id) && <ChangeRoleButton artist={movable.get(artist.id)!} agencies={agencyOptions} />}
                        {canImpersonate && artist.user && !artist.user.disabledAt && artist.user.platformRole !== "platform_admin" && artist.user.id !== viewer.user.id && <LoginAsArtistButton userId={artist.user.id} />}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
        <ListPager spec={spec} total={total} />
      </div>
    </div>
  );
}
