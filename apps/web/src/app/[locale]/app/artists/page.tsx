import { Music2Icon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { prisma } from "@stagedesk/db";
import { ArtistAvatar } from "@/components/artist-avatar";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Pill } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requireAgency } from "@/lib/viewer";
import { ArtistDialog, ShareResponse } from "./artist-forms";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/artists">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "artists" });
  return { title: t("title") };
}

export default async function ArtistsPage({ params }: PageProps<"/[locale]/app/artists">) {
  setRequestLocale((await params).locale as Locale);
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Artists />
    </Suspense>
  );
}


async function Artists() {
  const { organization, db } = await requireAgency("agency.artists");
  const [t, artists, members, requests, sharedWithUs] = await Promise.all([
    getTranslations("artists"),
    db.artist.findMany({ orderBy: [{ active: "desc" }, { stageName: "asc" }] }),
    db.member.findMany({ where: { role: "artist" }, include: { user: { select: { id: true, name: true, email: true } } } }),
    // Requests addressed to this agency by other agencies.
    prisma.artistShare.findMany({
      where: { partnerOrganizationId: organization.id, status: "pending" },
      include: { artist: { select: { stageName: true } }, organization: { select: { name: true } } },
    }),
    prisma.artistShare.findMany({
      where: { partnerOrganizationId: organization.id, status: "accepted" },
      include: { artist: true, organization: { select: { name: true } } },
    }),
  ]);
  const linked = new Set(artists.map((a) => a.userId));
  const accounts = members.filter((m) => !linked.has(m.userId)).map((m) => ({ id: m.user.id, label: `${m.user.name} · ${m.user.email}` }));
  const genres = (value: unknown) => (Array.isArray(value) ? value.join(" · ") : "");

  return (
    <div className="grid gap-6">
      <PageHeader title={t("title")} description={t("description")} actions={<ArtistDialog accounts={accounts} />} />

      {requests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("shareRequests")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {requests.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <span>{t("shareRequestBody", { agency: r.organization.name, artist: r.artist.stageName })}</span>
                <ShareResponse shareId={r.id} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {artists.length === 0 ? (
        <EmptyState icon={Music2Icon} title={t("emptyTitle")} description={t("emptyBody")} />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {artists.map((a) => (
            <li key={a.id}>
              <Link href={`/app/artists/${a.id}`} className="flex h-full gap-3 rounded-xl border bg-card p-4 transition-colors hover:bg-accent/40">
                <ArtistAvatar name={a.stageName} photoUrl={a.photoUrl} />
                <div className="grid min-w-0 content-start gap-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{a.stageName}</span>
                    {!a.active && <Pill>{t("inactive")}</Pill>}
                  </div>
                  <span className="truncate text-sm text-muted-foreground">{genres(a.genres)}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {sharedWithUs.length > 0 && (
        <section className="grid gap-3">
          <h2 className="text-sm font-medium tracking-wide text-muted-foreground uppercase">{t("sharedWithYou")}</h2>
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {sharedWithUs.map((s) => (
              <li key={s.id} className="flex gap-3 rounded-xl border border-dashed bg-card p-4">
                <ArtistAvatar name={s.artist.stageName} photoUrl={s.artist.photoUrl} />
                <div className="grid min-w-0 content-start gap-1">
                  <span className="truncate font-medium">{s.artist.stageName}</span>
                  <span className="truncate text-sm text-muted-foreground">{t("sharedBy", { agency: s.organization.name })}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
