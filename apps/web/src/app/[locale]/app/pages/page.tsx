import { DownloadIcon, FileTextIcon, PlusIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { getFormatter, getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { parsePageContent, prisma } from "@stagedesk/db";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Pill } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import { requirePermission } from "@/lib/viewer";
import { CommentButtons } from "./comment-buttons";

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

const tabs = ["pages", "comments", "waitlist"] as const;

async function Pages({ searchParams }: Pick<PageProps<"/[locale]/app/pages">, "searchParams">) {
  await requirePermission("platform.pages");
  const raw = (await searchParams)["tab"];
  const tab = tabs.includes(raw as (typeof tabs)[number]) ? (raw as (typeof tabs)[number]) : "pages";
  const [t, pendingComments, waitlistCount] = await Promise.all([
    getTranslations("pageBuilder"),
    prisma.blogComment.count({ where: { status: "pending" } }),
    prisma.waitlistEntry.count(),
  ]);
  const counts = { pages: null, comments: pendingComments, waitlist: waitlistCount };

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
      {tab === "pages" ? <PageList /> : tab === "comments" ? <Comments /> : <Waitlist />}
    </div>
  );
}

async function PageList() {
  const [t, format, locale, pages] = await Promise.all([
    getTranslations("pageBuilder"),
    getFormatter(),
    getLocale(),
    prisma.page.findMany({
      orderBy: [{ placement: "asc" }, { position: "asc" }],
      include: { publishedVersion: { select: { content: true, publishedAt: true, number: true } }, versions: { orderBy: { number: "desc" }, take: 1, select: { number: true, content: true } } },
    }),
  ]);
  if (pages.length === 0) return <EmptyState icon={FileTextIcon} title={t("empty")} />;
  return (
    <Card>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("page")}</TableHead>
              <TableHead>{t("placement")}</TableHead>
              <TableHead>{t("status")}</TableHead>
              <TableHead>{t("live")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pages.map((p) => {
              const latest = p.versions[0];
              const content = parsePageContent(latest?.content);
              const ahead = latest && p.publishedVersion && latest.number > p.publishedVersion.number;
              return (
                <TableRow key={p.id}>
                  <TableCell>
                    <Link href={`/app/pages/${p.id}`} className="font-medium underline-offset-4 hover:underline">
                      {content?.[locale as Locale].title ?? p.slugEn}
                    </Link>
                    <div className="font-mono text-xs text-muted-foreground">
                      /{p.slugNl} · /en/{p.slugEn}
                    </div>
                  </TableCell>
                  <TableCell>{t(`placement_${p.placement as "none"}`)}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <Pill tone={p.status === "published" ? "success" : "neutral"}>{t(`status_${p.status as "draft"}`)}</Pill>
                      {p.kind === "legal" && <Pill tone="brand">{t("legal")}</Pill>}
                      {ahead && <Pill tone="warning">{t("unpublishedChanges")}</Pill>}
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">
                    {p.publishedVersion?.publishedAt ? `v${p.publishedVersion.number} · ${format.dateTime(p.publishedVersion.publishedAt, { day: "numeric", month: "short", year: "numeric" })}` : "—"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
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
  const [t, format, entries] = await Promise.all([getTranslations("pageBuilder"), getFormatter(), prisma.waitlistEntry.findMany({ orderBy: { createdAt: "desc" }, take: 200 })]);
  if (entries.length === 0) return <EmptyState icon={FileTextIcon} title={t("noWaitlist")} />;
  return (
    <Card>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("email")}</TableHead>
              <TableHead>{t("role")}</TableHead>
              <TableHead>{t("source")}</TableHead>
              <TableHead>{t("joined")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((e) => (
              <TableRow key={e.id}>
                <TableCell>
                  {e.email}
                  {e.name && <div className="text-xs text-muted-foreground">{e.name}</div>}
                </TableCell>
                <TableCell>{t(`role_${e.role as "agency"}`)}</TableCell>
                <TableCell className="font-mono text-xs">{e.source ?? "—"}</TableCell>
                <TableCell className="whitespace-nowrap tabular-nums">{format.dateTime(e.createdAt, { day: "numeric", month: "short", year: "numeric" })}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
