import { randomUUID } from "node:crypto";
import { type ArticleLocale, articleLocaleSchema, contentSlug, type ContentKind, coverImage } from "@stagedesk/core";
import { prisma } from "./client";
import type { Prisma } from "./generated/prisma/client";

export class ContentError extends Error {
  constructor(readonly code: "not_found" | "slug_taken" | "invalid" | "category_in_use") {
    super(`Content: ${code}`);
    this.name = "ContentError";
  }
}

// ── Categories ────────────────────────────────────────────────────────────

export async function listContentCategories(kind: ContentKind) {
  return prisma.contentCategory.findMany({
    where: { kind },
    orderBy: [{ position: "asc" }, { nameNl: "asc" }],
    include: { _count: { select: { articles: { where: { status: "published" } } } } },
  });
}

export interface CategoryInput {
  slug: string;
  nameNl: string;
  nameEn: string;
  descriptionNl?: string | null;
  descriptionEn?: string | null;
}

function checkCategory(input: CategoryInput) {
  const slug = contentSlug.safeParse(input.slug);
  if (!slug.success || !input.nameNl.trim() || !input.nameEn.trim()) throw new ContentError("invalid");
  return {
    slug: slug.data,
    nameNl: input.nameNl.trim().slice(0, 80),
    nameEn: input.nameEn.trim().slice(0, 80),
    descriptionNl: input.descriptionNl?.trim().slice(0, 300) || null,
    descriptionEn: input.descriptionEn?.trim().slice(0, 300) || null,
  };
}

export async function saveContentCategory(kind: ContentKind, id: string | null, input: CategoryInput) {
  const data = checkCategory(input);
  const clash = await prisma.contentCategory.findFirst({ where: { kind, slug: data.slug, ...(id ? { id: { not: id } } : {}) }, select: { id: true } });
  if (clash) throw new ContentError("slug_taken");
  if (id) return prisma.contentCategory.update({ where: { id }, data });
  const last = await prisma.contentCategory.findFirst({ where: { kind }, orderBy: { position: "desc" }, select: { position: true } });
  return prisma.contentCategory.create({ data: { id: randomUUID(), kind, position: (last?.position ?? -1) + 1, ...data } });
}

/** Categories with articles can't be deleted; move the articles first. */
export async function deleteContentCategory(id: string) {
  const count = await prisma.contentArticle.count({ where: { categoryId: id } });
  if (count > 0) throw new ContentError("category_in_use");
  await prisma.contentCategory.deleteMany({ where: { id } });
}

// ── Articles (admin) ──────────────────────────────────────────────────────

export interface ArticleInput {
  slug: string;
  categoryId: string | null;
  status: "draft" | "published";
  featured: boolean;
  publishedAt: string | null;
  coverImage: string;
  authorName: string;
  nl: unknown;
  en: unknown | null;
}

function checkArticle(input: ArticleInput) {
  const slug = contentSlug.safeParse(input.slug);
  const nl = articleLocaleSchema.safeParse(input.nl);
  const en = input.en ? articleLocaleSchema.safeParse(input.en) : null;
  const cover = coverImage.safeParse(input.coverImage);
  if (!slug.success || !nl.success || (en && !en.success) || !cover.success) throw new ContentError("invalid");
  const publishedAt = input.publishedAt ? new Date(input.publishedAt) : null;
  if (publishedAt && Number.isNaN(publishedAt.getTime())) throw new ContentError("invalid");
  return {
    slug: slug.data,
    categoryId: input.categoryId || null,
    status: input.status === "published" ? "published" : "draft",
    featured: input.featured,
    // Publishing without a date publishes now.
    publishedAt: input.status === "published" ? (publishedAt ?? new Date()) : publishedAt,
    coverImage: cover.data || null,
    authorName: input.authorName.trim().slice(0, 120) || null,
    nl: nl.data as Prisma.InputJsonValue,
    en: en?.success ? (en.data as Prisma.InputJsonValue) : undefined,
  };
}

export async function saveContentArticle(kind: ContentKind, id: string | null, input: ArticleInput) {
  const data = checkArticle(input);
  const clash = await prisma.contentArticle.findFirst({ where: { kind, slug: data.slug, ...(id ? { id: { not: id } } : {}) }, select: { id: true } });
  if (clash) throw new ContentError("slug_taken");
  if (data.categoryId && !(await prisma.contentCategory.findFirst({ where: { id: data.categoryId, kind }, select: { id: true } }))) throw new ContentError("invalid");
  const en = data.en ?? null;
  if (id) {
    const existing = await prisma.contentArticle.findFirst({ where: { id, kind }, select: { id: true } });
    if (!existing) throw new ContentError("not_found");
    return prisma.contentArticle.update({ where: { id }, data: { ...data, en: en ?? (null as unknown as Prisma.InputJsonValue) } });
  }
  return prisma.contentArticle.create({ data: { id: randomUUID(), kind, ...data, en: en ?? undefined } });
}

export async function deleteContentArticle(id: string) {
  await prisma.contentArticle.deleteMany({ where: { id } });
}

export async function listContentArticlesAdmin(kind: ContentKind, { q = "", status = null, categoryId = null }: { q?: string; status?: string | null; categoryId?: string | null } = {}) {
  const search = q.trim();
  const rows = await prisma.contentArticle.findMany({
    where: { kind, ...(status ? { status } : {}), ...(categoryId ? { categoryId } : {}), ...(search ? { slug: { contains: search.toLowerCase() } } : {}) },
    orderBy: [{ featured: "desc" }, { publishedAt: { sort: "desc", nulls: "first" } }, { updatedAt: "desc" }],
    include: { category: { select: { nameNl: true, nameEn: true } } },
    take: 200,
  });
  // Titles live in JSON, so text search matches the slug in SQL and the title here.
  return search ? rows.filter((r) => r.slug.includes(search.toLowerCase()) || (r.nl as ArticleLocale).title.toLowerCase().includes(search.toLowerCase())) : rows;
}

export async function getContentArticle(id: string) {
  return prisma.contentArticle.findUnique({ where: { id }, include: { category: true } });
}

// ── Public ────────────────────────────────────────────────────────────────

const live = (now = new Date()): Prisma.ContentArticleWhereInput => ({ status: "published", publishedAt: { lte: now } });

/** The article in a language, falling back to Dutch when there's no English version. */
export function articleIn(article: { nl: unknown; en: unknown }, locale: "nl" | "en"): ArticleLocale {
  return ((locale === "en" && article.en) || article.nl) as ArticleLocale;
}

export async function publishedArticles(kind: ContentKind, { categorySlug = null, page = 1, pageSize = 12 }: { categorySlug?: string | null; page?: number; pageSize?: number } = {}) {
  const where: Prisma.ContentArticleWhereInput = { kind, ...live(), ...(categorySlug ? { category: { is: { slug: categorySlug, kind } } } : {}) };
  const [rows, total] = await Promise.all([
    prisma.contentArticle.findMany({
      where,
      // Featured first, then newest.
      orderBy: [{ featured: "desc" }, { publishedAt: "desc" }],
      skip: (Math.max(1, page) - 1) * pageSize,
      take: pageSize,
      include: { category: true },
    }),
    prisma.contentArticle.count({ where }),
  ]);
  return { rows, total, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function publishedArticle(kind: ContentKind, slug: string) {
  return prisma.contentArticle.findFirst({ where: { kind, slug, ...live() }, include: { category: true } });
}

/** Other articles in the same category first, then the newest ones. */
export async function relatedArticles(kind: ContentKind, article: { id: string; categoryId: string | null }, take = 3) {
  const same = article.categoryId
    ? await prisma.contentArticle.findMany({ where: { kind, ...live(), categoryId: article.categoryId, id: { not: article.id } }, orderBy: { publishedAt: "desc" }, take, include: { category: true } })
    : [];
  if (same.length >= take) return same;
  const more = await prisma.contentArticle.findMany({
    where: { kind, ...live(), id: { notIn: [article.id, ...same.map((a) => a.id)] } },
    orderBy: { publishedAt: "desc" },
    take: take - same.length,
    include: { category: true },
  });
  return [...same, ...more];
}

/** Everything published, for the sitemap. */
export async function allPublishedSlugs(kind: ContentKind) {
  return prisma.contentArticle.findMany({ where: { kind, ...live() }, select: { slug: true, updatedAt: true, en: true } });
}
