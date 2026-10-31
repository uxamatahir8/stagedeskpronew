"use server";

import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { equipmentCategorySchema, equipmentItemSchema, equipmentPackageSchema, type Permission } from "@stagedesk/core";
import {
  changeDefectiveStock,
  createCategory,
  createItem,
  deleteCategory,
  deleteItem,
  deletePackage,
  markItemFound,
  markItemLost,
  renameCategory,
  reorderCategories,
  restoreItem,
  retireItem,
  savePackage,
  setContainer,
  setItemStatus,
  suggestCode,
  updateItem,
} from "@stagedesk/db";
import { type ActionResult, runAction } from "@/lib/actions";
import { writeBlocked } from "@/lib/billing";
import { requireAgency } from "@/lib/viewer";

/**
 * Inventory records: items, cases and sets, categories and packages. Each
 * action checks the permission itself; losses and found stock are for owners
 * and admins (agency.inventory.admin) and are audited in packages/db.
 */

const id = z.string().min(1).max(64);
const note = z.string().trim().max(500).nullable().optional().transform((v) => v || null);

async function agency(permission: Permission) {
  const { viewer, organization } = await requireAgency(permission);
  return { userId: viewer.user.id, organizationId: organization.id, blocked: await writeBlocked(organization.id) };
}

export interface ItemResult extends ActionResult {
  id?: string;
}

export async function saveItemAction(itemId: string | null, input: unknown): Promise<ItemResult> {
  const { userId, organizationId, blocked } = await agency("agency.inventory.manage");
  if (blocked) return { ok: false, message: blocked };
  const t = await getTranslations("inventory");
  const parsed = equipmentItemSchema.safeParse(input);
  if (!parsed.success) {
    const field = String(parsed.error.issues[0]?.path[0] ?? "");
    return { ok: false, message: field === "code" ? t("invalidCode") : t("invalidItem") };
  }
  let savedId = itemId;
  const result = await runAction(async () => {
    if (itemId) await updateItem(organizationId, id.parse(itemId), parsed.data, userId);
    else savedId = await createItem(organizationId, parsed.data, userId);
    return t("saved");
  });
  return result.ok ? { ...result, id: savedId ?? undefined } : result;
}

export async function suggestCodeAction(prefix: string): Promise<string> {
  const { organizationId } = await agency("agency.inventory.manage");
  return suggestCode(organizationId, z.string().max(32).parse(prefix));
}

export async function setStatusAction(itemId: string, status: "available" | "maintenance" | "defective", why?: string | null): Promise<ActionResult> {
  const { userId, organizationId, blocked } = await agency("agency.inventory.manage");
  if (blocked) return { ok: false, message: blocked };
  const t = await getTranslations("inventory");
  return runAction(async () => {
    await setItemStatus(organizationId, id.parse(itemId), z.enum(["available", "maintenance", "defective"]).parse(status), userId, note.parse(why));
    return t("saved");
  });
}

export async function changeDefectiveAction(itemId: string, delta: number, why?: string | null): Promise<ActionResult> {
  const { userId, organizationId, blocked } = await agency("agency.inventory.manage");
  if (blocked) return { ok: false, message: blocked };
  const t = await getTranslations("inventory");
  return runAction(async () => {
    await changeDefectiveStock(organizationId, id.parse(itemId), z.number().int().min(-100_000).max(100_000).parse(delta), userId, note.parse(why));
    return t("saved");
  });
}

export async function markLostAction(itemId: string, quantity: number, why?: string | null): Promise<ActionResult> {
  const { userId, organizationId, blocked } = await agency("agency.inventory.admin");
  if (blocked) return { ok: false, message: blocked };
  const t = await getTranslations("inventory");
  return runAction(async () => {
    await markItemLost(organizationId, id.parse(itemId), z.number().int().min(1).max(100_000).parse(quantity), userId, note.parse(why));
    return t("markedLost");
  });
}

export async function markFoundAction(itemId: string, quantity: number, why?: string | null): Promise<ActionResult> {
  const { userId, organizationId, blocked } = await agency("agency.inventory.manage");
  if (blocked) return { ok: false, message: blocked };
  const t = await getTranslations("inventory");
  return runAction(async () => {
    await markItemFound(organizationId, id.parse(itemId), z.number().int().min(1).max(100_000).parse(quantity), userId, note.parse(why));
    return t("markedFound");
  });
}

export async function retireAction(itemId: string, why?: string | null): Promise<ActionResult> {
  const { userId, organizationId, blocked } = await agency("agency.inventory.manage");
  if (blocked) return { ok: false, message: blocked };
  const t = await getTranslations("inventory");
  return runAction(async () => {
    await retireItem(organizationId, id.parse(itemId), userId, note.parse(why));
    return t("retired");
  });
}

export async function restoreAction(itemId: string): Promise<ActionResult> {
  const { userId, organizationId, blocked } = await agency("agency.inventory.manage");
  if (blocked) return { ok: false, message: blocked };
  const t = await getTranslations("inventory");
  return runAction(async () => {
    await restoreItem(organizationId, id.parse(itemId), userId);
    return t("restored");
  });
}

export async function deleteItemAction(itemId: string): Promise<ActionResult> {
  const { userId, organizationId, blocked } = await agency("agency.inventory.manage");
  if (blocked) return { ok: false, message: blocked };
  const t = await getTranslations("inventory");
  return runAction(async () => {
    await deleteItem(organizationId, id.parse(itemId), userId);
    return t("deleted");
  });
}

/** Puts numbered items in a case or set, or takes them out (containerId null). */
export async function setContainerAction(itemIds: string[], containerId: string | null): Promise<ActionResult> {
  const { userId, organizationId, blocked } = await agency("agency.inventory.manage");
  if (blocked) return { ok: false, message: blocked };
  const t = await getTranslations("inventory");
  return runAction(async () => {
    await setContainer(organizationId, z.array(id).min(1).max(200).parse(itemIds), id.nullable().parse(containerId), userId);
    return t("saved");
  });
}

// ─── Categories ─────────────────────────────────────────────────────────

export async function saveCategoryAction(categoryId: string | null, name: string): Promise<ActionResult> {
  const { organizationId, blocked } = await agency("agency.inventory.manage");
  if (blocked) return { ok: false, message: blocked };
  const t = await getTranslations("inventory");
  const parsed = equipmentCategorySchema.safeParse({ name });
  if (!parsed.success) return { ok: false, message: t("invalidCategory") };
  return runAction(async () => {
    if (categoryId) await renameCategory(organizationId, id.parse(categoryId), parsed.data.name);
    else await createCategory(organizationId, parsed.data.name);
    return t("saved");
  });
}

export async function reorderCategoriesAction(ids: string[]): Promise<ActionResult> {
  const { organizationId, blocked } = await agency("agency.inventory.manage");
  if (blocked) return { ok: false, message: blocked };
  return runAction(async () => {
    await reorderCategories(organizationId, z.array(id).max(500).parse(ids));
  });
}

export async function deleteCategoryAction(categoryId: string): Promise<ActionResult> {
  const { organizationId, blocked } = await agency("agency.inventory.manage");
  if (blocked) return { ok: false, message: blocked };
  const t = await getTranslations("inventory");
  return runAction(async () => {
    await deleteCategory(organizationId, id.parse(categoryId));
    return t("deleted");
  });
}

// ─── Packages ───────────────────────────────────────────────────────────

export async function savePackageAction(packageId: string | null, input: unknown): Promise<ItemResult> {
  const { organizationId, blocked } = await agency("agency.inventory.manage");
  if (blocked) return { ok: false, message: blocked };
  const t = await getTranslations("inventory");
  const parsed = equipmentPackageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t("invalidPackage") };
  let savedId: string | null = packageId;
  const result = await runAction(async () => {
    savedId = await savePackage(organizationId, packageId ? id.parse(packageId) : null, parsed.data);
    return t("saved");
  });
  return result.ok ? { ...result, id: savedId ?? undefined } : result;
}

export async function deletePackageAction(packageId: string): Promise<ActionResult> {
  const { organizationId, blocked } = await agency("agency.inventory.manage");
  if (blocked) return { ok: false, message: blocked };
  const t = await getTranslations("inventory");
  return runAction(async () => {
    await deletePackage(organizationId, id.parse(packageId));
    return t("deleted");
  });
}
