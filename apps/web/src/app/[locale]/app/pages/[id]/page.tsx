import { localePrefix } from "@stagedesk/core";
import { ArrowLeftIcon, ExternalLinkIcon, GitCompareIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getFormatter } from "@/lib/formatter";
import type { PageContent } from "@stagedesk/core";
import { footerColumns, parsePageContent, prisma } from "@stagedesk/db";
import { PageHeader } from "@/components/page-header";
import { Pill } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requirePermission } from "@/lib/viewer";
import { UnpublishButton, VersionButtons } from "../comment-buttons";
import { type PageMetaValues, PageEditor } from "../page-editor";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/pages/[id]">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "pageBuilder" });
  return { title: t("title") };
}

export default function EditPagePage({ params }: PageProps<"/[locale]/app/pages/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-[40rem] w-full" />}>
      <Editor params={params} />
    </Suspense>
  );
}

const blank: PageContent = { nl: { title: "", seoTitle: "", seoDescription: "", blocks: [] }, en: { title: "", seoTitle: "", seoDescription: "", blocks: [] } };
const blankMeta: PageMetaValues = { slugNl: "", slugEn: "", kind: "standard", legalKey: null, acceptance: "none", placement: "none", position: 0 };

async function Editor({ params }: Pick<PageProps<"/[locale]/app/pages/[id]">, "params">) {
  setRequestLocale((await params).locale as Locale);
  await requirePermission("platform.pages");
  const { id, locale } = await params;
  const [t, format] = await Promise.all([getTranslations("pageBuilder"), getFormatter()]);

  const columns = (await footerColumns()).map((c) => ({ id: c.id, title: locale === "en" ? c.titleEn : c.titleNl }));
  if (id === "new") {
    return (
      <div className="grid gap-6">
        <Back label={t("allPages")} />
        <PageHeader title={t("new")} />
        <PageEditor pageId={null} initialMeta={blankMeta} initialContent={blank} footerColumns={columns} />
      </div>
    );
  }

  const page = await prisma.page.findUnique({ where: { id }, include: { versions: { orderBy: { number: "desc" }, take: 50 } } });
  if (!page) notFound();
  const latest = page.versions[0];
  const content = parsePageContent(latest?.content) ?? blank;
  const authors = await prisma.user.findMany({ where: { id: { in: page.versions.flatMap((v) => (v.createdById ? [v.createdById] : [])) } }, select: { id: true, name: true } });
  const livePath = `${localePrefix(locale)}/${locale === "en" ? page.slugEn : page.slugNl}`;

  return (
    <div className="grid gap-6">
      <Back label={t("allPages")} />
      <PageHeader
        title={content[locale as Locale].title || t("untitled")}
        description={t("versionInfo", { count: page.versions.length })}
        actions={
          <div className="flex flex-wrap gap-2">
            {page.status === "published" && (
              <>
                <Button asChild size="sm" variant="outline">
                  <a href={livePath} target="_blank" rel="noopener">
                    <ExternalLinkIcon />
                    {t("viewLive")}
                  </a>
                </Button>
                <UnpublishButton pageId={page.id} />
              </>
            )}
          </div>
        }
      />
      <PageEditor
        key={latest?.id}
        footerColumns={columns}
        pageId={page.id}
        initialMeta={{
          slugNl: page.slugNl,
          slugEn: page.slugEn,
          kind: page.kind as PageMetaValues["kind"],
          legalKey: page.legalKey as PageMetaValues["legalKey"],
          acceptance: page.acceptance as PageMetaValues["acceptance"],
          placement: page.placement as PageMetaValues["placement"],
          position: page.position,
        }}
        initialContent={content}
      />
      <Card>
        <CardHeader>
          <CardTitle>{t("history")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="divide-y">
            {page.versions.map((v) => {
              const live = v.id === page.publishedVersionId;
              return (
                <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                  <div className="grid gap-0.5">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium tabular-nums">v{v.number}</span>
                      {live && <Pill tone="success">{t("liveNow")}</Pill>}
                      {!live && v.publishedAt && <Pill tone="neutral">{t("wasLive")}</Pill>}
                      <span className="text-muted-foreground">
                        {format.dateTime(v.createdAt, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })} ·{" "}
                        {authors.find((a) => a.id === v.createdById)?.name ?? t("system")}
                      </span>
                    </span>
                    {v.note && <span className="text-muted-foreground">{v.note}</span>}
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    {page.publishedVersionId && !live && (
                      <Button asChild size="sm" variant="ghost">
                        <Link href={`/app/pages/${page.id}/compare?from=${page.publishedVersionId}&to=${v.id}`}>
                          <GitCompareIcon />
                          {t("compareWithLive")}
                        </Link>
                      </Button>
                    )}
                    <VersionButtons pageId={page.id} versionId={v.id} live={live} />
                  </div>
                </li>
              );
            })}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}

function Back({ label }: { label: string }) {
  return (
    <Button asChild variant="ghost" size="sm" className="w-fit">
      <Link href="/app/pages">
        <ArrowLeftIcon />
        {label}
      </Link>
    </Button>
  );
}
