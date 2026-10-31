import { randomUUID } from "node:crypto";
import {
  availabilityOn,
  type ClaimLine,
  type EquipmentItemInput,
  type EquipmentPackageInput,
  type EquipmentStatus,
  membershipError,
  type MembershipError,
  outstandingOf,
  parseEquipmentSpecs,
  todayInNetherlands,
} from "@stagedesk/core";
import { audit } from "./audit";
import { prisma } from "./client";
import { Prisma } from "./generated/prisma/client";
import { tenantDb, type TenantDb } from "./tenant";

/**
 * An agency's equipment records: categories, items, cases and sets, status
 * changes and their history. Packing lists are in booking-equipment.ts.
 * Every function takes the agency id and works through its tenant-scoped
 * client; references inside the module are also composite foreign keys.
 */

export type InventoryErrorCode =
  | "not_found"
  | "code_taken"
  | "name_taken"
  | "in_use"
  | "has_history"
  | "not_empty"
  | "out"
  | "reserved"
  | "invalid_status"
  | "below_use"
  | "kind_locked"
  | MembershipError;

export class InventoryError extends Error {
  constructor(
    readonly code: InventoryErrorCode,
    readonly detail?: Record<string, unknown>,
  ) {
    super(`Inventory: ${code}`);
    this.name = "InventoryError";
  }
}

export type Tx = Parameters<Parameters<TenantDb["$transaction"]>[0]>[0];

const isUniqueViolation = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

/**
 * Locks item rows for the rest of the transaction, in id order so two
 * transactions never wait on each other in a circle. Every write that changes
 * what an item can be used for takes these locks first.
 */
export async function lockItems(tx: Tx, organizationId: string, itemIds: readonly string[]) {
  const ids = [...new Set(itemIds)].sort();
  if (ids.length === 0) return;
  await tx.$queryRaw`SELECT id FROM equipment_items WHERE organizationId = ${organizationId} AND id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`;
}

export async function logItemEvent(
  tx: Tx,
  itemId: string,
  type: string,
  actorId: string | null,
  data?: Record<string, unknown> | null,
  bookingId?: string | null,
) {
  await tx.equipmentEvent.create({
    // organizationId is filled in by the tenant-scoped client.
    data: { itemId, type, actorId, bookingId: bookingId ?? null, data: data ? (data as Prisma.InputJsonValue) : Prisma.JsonNull, organizationId: "" },
  });
}

/** Lines of these items, with what availability needs to know about their bookings. */
export async function claimLinesOf(tx: Tx | TenantDb, itemIds: readonly string[]) {
  const lines = await tx.bookingEquipment.findMany({
    where: { itemId: { in: [...itemIds] } },
    include: { booking: { select: { status: true, eventDate: true, equipmentCheckedInAt: true } } },
  });
  const byItem = new Map<string, (ClaimLine & { id: string; itemId: string })[]>();
  for (const l of lines) {
    const claim = toClaimLine(l);
    byItem.set(l.itemId, [...(byItem.get(l.itemId) ?? []), claim]);
  }
  return byItem;
}

export function toClaimLine(l: {
  id: string;
  itemId: string;
  bookingId: string;
  quantity: number;
  loadedQty: number;
  returnedQty: number;
  damagedQty: number;
  lostQty: number;
  reservedAt: Date | null;
  overrideReason: string | null;
  booking: { status: string; eventDate: Date | null; equipmentCheckedInAt: Date | null };
}): ClaimLine & { id: string; itemId: string } {
  return {
    id: l.id,
    itemId: l.itemId,
    bookingId: l.bookingId,
    quantity: l.quantity,
    loadedQty: l.loadedQty,
    returnedQty: l.returnedQty,
    damagedQty: l.damagedQty,
    lostQty: l.lostQty,
    reservedAt: l.reservedAt,
    overrideReason: l.overrideReason,
    bookingStatus: l.booking.status,
    eventDate: l.booking.eventDate ? l.booking.eventDate.toISOString().slice(0, 10) : null,
    checkedIn: l.booking.equipmentCheckedInAt !== null,
  };
}

// ─── Categories ─────────────────────────────────────────────────────────

export async function listCategories(organizationId: string) {
  const db = tenantDb(organizationId);
  const [categories, counts] = await Promise.all([
    db.equipmentCategory.findMany({ orderBy: [{ position: "asc" }, { name: "asc" }] }),
    db.equipmentItem.groupBy({ by: ["categoryId"], where: { status: { not: "retired" } }, _count: { _all: true } }),
  ]);
  const count = new Map(counts.map((c) => [c.categoryId, c._count._all]));
  return categories.map((c) => ({ ...c, items: count.get(c.id) ?? 0 }));
}

export async function createCategory(organizationId: string, name: string) {
  const db = tenantDb(organizationId);
  const last = await db.equipmentCategory.findFirst({ orderBy: { position: "desc" }, select: { position: true } });
  try {
    return await db.equipmentCategory.create({ data: { id: randomUUID(), name, position: (last?.position ?? -1) + 1, organizationId } });
  } catch (error) {
    if (isUniqueViolation(error)) throw new InventoryError("name_taken");
    throw error;
  }
}

export async function renameCategory(organizationId: string, categoryId: string, name: string) {
  try {
    const updated = await tenantDb(organizationId).equipmentCategory.updateMany({ where: { id: categoryId }, data: { name } });
    if (updated.count === 0) throw new InventoryError("not_found");
  } catch (error) {
    if (isUniqueViolation(error)) throw new InventoryError("name_taken");
    throw error;
  }
}

/** Saves a new order; ids that aren't the agency's are ignored. */
export async function reorderCategories(organizationId: string, ids: readonly string[]) {
  await tenantDb(organizationId).$transaction(async (tx) => {
    for (const [position, id] of ids.entries()) await tx.equipmentCategory.updateMany({ where: { id }, data: { position } });
  });
}

/** Only categories nothing uses (items, retired ones included, or package lines). */
export async function deleteCategory(organizationId: string, categoryId: string) {
  const db = tenantDb(organizationId);
  const [items, lines] = await Promise.all([db.equipmentItem.count({ where: { categoryId } }), db.equipmentPackageLine.count({ where: { categoryId } })]);
  if (items + lines > 0) throw new InventoryError("in_use", { items, packageLines: lines });
  const deleted = await db.equipmentCategory.deleteMany({ where: { id: categoryId } });
  if (deleted.count === 0) throw new InventoryError("not_found");
}

// ─── Items ──────────────────────────────────────────────────────────────

async function checkReferences(tx: Tx, input: Pick<EquipmentItemInput, "categoryId" | "containerId" | "kind" | "tracking">, itemId: string | null) {
  if (input.categoryId && !(await tx.equipmentCategory.findFirst({ where: { id: input.categoryId }, select: { id: true } }))) {
    throw new InventoryError("not_found", { field: "categoryId" });
  }
  if (input.containerId) {
    const container = await tx.equipmentItem.findFirst({ where: { id: input.containerId }, select: { id: true, kind: true, containerId: true, status: true } });
    if (!container || container.status === "retired") throw new InventoryError("not_found", { field: "containerId" });
    const error = membershipError({ id: itemId, kind: input.kind, tracking: input.tracking }, container);
    if (error) throw new InventoryError(error);
  }
}

function itemData(input: EquipmentItemInput) {
  return {
    code: input.code,
    name: input.name,
    kind: input.kind,
    tracking: input.tracking,
    condition: input.condition,
    categoryId: input.categoryId,
    containerId: input.containerId,
    manufacturer: input.manufacturer,
    model: input.model,
    serialNumber: input.serialNumber,
    powerWatts: input.powerWatts,
    batteryPowered: input.batteryPowered,
    specs: input.specs.length ? (input.specs as Prisma.InputJsonValue) : Prisma.JsonNull,
    notes: input.notes,
    excludeFromSharing: input.excludeFromSharing,
  };
}

export async function createItem(organizationId: string, input: EquipmentItemInput, actorId: string) {
  try {
    return await tenantDb(organizationId).$transaction(async (tx) => {
      await checkReferences(tx, input, null);
      if (input.containerId) await lockItems(tx, organizationId, [input.containerId]);
      const id = randomUUID();
      await tx.equipmentItem.create({ data: { id, ...itemData(input), quantity: input.quantity, organizationId } });
      await logItemEvent(tx, id, "created", actorId, { code: input.code, quantity: input.quantity });
      if (input.containerId) await logItemEvent(tx, id, "moved_in", actorId, { containerId: input.containerId });
      return id;
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new InventoryError("code_taken");
    throw error;
  }
}

const tracked = ["code", "name", "condition", "categoryId", "manufacturer", "model", "serialNumber", "powerWatts", "batteryPowered", "notes", "excludeFromSharing"] as const;

/**
 * Saves changes. Kind and tracking are fixed once the item has been on a gig or
 * holds contents; changing counted stock is a stock correction (audited) and
 * can't drop below what is out or damaged.
 */
export async function updateItem(organizationId: string, itemId: string, input: EquipmentItemInput, actorId: string) {
  try {
    await tenantDb(organizationId).$transaction(async (tx) => {
      await lockItems(tx, organizationId, [itemId, ...(input.containerId ? [input.containerId] : [])]);
      const item = await tx.equipmentItem.findFirst({ where: { id: itemId }, include: { _count: { select: { contents: true, bookingLines: true } } } });
      if (!item) throw new InventoryError("not_found");
      if ((item.kind !== input.kind || item.tracking !== input.tracking) && (item._count.bookingLines > 0 || item._count.contents > 0)) {
        throw new InventoryError("kind_locked");
      }
      await checkReferences(tx, input, itemId);

      let quantity = item.quantity;
      if (input.tracking === "bulk" && input.quantity !== item.quantity) {
        const lines = (await claimLinesOf(tx, [itemId])).get(itemId) ?? [];
        const out = lines.reduce((sum, l) => sum + Math.max(0, outstandingOf(l)), 0);
        if (input.quantity < item.defectiveQty + out) throw new InventoryError("below_use", { minimum: item.defectiveQty + out });
        quantity = input.quantity;
      } else if (input.tracking === "unit") {
        quantity = 1;
      }

      await tx.equipmentItem.updateMany({ where: { id: itemId }, data: { ...itemData(input), quantity, defectiveQty: input.tracking === "unit" ? 0 : item.defectiveQty } });
      const before = item as unknown as Record<string, unknown>;
      const after = itemData(input) as Record<string, unknown>;
      const changed: string[] = tracked.filter((k) => String(before[k] ?? "") !== String(after[k] ?? ""));
      if (JSON.stringify(parseEquipmentSpecs(item.specs)) !== JSON.stringify(input.specs)) changed.push("specs");
      if (changed.length) await logItemEvent(tx, itemId, "updated", actorId, { fields: changed });
      if (item.containerId !== input.containerId) {
        if (item.containerId) await logItemEvent(tx, itemId, "moved_out", actorId, { containerId: item.containerId });
        if (input.containerId) await logItemEvent(tx, itemId, "moved_in", actorId, { containerId: input.containerId });
      }
      if (quantity !== item.quantity) {
        await logItemEvent(tx, itemId, "stock", actorId, { from: item.quantity, to: quantity });
        await audit({ actorId, action: "inventory.stock", agencyId: organizationId, targetType: "equipment", targetId: itemId, data: { code: input.code, from: item.quantity, to: quantity } });
      }
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new InventoryError("code_taken");
    throw error;
  }
}

/** Moves numbered items into a case or set (or out of it, with containerId null). */
export async function setContainer(organizationId: string, itemIds: readonly string[], containerId: string | null, actorId: string) {
  await tenantDb(organizationId).$transaction(async (tx) => {
    await lockItems(tx, organizationId, [...itemIds, ...(containerId ? [containerId] : [])]);
    const container = containerId ? await tx.equipmentItem.findFirst({ where: { id: containerId }, select: { id: true, kind: true, containerId: true, status: true } }) : null;
    if (containerId && (!container || container.status === "retired")) throw new InventoryError("not_found");
    const items = await tx.equipmentItem.findMany({ where: { id: { in: [...itemIds] } }, select: { id: true, kind: true, tracking: true, containerId: true } });
    if (items.length !== new Set(itemIds).size) throw new InventoryError("not_found");
    for (const item of items) {
      if (container) {
        const error = membershipError(item, container);
        if (error) throw new InventoryError(error);
      }
      if (item.containerId === containerId) continue;
      await tx.equipmentItem.updateMany({ where: { id: item.id }, data: { containerId } });
      if (item.containerId) await logItemEvent(tx, item.id, "moved_out", actorId, { containerId: item.containerId });
      if (containerId) await logItemEvent(tx, item.id, "moved_in", actorId, { containerId });
    }
  });
}

/** Maintenance, back in service, or defective, for things that aren't lost or retired. */
export async function setItemStatus(organizationId: string, itemId: string, status: Extract<EquipmentStatus, "available" | "maintenance" | "defective">, actorId: string, note: string | null) {
  await tenantDb(organizationId).$transaction(async (tx) => {
    await lockItems(tx, organizationId, [itemId]);
    const item = await tx.equipmentItem.findFirst({ where: { id: itemId }, select: { status: true, kind: true } });
    if (!item) throw new InventoryError("not_found");
    if (item.kind === "set" || item.status === "lost" || item.status === "retired") throw new InventoryError("invalid_status");
    if (item.status === status) return;
    await tx.equipmentItem.updateMany({ where: { id: itemId }, data: { status } });
    const type = item.status === "defective" && status === "available" ? "repaired" : "status";
    await logItemEvent(tx, itemId, type, actorId, { from: item.status, to: status, ...(note ? { note } : {}) });
  });
}

/** Counted stock: mark units damaged (defective) or repaired. */
export async function changeDefectiveStock(organizationId: string, itemId: string, delta: number, actorId: string, note: string | null) {
  await tenantDb(organizationId).$transaction(async (tx) => {
    await lockItems(tx, organizationId, [itemId]);
    const item = await tx.equipmentItem.findFirst({ where: { id: itemId }, select: { tracking: true, quantity: true, defectiveQty: true } });
    if (!item) throw new InventoryError("not_found");
    if (item.tracking !== "bulk" || delta === 0) throw new InventoryError("invalid_status");
    const lines = (await claimLinesOf(tx, [itemId])).get(itemId) ?? [];
    const out = lines.reduce((sum, l) => sum + Math.max(0, outstandingOf(l)), 0);
    const next = item.defectiveQty + delta;
    // Damaged units must be in the warehouse: not more than what isn't out.
    if (next < 0 || next > item.quantity - out) throw new InventoryError("below_use", { maximum: item.quantity - out - item.defectiveQty });
    await tx.equipmentItem.updateMany({ where: { id: itemId }, data: { defectiveQty: next } });
    await logItemEvent(tx, itemId, delta > 0 ? "damaged" : "repaired", actorId, { quantity: Math.abs(delta), ...(note ? { note } : {}) });
  });
}

/**
 * Writes equipment off as lost outside a gig (lost on a gig goes through the
 * packing list). Owners and admins only; audited.
 */
export async function markItemLost(organizationId: string, itemId: string, quantity: number, actorId: string, note: string | null) {
  await tenantDb(organizationId).$transaction(async (tx) => {
    await lockItems(tx, organizationId, [itemId]);
    const item = await tx.equipmentItem.findFirst({ where: { id: itemId }, select: { code: true, kind: true, tracking: true, status: true, quantity: true, defectiveQty: true } });
    if (!item) throw new InventoryError("not_found");
    if (item.kind === "set" || item.status === "retired" || item.status === "lost") throw new InventoryError("invalid_status");
    const lines = (await claimLinesOf(tx, [itemId])).get(itemId) ?? [];
    const out = lines.reduce((sum, l) => sum + Math.max(0, outstandingOf(l)), 0);
    if (item.tracking === "unit") {
      if (out > 0) throw new InventoryError("out");
      await tx.equipmentItem.updateMany({ where: { id: itemId }, data: { status: "lost" } });
    } else {
      // Only units in the warehouse; units out on a gig are resolved on that gig.
      if (quantity < 1 || quantity > item.quantity - item.defectiveQty - out) throw new InventoryError("below_use", { maximum: item.quantity - item.defectiveQty - out });
      await tx.equipmentItem.updateMany({ where: { id: itemId }, data: { quantity: item.quantity - quantity } });
    }
    const n = item.tracking === "unit" ? 1 : quantity;
    await logItemEvent(tx, itemId, "lost", actorId, { quantity: n, ...(note ? { note } : {}) });
    await audit({ actorId, action: "inventory.lost", agencyId: organizationId, targetType: "equipment", targetId: itemId, data: { code: item.code, quantity: n } });
  });
}

/** Lost equipment turned up again: back in stock. Audited. */
export async function markItemFound(organizationId: string, itemId: string, quantity: number, actorId: string, note: string | null) {
  await tenantDb(organizationId).$transaction(async (tx) => {
    await lockItems(tx, organizationId, [itemId]);
    const item = await tx.equipmentItem.findFirst({ where: { id: itemId }, select: { code: true, tracking: true, status: true, quantity: true } });
    if (!item) throw new InventoryError("not_found");
    if (item.tracking === "unit") {
      if (item.status !== "lost") throw new InventoryError("invalid_status");
      await tx.equipmentItem.updateMany({ where: { id: itemId }, data: { status: "available" } });
    } else {
      if (quantity < 1 || quantity > 100_000) throw new InventoryError("below_use");
      await tx.equipmentItem.updateMany({ where: { id: itemId }, data: { quantity: item.quantity + quantity } });
    }
    const n = item.tracking === "unit" ? 1 : quantity;
    await logItemEvent(tx, itemId, "found", actorId, { quantity: n, ...(note ? { note } : {}) });
    await audit({ actorId, action: "inventory.found", agencyId: organizationId, targetType: "equipment", targetId: itemId, data: { code: item.code, quantity: n } });
  });
}

/** Upcoming reservations and everything out, per item (for retiring and deleting). */
async function useOf(tx: Tx, itemId: string, today: string) {
  const lines = (await claimLinesOf(tx, [itemId])).get(itemId) ?? [];
  return {
    out: lines.reduce((sum, l) => sum + Math.max(0, outstandingOf(l)), 0),
    reserved: lines.filter((l) => l.reservedAt && ["booked", "confirmed"].includes(l.bookingStatus) && (l.eventDate === null || l.eventDate >= today)).length,
    lines: lines.length,
  };
}

/**
 * Takes equipment out of use for good, keeping its history and code. Refused
 * while it's out or reserved for an upcoming gig, or while a case still holds items.
 */
export async function retireItem(organizationId: string, itemId: string, actorId: string, note: string | null, now = new Date()) {
  await tenantDb(organizationId).$transaction(async (tx) => {
    await lockItems(tx, organizationId, [itemId]);
    const item = await tx.equipmentItem.findFirst({ where: { id: itemId }, select: { status: true, _count: { select: { contents: { where: { status: { not: "retired" } } } } } } });
    if (!item) throw new InventoryError("not_found");
    if (item.status === "retired") return;
    if (item._count.contents > 0) throw new InventoryError("not_empty");
    const use = await useOf(tx, itemId, todayInNetherlands(now));
    if (use.out > 0) throw new InventoryError("out");
    if (use.reserved > 0) throw new InventoryError("reserved", { bookings: use.reserved });
    await tx.equipmentItem.updateMany({ where: { id: itemId }, data: { status: "retired", containerId: null } });
    await logItemEvent(tx, itemId, "retired", actorId, { from: item.status, ...(note ? { note } : {}) });
  });
}

export async function restoreItem(organizationId: string, itemId: string, actorId: string) {
  await tenantDb(organizationId).$transaction(async (tx) => {
    await lockItems(tx, organizationId, [itemId]);
    const updated = await tx.equipmentItem.updateMany({ where: { id: itemId, status: "retired" }, data: { status: "available" } });
    if (updated.count === 0) throw new InventoryError("invalid_status");
    await logItemEvent(tx, itemId, "status", actorId, { from: "retired", to: "available" });
  });
}

/**
 * Deletes equipment that was never used: never on a packing list and empty.
 * Anything with gig history is retired instead. Audited, with a snapshot.
 */
export async function deleteItem(organizationId: string, itemId: string, actorId: string) {
  await tenantDb(organizationId).$transaction(async (tx) => {
    await lockItems(tx, organizationId, [itemId]);
    const item = await tx.equipmentItem.findFirst({ where: { id: itemId }, select: { code: true, name: true, _count: { select: { contents: true, bookingLines: true } } } });
    if (!item) throw new InventoryError("not_found");
    if (item._count.contents > 0) throw new InventoryError("not_empty");
    const grouped = await tx.bookingEquipment.count({ where: { viaContainerId: itemId } });
    if (item._count.bookingLines + grouped > 0) throw new InventoryError("has_history");
    await tx.equipmentEvent.deleteMany({ where: { itemId } });
    await tx.equipmentPackageLine.deleteMany({ where: { itemId } });
    await tx.equipmentItem.deleteMany({ where: { id: itemId } });
    await audit({ actorId, action: "inventory.item_delete", agencyId: organizationId, targetType: "equipment", targetId: itemId, data: { code: item.code, name: item.name } });
  });
}

/** The next free number for a prefix, e.g. "SPK" → "SPK-7" when SPK-1…SPK-6 exist. */
export async function suggestCode(organizationId: string, prefix: string) {
  const clean = prefix.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12) || "EQ";
  const codes = await tenantDb(organizationId).equipmentItem.findMany({ where: { code: { startsWith: `${clean}-` } }, select: { code: true } });
  const highest = codes.reduce((max, c) => {
    const n = Number(c.code.slice(clean.length + 1));
    return Number.isInteger(n) && n > max ? n : max;
  }, 0);
  return `${clean}-${highest + 1}`;
}

// ─── Reading ────────────────────────────────────────────────────────────

export interface InventoryFilters {
  q?: string;
  categoryId?: string | null;
  status?: string | null;
  kind?: string | null;
  page?: number;
  pageSize?: number;
}

/** One page of the agency's equipment, with how much of each is out right now. */
export async function listItems(organizationId: string, filters: InventoryFilters) {
  const db = tenantDb(organizationId);
  const pageSize = filters.pageSize ?? 50;
  const page = Math.max(1, filters.page ?? 1);
  const q = filters.q?.trim();
  const where: Prisma.EquipmentItemWhereInput = {
    ...(q ? { OR: [{ code: { contains: q } }, { name: { contains: q } }, { serialNumber: { contains: q } }, { manufacturer: { contains: q } }, { model: { contains: q } }] } : {}),
    ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
    ...(filters.kind ? { kind: filters.kind } : {}),
    // Retired equipment only shows when asked for.
    status: filters.status ? filters.status : { not: "retired" },
  };
  const [total, items] = await Promise.all([
    db.equipmentItem.count({ where }),
    db.equipmentItem.findMany({
      where,
      orderBy: [{ code: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { category: { select: { name: true } }, container: { select: { code: true, name: true } }, _count: { select: { contents: true } } },
    }),
  ]);
  const lines = await claimLinesOf(db, items.map((i) => i.id));
  return {
    total,
    page,
    pages: Math.max(1, Math.ceil(total / pageSize)),
    items: items.map((item) => {
      const own = lines.get(item.id) ?? [];
      return {
        ...item,
        out: own.reduce((sum, l) => sum + Math.max(0, outstandingOf(l)), 0),
        missing: own.reduce((sum, l) => sum + (l.checkedIn ? Math.max(0, outstandingOf(l)) : 0), 0),
      };
    }),
  };
}

/** Items that can be chosen for a packing list or package (not retired, not sets' members only). */
export async function pickableItems(organizationId: string) {
  return tenantDb(organizationId).equipmentItem.findMany({
    where: { status: { not: "retired" } },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true, kind: true, tracking: true, status: true, quantity: true, defectiveQty: true, containerId: true, category: { select: { id: true, name: true } } },
  });
}

/** Everything the item page shows. */
export async function itemDetail(organizationId: string, itemId: string) {
  const db = tenantDb(organizationId);
  const item = await db.equipmentItem.findFirst({
    where: { id: itemId },
    include: {
      category: { select: { id: true, name: true } },
      container: { select: { id: true, code: true, name: true, kind: true } },
      contents: { orderBy: { code: "asc" }, select: { id: true, code: true, name: true, status: true } },
    },
  });
  if (!item) return null;
  const [events, lines, packages] = await Promise.all([
    db.equipmentEvent.findMany({ where: { itemId }, orderBy: { id: "desc" }, take: 200 }),
    db.bookingEquipment.findMany({
      where: { itemId },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { booking: { select: { id: true, trackingCode: true, status: true, eventDate: true, equipmentCheckedInAt: true, venueName: true, venueCity: true } } },
    }),
    db.equipmentPackageLine.findMany({ where: { itemId }, select: { package: { select: { id: true, name: true } } } }),
  ]);
  const actorIds = [...new Set(events.map((e) => e.actorId).filter((id): id is string => Boolean(id)))];
  const actors = actorIds.length ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } }) : [];
  const bookingIds = [...new Set(events.map((e) => e.bookingId).filter((id): id is string => Boolean(id)))];
  const bookings = bookingIds.length ? await db.booking.findMany({ where: { id: { in: bookingIds } }, select: { id: true, trackingCode: true } }) : [];
  return {
    item: { ...item, specs: parseEquipmentSpecs(item.specs) },
    events: events.map((e) => ({ ...e, id: e.id.toString(), actor: actors.find((a) => a.id === e.actorId)?.name ?? null, bookingCode: bookings.find((b) => b.id === e.bookingId)?.trackingCode ?? null })),
    lines,
    packages: [...new Map(packages.map((p) => [p.package.id, p.package])).values()],
  };
}

/** Free units of each item on a date for a booking (or for a new reservation when bookingId is null). */
export async function availabilityFor(organizationId: string, itemIds: readonly string[], date: string, bookingId: string | null, now = new Date()) {
  const db = tenantDb(organizationId);
  const today = todayInNetherlands(now);
  const [items, lines] = await Promise.all([
    db.equipmentItem.findMany({ where: { id: { in: [...itemIds] } }, select: { id: true, kind: true, tracking: true, status: true, quantity: true, defectiveQty: true } }),
    claimLinesOf(db, itemIds),
  ]);
  return new Map(items.map((item) => [item.id, availabilityOn(item, lines.get(item.id) ?? [], date, today, bookingId)]));
}

/**
 * Dashboard figures. Numbered items and cases count once each; sets aren't
 * equipment; counted stock (cables) is reported in units, separately.
 */
export async function inventoryStats(organizationId: string, now = new Date()) {
  const db = tenantDb(organizationId);
  const today = todayInNetherlands(now);
  const [byStatus, bulk, outLines, unreserved] = await Promise.all([
    db.equipmentItem.groupBy({ by: ["status"], where: { kind: { not: "set" }, tracking: "unit" }, _count: { _all: true } }),
    db.equipmentItem.aggregate({ where: { tracking: "bulk", status: { not: "retired" } }, _sum: { quantity: true, defectiveQty: true } }),
    db.bookingEquipment.findMany({
      where: { loadedQty: { gt: 0 } },
      include: { booking: { select: { status: true, eventDate: true, equipmentCheckedInAt: true } } },
    }),
    db.bookingEquipment.count({ where: { reservedAt: null, booking: { status: { in: ["booked", "confirmed"] }, eventDate: { gte: new Date(`${today}T00:00:00Z`) } } } }),
  ]);
  const count = (status: string) => byStatus.find((s) => s.status === status)?._count._all ?? 0;
  let out = 0;
  let overdue = 0;
  let missing = 0;
  for (const l of outLines) {
    const n = outstandingOf(l);
    if (n <= 0) continue;
    const date = l.booking.eventDate?.toISOString().slice(0, 10) ?? null;
    if (l.booking.equipmentCheckedInAt) missing += n;
    else if (date !== null && date < today) overdue += n;
    else out += n;
  }
  return {
    assets: byStatus.filter((s) => s.status !== "retired").reduce((sum, s) => sum + s._count._all, 0),
    stockUnits: bulk._sum.quantity ?? 0,
    available: count("available"),
    maintenance: count("maintenance"),
    defective: count("defective") + (bulk._sum.defectiveQty ?? 0),
    lost: count("lost"),
    retired: count("retired"),
    out,
    overdue,
    missing,
    unreserved,
  };
}

/** Rows for the CSV export (the agency's own equipment, private fields included). */
export async function inventoryExportRows(organizationId: string) {
  const items = await tenantDb(organizationId).equipmentItem.findMany({
    orderBy: { code: "asc" },
    include: { category: { select: { name: true } }, container: { select: { code: true } } },
  });
  return items.map((i) => ({
    code: i.code,
    name: i.name,
    kind: i.kind,
    tracking: i.tracking,
    quantity: i.quantity,
    defective: i.defectiveQty,
    status: i.status,
    condition: i.condition,
    category: i.category?.name ?? "",
    container: i.container?.code ?? "",
    manufacturer: i.manufacturer ?? "",
    model: i.model ?? "",
    serialNumber: i.serialNumber ?? "",
    powerWatts: i.powerWatts ?? "",
    batteryPowered: i.batteryPowered ? "yes" : "no",
    shared: i.excludeFromSharing ? "no" : "yes",
    notes: i.notes ?? "",
  }));
}

/**
 * Removes all equipment records of agencies that are being deleted. MySQL
 * can't cascade through cases (an item in a case blocks deleting the case
 * mid-cascade), so this runs first, in dependency order.
 */
export async function purgeInventory(tx: Prisma.TransactionClient, organizationIds: readonly string[]) {
  if (organizationIds.length === 0) return;
  const where = { organizationId: { in: [...organizationIds] } };
  await tx.bookingEquipment.deleteMany({ where });
  await tx.equipmentEvent.deleteMany({ where });
  await tx.equipmentPackageLine.deleteMany({ where });
  await tx.equipmentPackage.deleteMany({ where });
  await tx.equipmentItem.updateMany({ where: { ...where, containerId: { not: null } }, data: { containerId: null } });
  await tx.equipmentItem.deleteMany({ where });
  await tx.equipmentCategory.deleteMany({ where });
}

// ─── Packages ───────────────────────────────────────────────────────────

export async function listPackages(organizationId: string) {
  return tenantDb(organizationId).equipmentPackage.findMany({
    orderBy: [{ position: "asc" }, { name: "asc" }],
    include: { _count: { select: { lines: true } } },
  });
}

export async function packageDetail(organizationId: string, packageId: string) {
  return tenantDb(organizationId).equipmentPackage.findFirst({
    where: { id: packageId },
    include: {
      lines: {
        orderBy: { position: "asc" },
        include: { item: { select: { id: true, code: true, name: true, kind: true, tracking: true, status: true } }, category: { select: { id: true, name: true } } },
      },
    },
  });
}

/**
 * Creates or replaces a package and its lines (in the given order). Lines may
 * only point at the agency's own items and categories; sets and retired items
 * aren't allowed as specific lines.
 */
export async function savePackage(organizationId: string, packageId: string | null, input: EquipmentPackageInput) {
  try {
    return await tenantDb(organizationId).$transaction(async (tx) => {
      const itemIds = input.lines.flatMap((l) => (l.itemId ? [l.itemId] : []));
      const categoryIds = input.lines.flatMap((l) => (l.categoryId ? [l.categoryId] : []));
      const [items, categories] = await Promise.all([
        tx.equipmentItem.findMany({ where: { id: { in: itemIds }, status: { not: "retired" }, kind: { not: "set" } }, select: { id: true } }),
        tx.equipmentCategory.findMany({ where: { id: { in: categoryIds } }, select: { id: true } }),
      ]);
      if (items.length !== new Set(itemIds).size || categories.length !== new Set(categoryIds).size) throw new InventoryError("not_found");

      let id = packageId;
      if (id) {
        const updated = await tx.equipmentPackage.updateMany({ where: { id }, data: { name: input.name, description: input.description } });
        if (updated.count === 0) throw new InventoryError("not_found");
        await tx.equipmentPackageLine.deleteMany({ where: { packageId: id } });
      } else {
        id = randomUUID();
        const last = await tx.equipmentPackage.findFirst({ orderBy: { position: "desc" }, select: { position: true } });
        await tx.equipmentPackage.create({ data: { id, name: input.name, description: input.description, position: (last?.position ?? -1) + 1, organizationId } });
      }
      if (input.lines.length) {
        await tx.equipmentPackageLine.createMany({
          data: input.lines.map((l, position) => ({ id: randomUUID(), packageId: id!, itemId: l.itemId, categoryId: l.categoryId, quantity: l.quantity, position, organizationId })),
        });
      }
      return id;
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new InventoryError("name_taken");
    throw error;
  }
}

export async function deletePackage(organizationId: string, packageId: string) {
  const deleted = await tenantDb(organizationId).equipmentPackage.deleteMany({ where: { id: packageId } });
  if (deleted.count === 0) throw new InventoryError("not_found");
}
