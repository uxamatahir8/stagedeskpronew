"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath, updateTag } from "next/cache";
import { getTranslations } from "next-intl/server";
import { type ContentKind, contentKinds } from "@stagedesk/core";
import { type ArticleInput, audit, type CategoryInput, ContentError, deleteContentArticle, deleteContentCategory, prisma, saveContentArticle, saveContentCategory } from "@stagedesk/db";
import type { ActionResult } from "@/lib/actions";
import { CONTENT_TAG } from "@/lib/content";
import { detectImage, putPublicFile } from "@/lib/storage";
import { requirePermission } from "@/lib/viewer";

const isKind = (k: string): k is ContentKind => (contentKinds as readonly string[]).includes(k);

function refresh() {
  updateTag(CONTENT_TAG);
  revalidatePath("/[locale]/app/content", "layout");
}

async function failed(error: unknown): Promise<{ ok: false; message: string }> {
  if (error instanceof ContentError) return { ok: false, message: (await getTranslations("contentAdmin"))(`error_${error.code}`) };
  throw error;
}

export type SaveArticleResult = { ok: true; id: string; message: string } | { ok: false; message: string };

export async function saveArticleAction(kind: string, id: string | null, input: ArticleInput): Promise<SaveArticleResult> {
  const viewer = await requirePermission("platform.pages");
  if (!isKind(kind)) return { ok: false, message: "invalid" };
  const t = await getTranslations("contentAdmin");
  try {
    const row = await saveContentArticle(kind, id, input);
    await audit({ actorId: viewer.user.id, action: id ? "content.update" : "content.create", targetType: "content", targetId: row.id, data: { kind, slug: row.slug, status: row.status } });
    refresh();
    return { ok: true, id: row.id, message: row.status === "published" ? t("savedPublished") : t("savedDraft") };
  } catch (error) {
    return failed(error);
  }
}

export async function deleteArticleAction(id: string): Promise<ActionResult> {
  const viewer = await requirePermission("platform.pages");
  const row = await prisma.contentArticle.findUnique({ where: { id }, select: { slug: true, kind: true } });
  await deleteContentArticle(id);
  await audit({ actorId: viewer.user.id, action: "content.delete", targetType: "content", targetId: id, data: { kind: row?.kind, slug: row?.slug } });
  refresh();
  return { ok: true, message: (await getTranslations("contentAdmin"))("deleted") };
}

/** Feature or unfeature a post straight from the list. */
export async function toggleFeaturedAction(id: string, featured: boolean): Promise<ActionResult> {
  const viewer = await requirePermission("platform.pages");
  await prisma.contentArticle.updateMany({ where: { id, kind: "blog" }, data: { featured } });
  await audit({ actorId: viewer.user.id, action: featured ? "content.feature" : "content.unfeature", targetType: "content", targetId: id });
  refresh();
  return { ok: true, message: (await getTranslations("contentAdmin"))(featured ? "featuredOn" : "featuredOff") };
}

export async function saveCategoryAction(kind: string, id: string | null, input: CategoryInput): Promise<ActionResult> {
  const viewer = await requirePermission("platform.pages");
  if (kind !== "blog" && kind !== "help") return { ok: false, message: "invalid" };
  try {
    const row = await saveContentCategory(kind, id, input);
    await audit({ actorId: viewer.user.id, action: id ? "content_category.update" : "content_category.create", targetType: "content_category", targetId: row.id, data: { kind, slug: row.slug } });
    refresh();
    return { ok: true, message: (await getTranslations("contentAdmin"))("categorySaved") };
  } catch (error) {
    return failed(error);
  }
}

export async function deleteCategoryAction(id: string): Promise<ActionResult> {
  const viewer = await requirePermission("platform.pages");
  try {
    await deleteContentCategory(id);
  } catch (error) {
    return failed(error);
  }
  await audit({ actorId: viewer.user.id, action: "content_category.delete", targetType: "content_category", targetId: id });
  refresh();
  return { ok: true, message: (await getTranslations("contentAdmin"))("categoryDeleted") };
}

/** Moves a category one place up or down. */
export async function moveCategoryAction(id: string, direction: -1 | 1): Promise<ActionResult> {
  await requirePermission("platform.pages");
  const current = await prisma.contentCategory.findUnique({ where: { id } });
  if (!current) return { ok: false };
  const list = await prisma.contentCategory.findMany({ where: { kind: current.kind }, orderBy: [{ position: "asc" }, { nameNl: "asc" }] });
  const from = list.findIndex((c) => c.id === id);
  const to = from + direction;
  if (to < 0 || to >= list.length) return { ok: true };
  const [moved] = list.splice(from, 1);
  list.splice(to, 0, moved!);
  await prisma.$transaction(list.map((c, position) => prisma.contentCategory.update({ where: { id: c.id }, data: { position } })));
  refresh();
  return { ok: true };
}

export type UploadResult = { ok: true; url: string } | { ok: false; message: string };
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** A cover or inline image for an article, stored with the other public files. */
export async function uploadContentImageAction(form: FormData): Promise<UploadResult> {
  await requirePermission("platform.pages");
  const t = await getTranslations("contentAdmin");
  const file = form.get("image");
  if (!(file instanceof File) || file.size === 0 || file.size > MAX_IMAGE_BYTES) return { ok: false, message: t("invalidImage") };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const image = detectImage(bytes);
  if (!image) return { ok: false, message: t("invalidImage") };
  return { ok: true, url: await putPublicFile(`content/${randomUUID()}.${image.ext}`, bytes, image.mime) };
}
