import { randomUUID } from "node:crypto";
import { type PageContent, pageContentSchema, pendingAcceptances } from "@stagedesk/core";
import { prisma } from "./client";
import type { Prisma } from "./generated/prisma/client";

export interface PageMeta {
  slugNl: string;
  slugEn: string;
  kind: "standard" | "legal";
  legalKey: string | null;
  acceptance: "none" | "all" | "agencies";
  placement: string;
  position: number;
}

export class PageError extends Error {
  constructor(readonly code: "slug_taken" | "legal_key_taken" | "not_found" | "invalid_content") {
    super(`Page: ${code}`);
    this.name = "PageError";
  }
}

/**
 * Saves a page's settings and its content as a new draft version. Every save
 * is kept, so any earlier text can be compared or restored.
 */
export async function savePageDraft(input: { pageId: string | null; meta: PageMeta; content: PageContent; note: string | null; actorId: string }) {
  const content = pageContentSchema.safeParse(input.content);
  if (!content.success) throw new PageError("invalid_content");
  const clash = await prisma.page.findFirst({
    where: {
      id: input.pageId ? { not: input.pageId } : undefined,
      OR: [{ slugNl: { in: [input.meta.slugNl, input.meta.slugEn] } }, { slugEn: { in: [input.meta.slugNl, input.meta.slugEn] } }],
    },
    select: { id: true },
  });
  if (clash) throw new PageError("slug_taken");
  if (input.meta.legalKey) {
    const taken = await prisma.page.findFirst({ where: { legalKey: input.meta.legalKey, id: input.pageId ? { not: input.pageId } : undefined }, select: { id: true } });
    if (taken) throw new PageError("legal_key_taken");
  }

  return prisma.$transaction(async (tx) => {
    const page = input.pageId
      ? await tx.page.update({ where: { id: input.pageId }, data: input.meta })
      : await tx.page.create({ data: { id: randomUUID(), ...input.meta } });
    const last = await tx.pageVersion.findFirst({ where: { pageId: page.id }, orderBy: { number: "desc" }, select: { number: true } });
    const version = await tx.pageVersion.create({
      data: {
        id: randomUUID(),
        pageId: page.id,
        number: (last?.number ?? 0) + 1,
        content: content.data as unknown as Prisma.InputJsonValue,
        note: input.note?.trim().slice(0, 191) || null,
        createdById: input.actorId,
      },
    });
    return { page, version };
  });
}

/** Makes a version the live one. Legal pages with acceptance then ask users to accept it. */
export async function publishPageVersion(pageId: string, versionId: string, now = new Date()) {
  const version = await prisma.pageVersion.findFirst({ where: { id: versionId, pageId } });
  if (!version) throw new PageError("not_found");
  await prisma.$transaction([
    prisma.pageVersion.update({ where: { id: versionId }, data: { publishedAt: version.publishedAt ?? now } }),
    prisma.page.update({ where: { id: pageId }, data: { status: "published", publishedVersionId: versionId } }),
  ]);
}

export async function unpublishPage(pageId: string) {
  await prisma.page.update({ where: { id: pageId }, data: { status: "draft", publishedVersionId: null } });
}

/** Copies an earlier version into a new draft (the history itself never changes). */
export async function restorePageVersion(pageId: string, versionId: string, actorId: string) {
  const version = await prisma.pageVersion.findFirst({ where: { id: versionId, pageId } });
  if (!version) throw new PageError("not_found");
  const last = await prisma.pageVersion.findFirstOrThrow({ where: { pageId }, orderBy: { number: "desc" }, select: { number: true } });
  return prisma.pageVersion.create({
    data: { id: randomUUID(), pageId, number: last.number + 1, content: version.content as Prisma.InputJsonValue, note: `Restored from version ${version.number}`, createdById: actorId },
  });
}

export function parsePageContent(value: unknown): PageContent | null {
  const parsed = pageContentSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** A published page by its slug in either language. */
export async function publishedPageBySlug(slug: string) {
  const page = await prisma.page.findFirst({
    where: { status: "published", OR: [{ slugNl: slug }, { slugEn: slug }] },
    include: { publishedVersion: true },
  });
  const content = page?.publishedVersion ? parsePageContent(page.publishedVersion.content) : null;
  return page && content ? { page, content, publishedAt: page.publishedVersion!.publishedAt } : null;
}

/** Published pages placed in the header or footer, in order, with their titles. */
export async function placedPages() {
  const pages = await prisma.page.findMany({
    where: { status: "published", placement: { not: "none" } },
    orderBy: [{ placement: "asc" }, { position: "asc" }],
    include: { publishedVersion: { select: { content: true } } },
  });
  return pages.flatMap((p) => {
    const content = p.publishedVersion ? parsePageContent(p.publishedVersion.content) : null;
    return content ? [{ id: p.id, placement: p.placement, slugNl: p.slugNl, slugEn: p.slugEn, titleNl: content.nl.title, titleEn: content.en.title }] : [];
  });
}

/** Slugs of a legal page (e.g. terms), to link to it from forms. */
export function legalPageSlugs(key: string) {
  return prisma.page.findFirst({ where: { legalKey: key, status: "published" }, select: { slugNl: true, slugEn: true } });
}

/** Legal versions the user still has to accept. */
export async function pendingLegal(userId: string) {
  const [pages, accepted, membership] = await Promise.all([
    prisma.page.findMany({
      where: { status: "published", acceptance: { in: ["all", "agencies"] }, publishedVersionId: { not: null } },
      select: { id: true, acceptance: true, publishedVersionId: true, slugNl: true, slugEn: true, publishedVersion: { select: { content: true, publishedAt: true } } },
    }),
    prisma.legalAcceptance.findMany({ where: { userId }, select: { versionId: true } }),
    prisma.member.count({ where: { userId, role: { in: ["agency_owner", "agency_admin", "agency_staff"] } } }),
  ]);
  return pendingAcceptances(pages, new Set(accepted.map((a) => a.versionId)), membership > 0) as typeof pages;
}

export async function acceptLegal(userId: string, versionIds: string[], ip: string | null) {
  const versions = await prisma.pageVersion.findMany({ where: { id: { in: versionIds }, publishedFor: { isNot: null } }, select: { id: true, pageId: true } });
  await prisma.legalAcceptance.createMany({
    data: versions.map((v) => ({ id: randomUUID(), userId, pageId: v.pageId, versionId: v.id, ip })),
    skipDuplicates: true,
  });
  return versions.length;
}
