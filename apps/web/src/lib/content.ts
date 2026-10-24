import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { type ArticleLocale, type ContentKind, readingMinutes } from "@stagedesk/core";
import { articleIn, listContentCategories, publishedArticle, publishedArticles, relatedArticles } from "@stagedesk/db";

/**
 * Blog posts, help articles and the changelog as the website reads them:
 * cached and tagged, so saving in the admin panel shows up on the next request.
 */
export const CONTENT_TAG = "site-content";

type Locale = "nl" | "en";

interface Row {
  id: string;
  slug: string;
  categoryId: string | null;
  featured: boolean;
  publishedAt: Date | null;
  updatedAt: Date;
  coverImage: string | null;
  authorName: string | null;
  nl: unknown;
  en: unknown;
  category: { slug: string; nameNl: string; nameEn: string } | null;
}

/** One article in one language, with what cards and pages show. */
export function view(row: Row, locale: Locale) {
  const text: ArticleLocale = articleIn(row, locale);
  return {
    id: row.id,
    slug: row.slug,
    featured: row.featured,
    publishedAt: row.publishedAt,
    updatedAt: row.updatedAt,
    cover: row.coverImage,
    author: row.authorName,
    categoryId: row.categoryId,
    category: row.category ? { slug: row.category.slug, name: locale === "en" ? row.category.nameEn : row.category.nameNl } : null,
    title: text.title,
    excerpt: text.excerpt,
    body: text.body,
    seoTitle: text.seoTitle || text.title,
    seoDescription: text.seoDescription || text.excerpt || text.title,
    minutes: readingMinutes(text.body),
    // English readers see the Dutch text when there's no translation yet.
    translated: locale === "nl" || Boolean(row.en),
  };
}
export type ArticleView = ReturnType<typeof view>;

export async function contentCategories(kind: ContentKind) {
  "use cache";
  cacheTag(CONTENT_TAG);
  cacheLife("hours");
  return (await listContentCategories(kind)).map((c) => ({
    id: c.id,
    slug: c.slug,
    nameNl: c.nameNl,
    nameEn: c.nameEn,
    descriptionNl: c.descriptionNl,
    descriptionEn: c.descriptionEn,
    count: c._count.articles,
  }));
}

export async function contentList(kind: ContentKind, locale: Locale, opts: { categorySlug?: string | null; page?: number; pageSize?: number } = {}) {
  "use cache";
  cacheTag(CONTENT_TAG);
  cacheLife("hours");
  const { rows, total, pages } = await publishedArticles(kind, opts);
  return { articles: rows.map((r) => view(r, locale)), total, pages };
}

export async function contentArticle(kind: ContentKind, slug: string, locale: Locale) {
  "use cache";
  cacheTag(CONTENT_TAG);
  cacheLife("hours");
  const row = await publishedArticle(kind, slug);
  if (!row) return null;
  const related = await relatedArticles(kind, row, kind === "help" ? 5 : 3);
  return { article: view(row, locale), related: related.map((r) => view(r, locale)) };
}
