import { DownloadIcon, FileTextIcon, PlusIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { getFormatter, getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { footerColumns, getSetting, parsePageContent, prisma } from "@stagedesk/db";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Pill } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable } from "@/components/list/data-table";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import { requirePermission } from "@/lib/viewer";
import { CommentButtons } from "./comment-buttons";
import { FooterManager } from "./footer-manager";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/pages">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "pageBuilder" });
  return { title: t("title") };
}

export default async function PagesPage({ params, searchParams }: PageProps<"/[locale]/app/pages">) {
  setRequestLocale((await params).locale as Locale);
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Pages searchParams={searchParams} />
    </Suspense>
  );
}

const tabs = ["pages", "footer", "comments", "waitlist"] as const;

async function Pages({ searchParams }: Pick<PageProps<"/[locale]/app/pages">, "searchParams">) {
  await requirePermission("platform.pages");
  const raw = (await searchParams)["tab"];
  const tab = tabs.includes(raw as (typeof tabs)[number]) ? (raw as (typeof tabs)[number]) : "pages";
  const [t, pendingComments, waitlistCount] = await Promise.all([
    getTranslations("pageBuilder"),
    prisma.blogComment.count({ where: { status: "pending" } }),
    prisma.waitlistEntry.count(),
  ]);
  const counts = { pages: null, footer: null, comments: pendingComments, waitlist: waitlistCount };

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          tab === "pages" ? (
            <Button asChild>
              <Link href="/app/pages/new">
                <PlusIcon />
                {t("new")}
              </Link>
            </Button>
          ) : tab === "waitlist" ? (
            <Button asChild variant="outline">
              <a href="/api/export/waitlist" download>
                <DownloadIcon />
                {t("exportWaitlist")}
              </a>
            </Button>
          ) : undefined
        }
      />
      <nav className="flex w-fit gap-1 rounded-lg bg-muted p-1 text-sm" aria-label={t("sections")}>
        {tabs.map((x) => (
          <Link
            key={x}
            href={x === "pages" ? "/app/pages" : `/app/pages?tab=${x}`}
            aria-current={x === tab ? "page" : undefined}
            className={cn("rounded-md px-3 py-1.5", x === tab ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground")}
          >
            {t(`tab_${x}`)}
            {counts[x] ? <span className="ml-1.5 text-muted-foreground tabular-nums">{counts[x]}</span> : null}
          </Link>
        ))}
      </nav>
      {tab === "pages" ? <PageList /> : tab === "footer" ? <FooterTab /> : tab === "comments" ? <Comments /> : <Waitlist />}
    </div>
  );
}

const pageSpec = { sorts: ["order", "title", "placement", "live"], defaultSort: "order", defaultDir: "asc" as const, filters: { status: ["published", "draft"], kind: ["legal", "page"], placement: [] as string[] } };
const waitSpec = { sorts: ["joined", "email", "source"], defaultSort: "joined", defaultDir: "desc" as const, filters: { role: ["agency", "artist", "other"] } };

async function PageList() {
  const [t, format, locale, pages, columns] = await Promise.all([
    getTranslations("pageBuilder"),
    getFormatter(),
    getLocale(),
    prisma.page.findMany({
      orderBy: [{ placement: "asc" }, { position: "asc" }],
      include: { publishedVersion: { select: { content: true, publishedAt: true, number: true } }, versions: { orderBy: { number: "desc" }, take: 1, select: { number: true, content: true } } },
    }),
    footerColumns(),
  ]);
  const columnTitle = (id: string) => {
    const c = columns.find((x) => x.id === id);
    return c ? (locale === "en" ? c.titleEn : c.titleNl) : id;
  };
  if (pages.length === 0) return <EmptyState icon={FileTextIcon} title={t("empty")} />;
  // Footer columns are the admin’s own, so the placements to filter on come from the pages.
  const spec = { ...pageSpec, filters: { ...pageSpec.filters, placement: [...new Set(pages.map((p) => p.placement))] } };
  const placementLabel = (placement: string) => (placement.startsWith("footer_") ? t("placement_footer", { column: columnTitle(placement.slice(7)) }) : t(`placement_${placement as "none"}`));
  return (
    <DataTable
      spec={spec}
      placeholder={t("searchPlaceholder")}
      filters={[
        { key: "status", label: t("status"), options: ["published", "draft"].map((v) => ({ value: v, label: t(`status_${v as "draft"}`) })) },
        { key: "kind", label: t("kind"), options: [{ value: "legal", label: t("legal") }, { value: "page", label: t("kindPage") }] },
        { key: "placement", label: t("placement"), options: [...new Set(pages.map((p) => p.placement))].map((v) => ({ value: v, label: placementLabel(v) })) },
      ]}
      columns={[{ label: t("page"), sort: "title" }, { label: t("placement"), sort: "placement" }, { label: t("status") }, { label: t("live"), sort: "live" }]}
      rows={pages.map((p) => {
        const latest = p.versions[0];
        const content = parsePageContent(latest?.content);
        const ahead = latest && p.publishedVersion && latest.number > p.publishedVersion.number;
        const title = content?.[locale as Locale].title ?? p.slugEn;
        return {
          id: p.id,
          text: `${title} ${p.slugNl} ${p.slugEn}`,
          values: { title, placement: placementLabel(p.placement), live: p.publishedVersion?.publishedAt?.getTime() ?? null, order: `${p.placement}-${String(p.position).padStart(4, "0")}` },
          facets: { status: p.status, kind: p.kind === "legal" ? "legal" : "page", placement: p.placement },
          cells: [
            <div key="t">
              <Link href={`/app/pages/${p.id}`} className="font-medium underline-offset-4 hover:underline">
                {title}
              </Link>
              <div className="font-mono text-xs text-muted-foreground">
                /{p.slugNl} · /en/{p.slugEn}
              </div>
            </div>,
            placementLabel(p.placement),
            <div key="s" className="flex flex-wrap gap-1">
              <Pill tone={p.status === "published" ? "success" : "neutral"}>{t(`status_${p.status as "draft"}`)}</Pill>
              {p.kind === "legal" && <Pill tone="brand">{t("legal")}</Pill>}
              {ahead && <Pill tone="warning">{t("unpublishedChanges")}</Pill>}
            </div>,
            p.publishedVersion?.publishedAt ? `v${p.publishedVersion.number} · ${format.dateTime(p.publishedVersion.publishedAt, { day: "numeric", month: "short", year: "numeric" })}` : "—",
          ],
        };
      })}
    />
  );
}

async function Comments() {
  const [t, format, comments] = await Promise.all([
    getTranslations("pageBuilder"),
    getFormatter(),
    prisma.blogComment.findMany({ where: { status: "pending" }, orderBy: { createdAt: "asc" }, take: 100 }),
  ]);
  if (comments.length === 0) return <EmptyState icon={FileTextIcon} title={t("noComments")} />;
  return (
    <div className="grid gap-3">
      {comments.map((c) => (
        <Card key={c.id}>
          <CardContent className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
            <div className="grid gap-1 text-sm">
              <p>
                <span className="font-medium">{c.authorName}</span> <span className="text-muted-foreground">· {c.authorEmail} · {format.dateTime(c.createdAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                <Link href={`/blog/${c.postSlug}`} className="underline-offset-4 hover:underline">
                  /blog/{c.postSlug}
                </Link>{" "}
                · {c.locale.toUpperCase()}
              </p>
              <p className="whitespace-pre-line">{c.body}</p>
            </div>
            <CommentButtons commentId={c.id} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

async function Waitlist() {
  const [t, format, entries] = await Promise.all([getTranslations("pageBuilder"), getFormatter(), prisma.waitlistEntry.findMany({ orderBy: { createdAt: "desc" }, take: 5000 })]);
  if (entries.length === 0) return <EmptyState icon={FileTextIcon} title={t("noWaitlist")} />;
  return (
    <DataTable
      spec={waitSpec}
      placeholder={t("waitlistSearch")}
      filters={[{ key: "role", label: t("role"), options: [...new Set(entries.map((e) => e.role))].map((r) => ({ value: r, label: t(`role_${r as "agency"}`) })) }]}
      columns={[{ label: t("email"), sort: "email" }, { label: t("role") }, { label: t("source"), sort: "source" }, { label: t("joined"), sort: "joined" }]}
      rows={entries.map((e) => ({
        id: e.id,
        text: `${e.email} ${e.name ?? ""} ${e.source ?? ""}`,
        values: { email: e.email, source: e.source, joined: e.createdAt.getTime() },
        facets: { role: e.role },
        cells: [
          <div key="e">
            {e.email}
            {e.name && <div className="text-xs text-muted-foreground">{e.name}</div>}
          </div>,
          t(`role_${e.role as "agency"}`),
          <span key="s" className="font-mono text-xs">{e.source ?? "—"}</span>,
          format.dateTime(e.createdAt, { day: "numeric", month: "short", year: "numeric" }),
        ],
      }))}
    />
  );
}

/** The footer's columns and links, with the pages placed in each column. */
async function FooterTab() {
  const [locale, columns, settings, pages] = await Promise.all([
    getLocale(),
    footerColumns(),
    getSetting("site.footer"),
    prisma.page.findMany({ where: { placement: { startsWith: "footer_" } }, orderBy: { position: "asc" }, include: { versions: { orderBy: { number: "desc" }, take: 1, select: { content: true } } } }),
  ]);
  const title = (p: (typeof pages)[number]) => parsePageContent(p.versions[0]?.content)?.[locale as Locale].title ?? (locale === "en" ? p.slugEn : p.slugNl);
  return (
    <FooterManager
      settings={settings}
      columns={columns.map((c) => ({
        id: c.id,
        titleNl: c.titleNl,
        titleEn: c.titleEn,
        links: c.links.map((l) => ({ id: l.id, kind: l.kind === "url" ? "url" : "route", target: l.target, labelNl: l.labelNl, labelEn: l.labelEn, newTab: l.newTab })),
        pages: pages.filter((p) => p.placement === `footer_${c.id}`).map((p) => ({ id: p.id, title: title(p) })),
      }))}
    />
  );
}
