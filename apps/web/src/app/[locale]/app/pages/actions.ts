"use server";

import { revalidatePath, updateTag } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { isValidSlug, legalKeys, pageContentSchema, pagePlacements } from "@stagedesk/core";
import { audit, PageError, prisma, publishPageVersion, restorePageVersion, savePageDraft, unpublishPage } from "@stagedesk/db";
import type { ActionResult } from "@/lib/actions";
import { SITE_TAGS } from "@/lib/site";
import { requirePermission } from "@/lib/viewer";

const metaSchema = z.object({
  slugNl: z.string().trim().toLowerCase(),
  slugEn: z.string().trim().toLowerCase(),
  kind: z.enum(["standard", "legal"]),
  legalKey: z.enum(legalKeys).nullable(),
  acceptance: z.enum(["none", "all", "agencies"]),
  placement: z.enum(pagePlacements),
  position: z.int().min(0).max(999),
});

export type SavePageResult = { ok: true; pageId: string; message: string } | { ok: false; message: string };

function refresh() {
  updateTag(SITE_TAGS.pages);
  revalidatePath("/[locale]/app/pages", "layout");
}

/** Saves the page as a new version and, when asked, publishes that version. */
export async function savePageAction(input: { pageId: string | null; meta: unknown; content: unknown; note: string; publish: boolean }): Promise<SavePageResult> {
  const viewer = await requirePermission("platform.pages");
  const t = await getTranslations("pageBuilder");
  const meta = metaSchema.safeParse(input.meta);
  if (!meta.success) return { ok: false, message: t("invalidSettings") };
  if (!isValidSlug(meta.data.slugNl) || !isValidSlug(meta.data.slugEn)) return { ok: false, message: t("invalidSlug") };
  const content = pageContentSchema.safeParse(input.content);
  if (!content.success) {
    const where = content.error.issues[0]?.path.slice(0, 3).join(" › ") ?? "";
    return { ok: false, message: t("invalidContent", { where }) };
  }
  // Only legal pages ask for acceptance or carry a legal key.
  const data = meta.data.kind === "legal" ? meta.data : { ...meta.data, legalKey: null, acceptance: "none" as const };

  try {
    const { page, version } = await savePageDraft({ pageId: input.pageId, meta: data, content: content.data, note: input.note || null, actorId: viewer.user.id });
    if (input.publish) await publishPageVersion(page.id, version.id);
    await audit({ actorId: viewer.user.id, action: input.publish ? "page.publish" : "page.save", targetType: "page", targetId: page.id, data: { version: version.number, slug: page.slugEn } });
    refresh();
    return { ok: true, pageId: page.id, message: input.publish ? t("published", { version: version.number }) : t("saved", { version: version.number }) };
  } catch (error) {
    if (error instanceof PageError) return { ok: false, message: t(`error_${error.code}`) };
    throw error;
  }
}

export async function publishVersionAction(pageId: string, versionId: string): Promise<ActionResult> {
  const viewer = await requirePermission("platform.pages");
  const t = await getTranslations("pageBuilder");
  try {
    await publishPageVersion(pageId, versionId);
  } catch {
    return { ok: false, message: t("error_not_found") };
  }
  const version = await prisma.pageVersion.findUnique({ where: { id: versionId }, select: { number: true } });
  await audit({ actorId: viewer.user.id, action: "page.publish", targetType: "page", targetId: pageId, data: { version: version?.number } });
  refresh();
  return { ok: true, message: t("published", { version: version?.number ?? "" }) };
}

export async function unpublishAction(pageId: string): Promise<ActionResult> {
  const viewer = await requirePermission("platform.pages");
  await unpublishPage(pageId);
  await audit({ actorId: viewer.user.id, action: "page.unpublish", targetType: "page", targetId: pageId });
  refresh();
  return { ok: true, message: (await getTranslations("pageBuilder"))("unpublished") };
}

export async function restoreVersionAction(pageId: string, versionId: string): Promise<ActionResult> {
  const viewer = await requirePermission("platform.pages");
  const t = await getTranslations("pageBuilder");
  try {
    const version = await restorePageVersion(pageId, versionId, viewer.user.id);
    await audit({ actorId: viewer.user.id, action: "page.restore", targetType: "page", targetId: pageId, data: { version: version.number } });
    refresh();
    return { ok: true, message: t("restored", { version: version.number }) };
  } catch {
    return { ok: false, message: t("error_not_found") };
  }
}

export async function moderateCommentAction(commentId: string, status: "approved" | "rejected"): Promise<ActionResult> {
  const viewer = await requirePermission("platform.pages");
  await prisma.blogComment.updateMany({ where: { id: commentId }, data: { status } });
  await audit({ actorId: viewer.user.id, action: `comment.${status === "approved" ? "approve" : "reject"}`, targetType: "comment", targetId: commentId });
  revalidatePath("/[locale]/app/pages", "page");
  revalidatePath("/[locale]/blog/[slug]", "page");
  return { ok: true, message: (await getTranslations("pageBuilder"))(status === "approved" ? "commentApproved" : "commentRejected") };
}
