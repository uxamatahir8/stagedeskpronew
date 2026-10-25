import { ExternalLinkIcon, NewspaperIcon, PlusIcon, StarIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { type ArticleLocale, type ContentKind, readingMinutes, localePrefix } from "@stagedesk/core";
import { listContentArticlesAdmin, listContentCategories } from "@stagedesk/db";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Pill } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable } from "@/components/list/data-table";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import { requirePermission } from "@/lib/viewer";
import { CategoryManager } from "./category-manager";
import { FeatureButton } from "./feature-button";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/content">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "contentAdmin" });
  return { title: t("title") };
}

export default async function ContentPage({ params, searchParams }: PageProps<"/[locale]/app/content">) {
  setRequestLocale((await params).locale as Locale);
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Content params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const kinds = ["blog", "help", "changelog"] as const;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

const spec = { sorts: ["updated", "title", "category", "published"], defaultSort: "published", defaultDir: "desc" as const, filters: { status: ["published", "scheduled", "draft"], category: [] as string[] } };

async function Content({ params, searchParams }: Pick<PageProps<"/[locale]/app/content">, "params" | "searchParams">) {
  await requirePermission("platform.pages");
  const locale = (await params).locale as Locale;
  const sp = await searchParams;
  const kind: ContentKind = kinds.includes(one(sp["kind"]) as ContentKind) ? (one(sp["kind"]) as ContentKind) : "blog";
  const [t, format, articles, categories] = await Promise.all([
    getTranslations("contentAdmin"),
    getFormatter(),
    listContentArticlesAdmin(kind, {}),
    kind === "changelog" ? Promise.resolve([]) : listContentCategories(kind),
  ]);
  const en = locale === "en";
  const now = new Date();
  const publicBase = kind === "blog" ? "/blog" : kind === "help" ? "/help" : "/changelog";

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Button asChild>
            <Link href={`/app/content/new?kind=${kind}`}>
              <PlusIcon />
              {t(`new_${kind}`)}
            </Link>
          </Button>
        }
      />
      <nav className="flex w-fit gap-1 rounded-lg bg-muted p-1 text-sm" aria-label={t("kinds")}>
        {kinds.map((k) => (
          <Link
            key={k}
            href={k === "blog" ? "/app/content" : `/app/content?kind=${k}`}
            aria-current={k === kind ? "page" : undefined}
            className={cn("rounded-md px-3 py-1.5", k === kind ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground")}
          >
            {t(`kind_${k}`)}
          </Link>
        ))}
      </nav>

      <div className={cn("grid gap-6", kind !== "changelog" && "2xl:grid-cols-[minmax(0,1fr)_22rem]")}>
        <div className="grid content-start gap-4">
          {articles.length === 0 ? (
            <EmptyState icon={NewspaperIcon} title={t("empty")} />
          ) : (
            <DataTable
              spec={{ ...spec, filters: { ...spec.filters, category: categories.map((c) => c.id) } }}
              placeholder={t("searchPlaceholder")}
              filters={[
                { key: "status", label: t("status"), options: ["published", "scheduled", "draft"].map((v) => ({ value: v, label: t(`status_${v as "draft"}`) })) },
                ...(categories.length > 0 ? [{ key: "category", label: t("category"), options: categories.map((c) => ({ value: c.id, label: en ? c.nameEn : c.nameNl })) }] : []),
              ]}
              columns={[
                { label: t("article"), sort: "title" },
                ...(kind !== "changelog" ? [{ label: t("category"), sort: "category" }] : []),
                { label: t("status") },
                { label: t("publishedAt"), sort: "published" },
                ...(kind === "blog" ? [{ label: t("featured"), className: "w-12" }] : []),
                { label: "", className: "w-10" },
              ]}
              rows={articles.map((a) => {
                const nl = a.nl as ArticleLocale;
                const scheduled = a.status === "published" && a.publishedAt && a.publishedAt > now;
                const live = a.status === "published" && !scheduled;
                const title = (en && (a.en as ArticleLocale | null)?.title) || nl.title;
                const category = a.category ? (en ? a.category.nameEn : a.category.nameNl) : null;
                return {
                  id: a.id,
                  text: `${title} ${nl.title} ${a.slug} ${category ?? ""}`,
                  values: { title, category, published: a.publishedAt?.getTime() ?? null, updated: a.updatedAt.getTime() },
                  facets: { status: live ? "published" : scheduled ? "scheduled" : "draft", category: a.categoryId ?? "" },
                  cells: [
                    <div key="t" className="max-w-md">
                      <Link href={`/app/content/${a.id}`} className="font-medium underline-offset-4 hover:underline">
                        {title}
                      </Link>
                      <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        <span className="font-mono">/{a.slug}</span>
                        <span>· {t("minutes", { count: readingMinutes(nl.body) })}</span>
                        {!a.en && <span>· {t("noEnglish")}</span>}
                      </div>
                    </div>,
                    ...(kind !== "changelog" ? [category ?? "—"] : []),
                    <Pill key="s" tone={live ? "success" : scheduled ? "info" : "neutral"}>{t(live ? "status_published" : scheduled ? "status_scheduled" : "status_draft")}</Pill>,
                    a.publishedAt ? format.dateTime(a.publishedAt, { day: "numeric", month: "short", year: "numeric" }) : "—",
                    ...(kind === "blog" ? [<FeatureButton key="f" id={a.id} featured={a.featured} />] : []),
                    live ? (
                      <Button key="v" asChild variant="ghost" size="icon" aria-label={t("view")} title={t("view")}>
                        <a href={kind === "changelog" ? publicBase : `${localePrefix(en ? "en" : "nl")}${publicBase}/${a.slug}`} target="_blank" rel="noreferrer">
                          <ExternalLinkIcon />
                        </a>
                      </Button>
                    ) : null,
                  ],
                };
              })}
            />
          )}
          {kind === "blog" && (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <StarIcon className="size-4" aria-hidden />
              {t("featuredHint")}
            </p>
          )}
        </div>

        {kind !== "changelog" && (
          <CategoryManager
            kind={kind}
            categories={categories.map((c) => ({
              id: c.id,
              slug: c.slug,
              nameNl: c.nameNl,
              nameEn: c.nameEn,
              descriptionNl: c.descriptionNl ?? "",
              descriptionEn: c.descriptionEn ?? "",
              count: c._count.articles,
            }))}
          />
        )}
      </div>
    </div>
  );
}
