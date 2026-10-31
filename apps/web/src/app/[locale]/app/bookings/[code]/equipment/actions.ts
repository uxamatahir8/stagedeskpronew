"use server";

import { getTranslations } from "next-intl/server";
import { z } from "zod";
import {
  addToPackingList,
  applyPackage,
  confirmLost,
  EquipmentError,
  finishCheckIn,
  loadGroup,
  loadLine,
  overrideLine,
  previewPackage,
  removeLine,
  retryReservations,
  returnGroup,
  returnLine,
  setLineQuantity,
} from "@stagedesk/db";
import { type ActionResult, runAction } from "@/lib/actions";
import { writeBlocked } from "@/lib/billing";
import { equipmentAccess, type EquipmentAccess, lineOfBooking } from "@/lib/equipment-access";

/**
 * Packing list, loading and returns for one booking. Shared by the desk's
 * booking page and the assigned artist's gig page: every action resolves who
 * may do what through equipmentAccess() and checks the line belongs to that
 * booking. Planning is desk-only; loading and returns also for an artist the
 * agency allows; overrides and losses for owners and admins.
 */

export interface EquipmentResult extends ActionResult {
  /** The refusal was a same-day conflict an owner or admin may override with a reason. */
  overridable?: boolean;
}

const id = z.string().min(1).max(64);
const qty = z.number().int().min(1).max(100_000);
const reason = z.string().trim().max(191).nullable().optional();

type Need = "plan" | "handle" | "override";

async function gate(code: string, need: Need): Promise<{ access: EquipmentAccess } | { error: EquipmentResult }> {
  const t = await getTranslations("inventoryErrors");
  const access = await equipmentAccess(z.string().max(16).parse(code));
  const allowed = access && (need === "plan" ? access.canPlan : need === "handle" ? access.canHandle : access.canPlan && access.canOverride);
  if (!access || !allowed) return { error: { ok: false, message: t("not_allowed") } };
  const blocked = await writeBlocked(access.organizationId);
  if (blocked) return { error: { ok: false, message: blocked } };
  return { access };
}

/** runAction plus whether a conflict could be overridden (to offer the reason dialog). */
async function run(task: () => Promise<string | void>): Promise<EquipmentResult> {
  let overridable = false;
  const result = await runAction(async () => {
    try {
      return await task();
    } catch (error) {
      if (error instanceof EquipmentError && error.code === "conflict" && error.conflicts.length > 0) overridable = error.conflicts.every((c) => c.overridable);
      throw error;
    }
  });
  return overridable ? { ...result, overridable } : result;
}

async function line(access: EquipmentAccess, lineId: string) {
  const found = await lineOfBooking(access, id.parse(lineId));
  if (!found) throw new EquipmentError("not_found");
  return found.id;
}

export async function addEquipmentAction(code: string, input: { itemId: string; quantity: number; reason?: string | null }): Promise<EquipmentResult> {
  const g = await gate(code, "plan");
  if ("error" in g) return g.error;
  const { access } = g;
  const parsed = z.object({ itemId: id, quantity: qty, reason }).parse(input);
  const t = await getTranslations("equipment");
  return run(async () => {
    const result = await addToPackingList(access.organizationId, access.bookingId, parsed, { id: access.userId, canOverride: access.canOverride }, parsed.reason || null);
    if (result.warnings.length) return t("addedWithWarning", { count: result.added, codes: result.warnings.map((w) => w.code).join(", ") });
    return t("added", { count: result.added });
  });
}

export async function previewPackageAction(code: string, packageId: string) {
  const g = await gate(code, "plan");
  if ("error" in g) return { ok: false as const, message: g.error.message };
  try {
    return { ok: true as const, preview: await previewPackage(g.access.organizationId, g.access.bookingId, id.parse(packageId)) };
  } catch (error) {
    const result = await runAction(async () => {
      throw error;
    });
    return { ok: false as const, message: result.message };
  }
}

export async function applyPackageAction(code: string, packageId: string, picks: { itemId: string; quantity: number }[], overrideReason?: string | null): Promise<EquipmentResult> {
  const g = await gate(code, "plan");
  if ("error" in g) return g.error;
  const { access } = g;
  const parsed = z.array(z.object({ itemId: id, quantity: qty })).max(500).parse(picks);
  const t = await getTranslations("equipment");
  return run(async () => {
    const result = await applyPackage(access.organizationId, access.bookingId, id.parse(packageId), parsed, { id: access.userId, canOverride: access.canOverride }, reason.parse(overrideReason) || null);
    return t("added", { count: result.added });
  });
}

export async function setQuantityAction(code: string, lineId: string, quantity: number, overrideReason?: string | null): Promise<EquipmentResult> {
  const g = await gate(code, "plan");
  if ("error" in g) return g.error;
  const { access } = g;
  const t = await getTranslations("equipment");
  return run(async () => {
    await setLineQuantity(access.organizationId, await line(access, lineId), qty.parse(quantity), { id: access.userId, canOverride: access.canOverride }, reason.parse(overrideReason) || null);
    return t("saved");
  });
}

export async function removeLineAction(code: string, lineId: string): Promise<EquipmentResult> {
  const g = await gate(code, "plan");
  if ("error" in g) return g.error;
  const { access } = g;
  const t = await getTranslations("equipment");
  return run(async () => {
    await removeLine(access.organizationId, await line(access, lineId), { id: access.userId });
    return t("removed");
  });
}

export async function retryReservationsAction(code: string): Promise<EquipmentResult> {
  const g = await gate(code, "plan");
  if ("error" in g) return g.error;
  const { access } = g;
  const t = await getTranslations("equipment");
  return run(async () => {
    const result = await retryReservations(access.organizationId, access.bookingId, { id: access.userId });
    if (result.failed.length) return t("retryPartial", { reserved: result.reserved, codes: result.failed.map((f) => f.code).join(", ") });
    return t("retryDone", { reserved: result.reserved });
  });
}

export async function overrideLineAction(code: string, lineId: string, why: string): Promise<EquipmentResult> {
  const g = await gate(code, "override");
  if ("error" in g) return g.error;
  const { access } = g;
  const t = await getTranslations("equipment");
  return run(async () => {
    await overrideLine(access.organizationId, await line(access, lineId), z.string().trim().min(1).max(191).parse(why), { id: access.userId, canOverride: access.canOverride });
    return t("overrideDone");
  });
}

export async function loadAction(code: string, lineId: string, delta: number): Promise<EquipmentResult> {
  const g = await gate(code, "handle");
  if ("error" in g) return g.error;
  const { access } = g;
  return run(async () => {
    await loadLine(access.organizationId, await line(access, lineId), z.number().int().min(-100_000).max(100_000).parse(delta), access.userId);
  });
}

export async function loadGroupAction(code: string, containerId: string): Promise<EquipmentResult> {
  const g = await gate(code, "handle");
  if ("error" in g) return g.error;
  const { access } = g;
  const t = await getTranslations("equipment");
  return run(async () => {
    const result = await loadGroup(access.organizationId, access.bookingId, id.parse(containerId), access.userId);
    return result.skipped.length ? t("loadedSkipped", { count: result.loaded, codes: result.skipped.join(", ") }) : t("loadedCount", { count: result.loaded });
  });
}

export async function returnAction(code: string, lineId: string, input: { ok: number; damaged: number; note?: string | null }): Promise<EquipmentResult> {
  const g = await gate(code, "handle");
  if ("error" in g) return g.error;
  const { access } = g;
  const parsed = z.object({ ok: z.number().int().min(0).max(100_000), damaged: z.number().int().min(0).max(100_000), note: z.string().max(500).nullable().optional() }).parse(input);
  const t = await getTranslations("equipment");
  return run(async () => {
    await returnLine(access.organizationId, await line(access, lineId), parsed, access.userId);
    return parsed.damaged > 0 ? t("damageRecorded") : undefined;
  });
}

export async function returnGroupAction(code: string, containerId: string, input: { present: string[]; damaged: string[]; note?: string | null }): Promise<EquipmentResult> {
  const g = await gate(code, "handle");
  if ("error" in g) return g.error;
  const { access } = g;
  const parsed = z.object({ present: z.array(id).max(500), damaged: z.array(id).max(500), note: z.string().max(500).nullable().optional() }).parse(input);
  const t = await getTranslations("equipment");
  return run(async () => {
    await returnGroup(access.organizationId, access.bookingId, id.parse(containerId), parsed, access.userId);
    return t("groupReturned");
  });
}

export async function finishCheckInAction(code: string): Promise<EquipmentResult> {
  const g = await gate(code, "plan");
  if ("error" in g) return g.error;
  const { access } = g;
  const t = await getTranslations("equipment");
  return run(async () => {
    const result = await finishCheckIn(access.organizationId, access.bookingId, access.userId);
    return result.missing > 0 ? t("checkedInMissing", { count: result.missing }) : t("checkedIn");
  });
}

export async function confirmLostAction(code: string, lineId: string, quantity: number, note: string | null): Promise<EquipmentResult> {
  const g = await gate(code, "override");
  if ("error" in g) return g.error;
  const { access } = g;
  const t = await getTranslations("equipment");
  return run(async () => {
    await confirmLost(access.organizationId, await line(access, lineId), qty.parse(quantity), { id: access.userId, canOverride: access.canOverride }, z.string().max(500).nullable().parse(note));
    return t("lostConfirmed");
  });
}
