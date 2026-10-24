import { ExternalLinkIcon, NewspaperIcon, PlusIcon, StarIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { type ArticleLocale, type ContentKind, readingMinutes } from "@stagedesk/core";
import { listContentArticlesAdmin, listContentCategories } from "@stagedesk/db";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Pill } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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

async function Content({ params, searchParams }: Pick<PageProps<"/[locale]/app/content">, "params" | "searchParams">) {
  await requirePermission("platform.pages");
  const locale = (await params).locale as Locale;
  const sp = await searchParams;
  const kind: ContentKind = kinds.includes(one(sp["kind"]) as ContentKind) ? (one(sp["kind"]) as ContentKind) : "blog";
  const q = one(sp["q"]).slice(0, 100);
  const status = ["draft", "published"].includes(one(sp["status"])) ? one(sp["status"]) : null;
  const categoryId = one(sp["category"]) || null;
  const [t, format, articles, categories] = await Promise.all([
    getTranslations("contentAdmin"),
    getFormatter(),
    listContentArticlesAdmin(kind, { q, status, categoryId }),
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
          <form className="flex flex-wrap gap-2">
            <input type="hidden" name="kind" value={kind} />
            <Input name="q" defaultValue={q} placeholder={t("searchPlaceholder")} aria-label={t("search")} className="w-64" />
            <select name="status" defaultValue={status ?? ""} aria-label={t("status")} className="h-9 rounded-md border bg-background px-3 text-sm">
              <option value="">{t("allStatuses")}</option>
              <option value="published">{t("status_published")}</option>
              <option value="draft">{t("status_draft")}</option>
            </select>
            {categories.length > 0 && (
              <select name="category" defaultValue={categoryId ?? ""} aria-label={t("category")} className="h-9 rounded-md border bg-background px-3 text-sm">
                <option value="">{t("allCategories")}</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {en ? c.nameEn : c.nameNl}
                  </option>
                ))}
              </select>
            )}
            <Button type="submit" variant="outline">
              {t("filter")}
            </Button>
          </form>

          {articles.length === 0 ? (
            <EmptyState icon={NewspaperIcon} title={t("empty")} />
          ) : (
            <Card>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("article")}</TableHead>
                      {kind !== "changelog" && <TableHead>{t("category")}</TableHead>}
                      <TableHead>{t("status")}</TableHead>
                      <TableHead>{t("publishedAt")}</TableHead>
                      {kind === "blog" && <TableHead className="w-12">{t("featured")}</TableHead>}
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {articles.map((a) => {
                      const nl = a.nl as ArticleLocale;
                      const scheduled = a.status === "published" && a.publishedAt && a.publishedAt > now;
                      const live = a.status === "published" && !scheduled;
                      return (
                        <TableRow key={a.id}>
                          <TableCell className="max-w-md">
                            <Link href={`/app/content/${a.id}`} className="font-medium underline-offset-4 hover:underline">
                              {(en && (a.en as ArticleLocale | null)?.title) || nl.title}
                            </Link>
                            <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                              <span className="font-mono">/{a.slug}</span>
                              <span>· {t("minutes", { count: readingMinutes(nl.body) })}</span>
                              {!a.en && <span>· {t("noEnglish")}</span>}
                            </div>
                          </TableCell>
                          {kind !== "changelog" && <TableCell>{a.category ? (en ? a.category.nameEn : a.category.nameNl) : "—"}</TableCell>}
                          <TableCell>
                            <Pill tone={live ? "success" : scheduled ? "info" : "neutral"}>{t(live ? "status_published" : scheduled ? "status_scheduled" : "status_draft")}</Pill>
                          </TableCell>
                          <TableCell className="whitespace-nowrap tabular-nums">{a.publishedAt ? format.dateTime(a.publishedAt, { day: "numeric", month: "short", year: "numeric" }) : "—"}</TableCell>
                          {kind === "blog" && (
                            <TableCell>
                              <FeatureButton id={a.id} featured={a.featured} />
                            </TableCell>
                          )}
                          <TableCell>
                            {live && (
                              <Button asChild variant="ghost" size="icon" aria-label={t("view")} title={t("view")}>
                                <a href={kind === "changelog" ? publicBase : `${en ? "/en" : ""}${publicBase}/${a.slug}`} target="_blank" rel="noreferrer">
                                  <ExternalLinkIcon />
                                </a>
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
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
