import { ExternalLinkIcon, MicVocalIcon, SearchIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { listSoloArtists } from "@stagedesk/db";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { SearchForm } from "@/components/search-form";
import { Pill } from "@/components/status-badge";
import { StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { eventDate } from "@/lib/format";
import { getFormatter } from "@/lib/formatter";
import { cn } from "@/lib/utils";
import { requirePermission } from "@/lib/viewer";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/independent-artists">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "soloAdmin" });
  return { title: t("title") };
}

export default async function IndependentArtistsPage({ params, searchParams }: PageProps<"/[locale]/app/independent-artists">) {
  setRequestLocale((await params).locale as Locale);
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <SoloArtists searchParams={searchParams} />
    </Suspense>
  );
}

const filters = ["all", "listed", "free", "suspended"] as const;

async function SoloArtists({ searchParams }: Pick<PageProps<"/[locale]/app/independent-artists">, "searchParams">) {
  await requirePermission("platform.agencies");
  const sp = await searchParams;
  const q = typeof sp["q"] === "string" ? sp["q"].slice(0, 100) : "";
  const filter = filters.find((f) => f === sp["filter"]) ?? "all";
  const [t, format, locale, all, rows] = await Promise.all([
    getTranslations("soloAdmin"),
    getFormatter(),
    getLocale(),
    listSoloArtists(),
    listSoloArtists({ q, filter: filter === "all" ? null : filter }),
  ]);
  const href = (f: string) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (f !== "all") p.set("filter", f);
    return `/app/independent-artists${p.size ? `?${p}` : ""}`;
  };

  return (
    <div className="grid gap-6">
      <PageHeader title={t("title")} description={t("description")} />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard index={0} label={t("total")} value={all.length} icon={MicVocalIcon} />
        <StatCard index={1} label={t("listedCount")} value={all.filter((a) => a.listed).length} hint={t("listedHint")} />
        <StatCard index={2} label={t("bookingsCount")} value={all.reduce((s, a) => s + a.bookings, 0)} hint={t("bookingsHint")} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex w-fit gap-1 rounded-lg bg-muted p-1 text-sm" aria-label={t("filter")}>
          {filters.map((f) => (
            <Link key={f} href={href(f)} scroll={false} className={cn("rounded-md px-3 py-1.5", f === filter ? "bg-background font-medium shadow-xs" : "text-muted-foreground hover:text-foreground")}>
              {t(`filter_${f}`)}
            </Link>
          ))}
        </nav>
        <SearchForm className="flex gap-2" role="search">
          {filter !== "all" && <input type="hidden" name="filter" value={filter} />}
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input name="q" defaultValue={q} placeholder={t("search")} aria-label={t("search")} className="h-9 w-64 pl-8" />
          </div>
          <Button type="submit" variant="outline">
            {t("find")}
          </Button>
        </SearchForm>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={MicVocalIcon} title={t("empty")} description={t("emptyHint")} />
      ) : (
        <Card className="overflow-x-auto py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("artist")}</TableHead>
                <TableHead>{t("owner")}</TableHead>
                <TableHead>{t("plan")}</TableHead>
                <TableHead className="text-right">{t("bookings")}</TableHead>
                <TableHead className="text-right">{t("gigs")}</TableHead>
                <TableHead>{t("joined")}</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    <Link href={`/app/agencies/${a.id}`} className="flex items-center gap-3 underline-offset-4 hover:underline">
                      <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted font-semibold text-primary">
                        {a.photoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element -- served from /files
                          <img src={a.photoUrl} alt="" className="size-full object-cover" />
                        ) : (
                          a.name.charAt(0)
                        )}
                      </span>
                      <span className="grid">
                        <span className="font-medium">{a.name}</span>
                        <span className="text-xs text-muted-foreground">{[a.city, a.genres.slice(0, 3).join(", ")].filter(Boolean).join(" · ") || "—"}</span>
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm">
                    {a.owner ? (
                      <span className="grid">
                        <span>{a.owner.name}</span>
                        <span className="text-xs text-muted-foreground">{a.owner.email}</span>
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {a.suspended ? (
                        <Pill tone="danger">{t("suspended")}</Pill>
                      ) : a.listed ? (
                        <Pill tone="success">{t("listed")}</Pill>
                      ) : (
                        <Pill>{t("free")}</Pill>
                      )}
                      {a.plan && <span className="text-xs text-muted-foreground">{a.plan.name[locale] ?? a.plan.name["en"]}</span>}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{a.bookings}</TableCell>
                  <TableCell className="text-right tabular-nums">{a.gigs}</TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">{eventDate(format, a.createdAt, "short")}</TableCell>
                  <TableCell>
                    {a.listed && (
                      <Button asChild variant="ghost" size="icon-sm" aria-label={t("publicProfile")}>
                        <Link href={`/artists/${a.slug}`} target="_blank">
                          <ExternalLinkIcon />
                        </Link>
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
