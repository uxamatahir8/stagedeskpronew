import { randomUUID } from "node:crypto";
import {
  availabilityOn,
  checkReserve,
  type ClaimLine,
  equipmentStage,
  equipmentTotals,
  isPackingStatus,
  isReservingStatus,
  loadableNow,
  loadError,
  lostError,
  outstandingOf,
  plannedQuantityError,
  powerTotal,
  resolvePackage,
  returnError,
  type Shortage,
  todayInNetherlands,
  usableStock,
} from "@stagedesk/core";
import { audit } from "./audit";
import { Prisma } from "./generated/prisma/client";
import { claimLinesOf, lockItems, logItemEvent, toClaimLine, type Tx } from "./inventory";
import { agencyDeskUserIds, notify } from "./notifications";
import { tenantDb } from "./tenant";

/**
 * Packing lists on bookings: planning, reserving, loading and returning
 * equipment. Every write locks the item rows it touches (lockItems) and runs
 * at READ COMMITTED, so after waiting for a lock it sees what the other
 * transaction committed; with the CHECK constraints this keeps stock from
 * being promised or loaded twice.
 *
 * Only booked and confirmed bookings reserve. Lines on inquiries and quotes
 * are plans with availability shown for information; accepting the quote
 * reserves what fits and flags the rest (it never blocks the acceptance).
 */

export const equipmentTx = { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 20_000 } as const;

export type EquipmentErrorCode =
  | "not_found"
  | "invalid_status"
  | "no_event_date"
  | "conflict"
  | "not_allowed"
  | "too_many"
  | "not_loaded"
  | "nothing_outstanding"
  | "negative"
  | "loaded"
  | "reschedule_conflict"
  | "not_reserved"
  | "not_overridable";

export interface EquipmentConflict {
  itemId: string;
  code: string;
  name: string;
  requested: number;
  free: number;
  shortage: Shortage | "no_date";
  overridable: boolean;
}

export class EquipmentError extends Error {
  constructor(
    readonly code: EquipmentErrorCode,
    readonly conflicts: EquipmentConflict[] = [],
  ) {
    super(`Equipment: ${code}`);
    this.name = "EquipmentError";
  }
}

/** Who is acting and whether they may override same-day conflicts (owners and admins: agency.inventory.admin). */
export interface EquipmentActor {
  id: string;
  canOverride?: boolean;
}

const dateOf = (b: { eventDate: Date | null }) => (b.eventDate ? b.eventDate.toISOString().slice(0, 10) : null);

const bookingSelect = { id: true, status: true, eventDate: true, trackingCode: true, equipmentCheckedInAt: true } as const;
type BookingRow = { id: string; status: string; eventDate: Date | null; trackingCode: string; equipmentCheckedInAt: Date | null };

async function loadBooking(tx: Tx, bookingId: string): Promise<BookingRow> {
  const booking = await tx.booking.findFirst({ where: { id: bookingId }, select: bookingSelect });
  if (!booking) throw new EquipmentError("not_found");
  return booking;
}

async function logBookingEvent(tx: Tx, bookingId: string, type: string, actorId: string | null, data?: Record<string, unknown>) {
  await tx.bookingEvent.create({ data: { bookingId, type, actorId, data: data ? (data as Prisma.InputJsonValue) : Prisma.JsonNull, organizationId: "" } });
}

const itemStock = { id: true, code: true, name: true, kind: true, tracking: true, status: true, quantity: true, defectiveQty: true, containerId: true } as const;

// ─── Planning ───────────────────────────────────────────────────────────

export interface NewLine {
  itemId: string;
  quantity: number;
  viaContainerId?: string | null;
}

/** A case brings itself and its contents; a set brings its members (it isn't a thing to pack). */
async function expand(tx: Tx, itemId: string, quantity: number): Promise<NewLine[]> {
  const item = await tx.equipmentItem.findFirst({ where: { id: itemId }, select: { id: true, kind: true, status: true } });
  if (!item || item.status === "retired") throw new EquipmentError("not_found");
  if (item.kind === "item") return [{ itemId, quantity }];
  const contents = await tx.equipmentItem.findMany({ where: { containerId: itemId, status: { not: "retired" } }, select: { id: true }, orderBy: { code: "asc" } });
  const members = contents.map((c) => ({ itemId: c.id, quantity: 1, viaContainerId: itemId }));
  return item.kind === "case" ? [{ itemId, quantity: 1, viaContainerId: itemId }, ...members] : members;
}

/**
 * Adds lines in one go: all fit or nothing changes. On a booked or confirmed
 * booking each line is reserved now; a same-day conflict needs an owner's or
 * admin's reason. On inquiries and quotes nothing is reserved and shortages
 * come back as warnings.
 */
async function addLines(tx: Tx, organizationId: string, booking: BookingRow, entries: NewLine[], actor: EquipmentActor, override: string | null, now: Date) {
  if (!isPackingStatus(booking.status)) throw new EquipmentError("invalid_status");
  const date = dateOf(booking);
  if (!date) throw new EquipmentError("no_event_date");
  const today = todayInNetherlands(now);
  const reserving = isReservingStatus(booking.status);

  // Merge repeats: counted stock adds up, a numbered item is planned once.
  const merged = new Map<string, NewLine>();
  for (const e of entries) {
    const prev = merged.get(e.itemId);
    merged.set(e.itemId, prev ? { ...prev, quantity: prev.quantity + e.quantity } : { ...e });
  }
  const ids = [...merged.keys()];
  await lockItems(tx, organizationId, ids);
  const [items, existing, claims] = await Promise.all([
    tx.equipmentItem.findMany({ where: { id: { in: ids } }, select: itemStock }),
    tx.bookingEquipment.findMany({ where: { bookingId: booking.id, itemId: { in: ids } } }),
    claimLinesOf(tx, ids),
  ]);
  if (items.length !== ids.length) throw new EquipmentError("not_found");

  const conflicts: EquipmentConflict[] = [];
  const warnings: EquipmentConflict[] = [];
  const writes: { item: (typeof items)[number]; quantity: number; line: (typeof existing)[number] | undefined; via: string | null; overridden: boolean }[] = [];
  for (const item of items) {
    const entry = merged.get(item.id)!;
    const line = existing.find((l) => l.itemId === item.id);
    if (item.kind === "set" || item.status === "retired") throw new EquipmentError("not_found");
    if (item.tracking === "unit" && line) continue;
    const quantity = item.tracking === "unit" ? 1 : (line?.quantity ?? 0) + entry.quantity;
    const check = checkReserve(item, availabilityOn(item, claims.get(item.id) ?? [], date, today, booking.id), quantity);
    let overridden = false;
    if (!check.ok) {
      const conflict = { itemId: item.id, code: item.code, name: item.name, requested: quantity, free: check.free, shortage: check.shortage, overridable: check.overridable };
      if (!reserving) warnings.push(conflict);
      else if (check.overridable && override && actor.canOverride) overridden = true;
      else conflicts.push(conflict);
    }
    writes.push({ item, quantity, line, via: entry.viaContainerId ?? null, overridden });
  }
  if (conflicts.length) throw new EquipmentError("conflict", conflicts);

  for (const w of writes) {
    const reservation = reserving
      ? { reservedAt: now, ...(w.overridden ? { overrideReason: override, overriddenById: actor.id } : {}) }
      : {};
    if (w.line) {
      // Only counted stock gets here (more of the same); an unreserved line stays unreserved until retried.
      await tx.bookingEquipment.updateMany({
        where: { id: w.line.id, quantity: w.line.quantity },
        data: { quantity: w.quantity, ...(w.line.reservedAt ? reservation : {}) },
      });
    } else {
      await tx.bookingEquipment.create({
        data: { id: randomUUID(), bookingId: booking.id, itemId: w.item.id, quantity: w.quantity, viaContainerId: w.via, organizationId, ...reservation },
      });
    }
    await logItemEvent(tx, w.item.id, "allocated", actor.id, { quantity: w.quantity }, booking.id);
  }
  const overrides = writes.filter((w) => w.overridden);
  if (writes.length) await logBookingEvent(tx, booking.id, "equipment_added", actor.id, { count: writes.length });
  if (overrides.length) {
    const codes = overrides.map((w) => w.item.code);
    await logBookingEvent(tx, booking.id, "equipment_override", actor.id, { codes: codes.join(", "), reason: override });
    await audit({ actorId: actor.id, action: "inventory.override", agencyId: organizationId, targetType: "booking", targetId: booking.id, data: { code: booking.trackingCode, items: codes, reason: override } });
  }
  return { added: writes.length, warnings };
}

/** Adds an item, a case with its contents, or a set's members. */
export async function addToPackingList(organizationId: string, bookingId: string, input: { itemId: string; quantity: number }, actor: EquipmentActor, override: string | null = null, now = new Date()) {
  return tenantDb(organizationId).$transaction(async (tx) => {
    const booking = await loadBooking(tx, bookingId);
    const entries = await expand(tx, input.itemId, Math.max(1, Math.floor(input.quantity)));
    if (entries.length === 0) throw new EquipmentError("not_found");
    return addLines(tx, organizationId, booking, entries, actor, override, now);
  }, equipmentTx);
}

/** What a package would add to this booking right now: picks per package line, with shortages. */
export async function previewPackage(organizationId: string, bookingId: string, packageId: string, now = new Date()) {
  const db = tenantDb(organizationId);
  const [booking, pkg] = await Promise.all([
    db.booking.findFirst({ where: { id: bookingId }, select: bookingSelect }),
    db.equipmentPackage.findFirst({ where: { id: packageId }, include: { lines: { orderBy: { position: "asc" }, include: { item: { select: { code: true, name: true } }, category: { select: { name: true } } } } } }),
  ]);
  if (!booking || !pkg) throw new EquipmentError("not_found");
  const date = dateOf(booking);
  if (!date) throw new EquipmentError("no_event_date");
  const today = todayInNetherlands(now);
  const categoryIds = pkg.lines.flatMap((l) => (l.categoryId ? [l.categoryId] : []));
  const itemIds = pkg.lines.flatMap((l) => (l.itemId ? [l.itemId] : []));
  const items = await db.equipmentItem.findMany({
    where: { status: { not: "retired" }, OR: [{ id: { in: itemIds } }, { categoryId: { in: categoryIds } }] },
    select: { ...itemStock, categoryId: true },
  });
  const [claims, planned] = await Promise.all([
    claimLinesOf(db, items.map((i) => i.id)),
    db.bookingEquipment.findMany({ where: { bookingId }, select: { itemId: true } }),
  ]);
  const candidates = items.map((i) => ({ ...i, free: availabilityOn(i, claims.get(i.id) ?? [], date, today, bookingId).free }));
  const picks = resolvePackage(pkg.lines, candidates, new Set(planned.map((p) => p.itemId)));
  const byId = new Map(items.map((i) => [i.id, i]));
  return {
    package: { id: pkg.id, name: pkg.name },
    reserving: isReservingStatus(booking.status),
    lines: pkg.lines.map((l, index) => ({
      index,
      label: l.item ? `${l.item.code} · ${l.item.name}` : (l.category?.name ?? ""),
      quantity: l.quantity,
      picks: picks
        .filter((p) => p.lineIndex === index)
        .map((p) => ({ ...p, code: p.itemId ? (byId.get(p.itemId)?.code ?? null) : null, name: p.itemId ? (byId.get(p.itemId)?.name ?? null) : null })),
    })),
  };
}

/**
 * Applies the picks the user confirmed from the preview. They are checked
 * again under lock; if stock changed meanwhile nothing is added and the
 * conflicts come back so the preview can be refreshed.
 */
export async function applyPackage(organizationId: string, bookingId: string, packageId: string, picks: readonly NewLine[], actor: EquipmentActor, override: string | null = null, now = new Date()) {
  return tenantDb(organizationId).$transaction(async (tx) => {
    const booking = await loadBooking(tx, bookingId);
    const pkg = await tx.equipmentPackage.findFirst({ where: { id: packageId }, select: { name: true } });
    if (!pkg) throw new EquipmentError("not_found");
    if (picks.length === 0) return { added: 0, warnings: [] };
    // A case in a package brings its contents, as when it's added by hand.
    const entries: NewLine[] = [];
    for (const p of picks) entries.push(...(await expand(tx, p.itemId, p.quantity)));
    const result = await addLines(tx, organizationId, booking, entries, actor, override, now);
    await logBookingEvent(tx, booking.id, "package_applied", actor.id, { name: pkg.name, count: result.added });
    return result;
  }, equipmentTx);
}

/** Changes how many units of counted stock are planned (never below what's loaded). */
export async function setLineQuantity(organizationId: string, lineId: string, quantity: number, actor: EquipmentActor, override: string | null = null, now = new Date()) {
  return tenantDb(organizationId).$transaction(async (tx) => {
    const line = await tx.bookingEquipment.findFirst({ where: { id: lineId }, select: { itemId: true, bookingId: true } });
    if (!line) throw new EquipmentError("not_found");
    await lockItems(tx, organizationId, [line.itemId]);
    const booking = await loadBooking(tx, line.bookingId);
    if (!isPackingStatus(booking.status)) throw new EquipmentError("invalid_status");
    const current = await tx.bookingEquipment.findFirst({ where: { id: lineId } });
    const item = await tx.equipmentItem.findFirst({ where: { id: line.itemId }, select: itemStock });
    if (!current || !item) throw new EquipmentError("not_found");
    if (item.tracking === "unit" && quantity !== 1) throw new EquipmentError("too_many");
    const error = plannedQuantityError(current, quantity);
    if (error) throw new EquipmentError(error);
    if (quantity === current.quantity) return;

    let overridden = false;
    const date = dateOf(booking);
    if (quantity > current.quantity && current.reservedAt && date) {
      const claims = (await claimLinesOf(tx, [item.id])).get(item.id) ?? [];
      const check = checkReserve(item, availabilityOn(item, claims, date, todayInNetherlands(now), booking.id), quantity);
      if (!check.ok) {
        const conflict = { itemId: item.id, code: item.code, name: item.name, requested: quantity, free: check.free, shortage: check.shortage, overridable: check.overridable };
        if (!(check.overridable && override && actor.canOverride)) throw new EquipmentError("conflict", [conflict]);
        overridden = true;
      }
    }
    await tx.bookingEquipment.updateMany({
      where: { id: lineId, quantity: current.quantity, loadedQty: current.loadedQty },
      data: { quantity, ...(overridden ? { overrideReason: override, overriddenById: actor.id } : {}) },
    });
    await logItemEvent(tx, item.id, "allocated", actor.id, { quantity, from: current.quantity }, booking.id);
    if (overridden) {
      await logBookingEvent(tx, booking.id, "equipment_override", actor.id, { codes: item.code, reason: override });
      await audit({ actorId: actor.id, action: "inventory.override", agencyId: organizationId, targetType: "booking", targetId: booking.id, data: { code: booking.trackingCode, items: [item.code], reason: override } });
    }
  }, equipmentTx);
}

/**
 * Takes a line off the packing list while nothing on it is loaded. Removing a
 * case also removes the unloaded contents that came with it.
 */
export async function removeLine(organizationId: string, lineId: string, actor: EquipmentActor) {
  return tenantDb(organizationId).$transaction(async (tx) => {
    const line = await tx.bookingEquipment.findFirst({ where: { id: lineId }, include: { item: { select: { kind: true } } } });
    if (!line) throw new EquipmentError("not_found");
    const booking = await loadBooking(tx, line.bookingId);
    if (!isPackingStatus(booking.status)) throw new EquipmentError("invalid_status");
    const group =
      line.item.kind === "case"
        ? await tx.bookingEquipment.findMany({ where: { bookingId: line.bookingId, viaContainerId: line.itemId, id: { not: line.id } } })
        : [];
    await lockItems(tx, organizationId, [line.itemId, ...group.map((g) => g.itemId)]);
    const removable = [line, ...group.filter((g) => g.loadedQty === 0)];
    const deleted = await tx.bookingEquipment.deleteMany({ where: { id: { in: removable.map((r) => r.id) }, loadedQty: 0 } });
    if (deleted.count === 0) throw new EquipmentError("loaded");
    for (const r of removable) await logItemEvent(tx, r.itemId, "unallocated", actor.id, null, line.bookingId);
    await logBookingEvent(tx, line.bookingId, "equipment_removed", actor.id, { count: deleted.count });
  }, equipmentTx);
}

// ─── Reservations ───────────────────────────────────────────────────────

/** Tries to reserve every unreserved line of a booked or confirmed booking; returns what didn't fit. */
async function reserveOpenLines(tx: Tx, organizationId: string, booking: BookingRow, now: Date) {
  const lines = await tx.bookingEquipment.findMany({ where: { bookingId: booking.id, reservedAt: null }, orderBy: { createdAt: "asc" } });
  if (lines.length === 0) return { reserved: 0, failed: [] as EquipmentConflict[] };
  const ids = lines.map((l) => l.itemId);
  await lockItems(tx, organizationId, ids);
  const [items, claims] = await Promise.all([tx.equipmentItem.findMany({ where: { id: { in: ids } }, select: itemStock }), claimLinesOf(tx, ids)]);
  const date = dateOf(booking);
  const today = todayInNetherlands(now);
  const failed: EquipmentConflict[] = [];
  let reserved = 0;
  for (const line of lines) {
    const item = items.find((i) => i.id === line.itemId)!;
    if (!date) {
      failed.push({ itemId: item.id, code: item.code, name: item.name, requested: line.quantity, free: 0, shortage: "no_date", overridable: false });
      continue;
    }
    const check = checkReserve(item, availabilityOn(item, claims.get(item.id) ?? [], date, today, booking.id), line.quantity);
    if (check.ok) {
      await tx.bookingEquipment.updateMany({ where: { id: line.id, reservedAt: null }, data: { reservedAt: now } });
      reserved++;
    } else {
      failed.push({ itemId: item.id, code: item.code, name: item.name, requested: line.quantity, free: check.free, shortage: check.shortage, overridable: check.overridable });
    }
  }
  return { reserved, failed };
}

/**
 * Called by applyTransition inside the booking's own transaction. Entering
 * booked or confirmed reserves what fits; the rest stays unreserved and is
 * flagged. It never throws for a shortage, so accepting a quote can't fail
 * because of equipment. Leaving those statuses needs no writes: reservations
 * only count while the booking is booked or confirmed, and loaded equipment
 * counts as out whatever the status.
 */
export async function equipmentAfterTransition(tx: Tx, organizationId: string, bookingId: string, from: string, to: string, now: Date) {
  if (!isReservingStatus(to) || isReservingStatus(from)) return;
  const booking = await loadBooking(tx, bookingId);
  if ((await tx.bookingEquipment.count({ where: { bookingId } })) === 0) return;
  const result = await reserveOpenLines(tx, organizationId, booking, now);
  await logBookingEvent(tx, bookingId, "equipment_reserved", null, { reserved: result.reserved, failed: result.failed.length });
}

/** After a quote is accepted: tells the desk when equipment couldn't be reserved. */
export async function notifyUnreservedEquipment(organizationId: string, bookingId: string, exceptUserId: string | null) {
  const db = tenantDb(organizationId);
  const booking = await db.booking.findFirst({ where: { id: bookingId }, select: { trackingCode: true, status: true } });
  if (!booking || !isReservingStatus(booking.status)) return;
  const count = await db.bookingEquipment.count({ where: { bookingId, reservedAt: null } });
  if (count === 0) return;
  await notify(
    await agencyDeskUserIds(organizationId),
    { type: "equipment_unreserved", data: { code: booking.trackingCode, count }, url: `/app/bookings/${booking.trackingCode}/equipment` },
    exceptUserId,
  );
}

/** Tries the unreserved lines again (after equipment came back, was repaired, or plans changed). */
export async function retryReservations(organizationId: string, bookingId: string, actor: EquipmentActor, now = new Date()) {
  return tenantDb(organizationId).$transaction(async (tx) => {
    const booking = await loadBooking(tx, bookingId);
    if (!isReservingStatus(booking.status)) throw new EquipmentError("invalid_status");
    const result = await reserveOpenLines(tx, organizationId, booking, now);
    if (result.reserved > 0 || result.failed.length > 0) await logBookingEvent(tx, bookingId, "equipment_reserved", actor.id, { reserved: result.reserved, failed: result.failed.length });
    return result;
  }, equipmentTx);
}

/**
 * Reserves an unreserved line despite another booking's same-day reservation,
 * with a reason (owners and admins). Never for equipment that's unusable or
 * physically unavailable.
 */
export async function overrideLine(organizationId: string, lineId: string, reason: string, actor: EquipmentActor, now = new Date()) {
  if (!actor.canOverride) throw new EquipmentError("not_allowed");
  const trimmed = reason.trim().slice(0, 191);
  if (!trimmed) throw new EquipmentError("not_overridable");
  return tenantDb(organizationId).$transaction(async (tx) => {
    const line = await tx.bookingEquipment.findFirst({ where: { id: lineId } });
    if (!line) throw new EquipmentError("not_found");
    await lockItems(tx, organizationId, [line.itemId]);
    const booking = await loadBooking(tx, line.bookingId);
    if (!isReservingStatus(booking.status)) throw new EquipmentError("invalid_status");
    const fresh = await tx.bookingEquipment.findFirst({ where: { id: lineId } });
    if (!fresh || fresh.reservedAt) throw new EquipmentError("not_overridable");
    const date = dateOf(booking);
    if (!date) throw new EquipmentError("no_event_date");
    const item = (await tx.equipmentItem.findFirst({ where: { id: line.itemId }, select: itemStock }))!;
    const claims = (await claimLinesOf(tx, [item.id])).get(item.id) ?? [];
    const check = checkReserve(item, availabilityOn(item, claims, date, todayInNetherlands(now), booking.id), fresh.quantity);
    if (!check.ok && !check.overridable) throw new EquipmentError("not_overridable");
    await tx.bookingEquipment.updateMany({ where: { id: lineId, reservedAt: null }, data: { reservedAt: now, overrideReason: check.ok ? null : trimmed, overriddenById: check.ok ? null : actor.id } });
    if (!check.ok) {
      await logBookingEvent(tx, booking.id, "equipment_override", actor.id, { codes: item.code, reason: trimmed });
      await audit({ actorId: actor.id, action: "inventory.override", agencyId: organizationId, targetType: "booking", targetId: booking.id, data: { code: booking.trackingCode, items: [item.code], reason: trimmed } });
    }
  }, equipmentTx);
}

/**
 * Before a booked or confirmed booking moves to another date: every reserved
 * line must still fit on the new date, or the change is refused with the
 * conflicts. Runs inside the caller's transaction.
 */
export async function checkEquipmentReschedule(tx: Tx, organizationId: string, bookingId: string, newDate: string | null, now = new Date()) {
  const booking = await loadBooking(tx, bookingId);
  if (!isReservingStatus(booking.status) || dateOf(booking) === newDate) return;
  const lines = await tx.bookingEquipment.findMany({ where: { bookingId, reservedAt: { not: null } } });
  if (lines.length === 0) return;
  const ids = lines.map((l) => l.itemId);
  await lockItems(tx, organizationId, ids);
  const [items, claims] = await Promise.all([tx.equipmentItem.findMany({ where: { id: { in: ids } }, select: itemStock }), claimLinesOf(tx, ids)]);
  const conflicts: EquipmentConflict[] = [];
  for (const line of lines) {
    const item = items.find((i) => i.id === line.itemId)!;
    if (!newDate) {
      conflicts.push({ itemId: item.id, code: item.code, name: item.name, requested: line.quantity, free: 0, shortage: "no_date", overridable: false });
      continue;
    }
    const check = checkReserve(item, availabilityOn(item, claims.get(item.id) ?? [], newDate, todayInNetherlands(now), bookingId), line.quantity);
    if (!check.ok && !line.overrideReason) {
      conflicts.push({ itemId: item.id, code: item.code, name: item.name, requested: line.quantity, free: check.free, shortage: check.shortage, overridable: check.overridable });
    }
  }
  if (conflicts.length) throw new EquipmentError("reschedule_conflict", conflicts);
}

// ─── Loading ────────────────────────────────────────────────────────────

async function lineContext(tx: Tx, organizationId: string, lineIds: readonly string[]) {
  const lines = await tx.bookingEquipment.findMany({ where: { id: { in: [...lineIds] } }, select: { itemId: true } });
  if (lines.length !== new Set(lineIds).size) throw new EquipmentError("not_found");
  await lockItems(tx, organizationId, lines.map((l) => l.itemId));
}

/** Loads (positive) or unloads (negative, only units not yet resolved) units on one line. */
export async function loadLine(organizationId: string, lineId: string, delta: number, actorId: string, now = new Date()) {
  return tenantDb(organizationId).$transaction(async (tx) => {
    await lineContext(tx, organizationId, [lineId]);
    const loaded = await loadLinesTx(tx, organizationId, [{ lineId, delta }], actorId, now, true);
    return loaded;
  }, equipmentTx);
}

async function loadLinesTx(tx: Tx, organizationId: string, changes: { lineId: string; delta: number }[], actorId: string, now: Date, strict: boolean) {
  const lines = await tx.bookingEquipment.findMany({
    where: { id: { in: changes.map((c) => c.lineId) } },
    include: { booking: { select: bookingSelect } },
  });
  const ids = lines.map((l) => l.itemId);
  const [items, claims] = await Promise.all([tx.equipmentItem.findMany({ where: { id: { in: ids } }, select: itemStock }), claimLinesOf(tx, ids)]);
  const today = todayInNetherlands(now);
  let total = 0;
  const skipped: string[] = [];
  for (const change of changes) {
    const line = lines.find((l) => l.id === change.lineId)!;
    const item = items.find((i) => i.id === line.itemId)!;
    const own = toClaimLine(line);
    let delta = change.delta;
    if (delta > 0) {
      if (!isReservingStatus(line.booking.status)) {
        if (strict) throw new EquipmentError("invalid_status");
        skipped.push(item.code);
        continue;
      }
      if (!line.reservedAt) {
        if (strict) throw new EquipmentError("not_reserved");
        skipped.push(item.code);
        continue;
      }
      const date = dateOf(line.booking)!;
      const can = loadableNow(item, own, (claims.get(item.id) ?? []).filter((l) => l.id !== line.id), date, today);
      if (can < delta) {
        if (strict) {
          throw new EquipmentError("conflict", [
            { itemId: item.id, code: item.code, name: item.name, requested: delta, free: can, shortage: usableStock(item) === 0 ? "unusable" : "unavailable", overridable: false },
          ]);
        }
        if (can <= 0) {
          skipped.push(item.code);
          continue;
        }
        delta = can;
      }
    }
    const error = loadError(line, delta);
    if (error) throw new EquipmentError(error);
    if (delta === 0) continue;
    const updated = await tx.bookingEquipment.updateMany({ where: { id: line.id, loadedQty: line.loadedQty }, data: { loadedQty: line.loadedQty + delta } });
    if (updated.count === 0) throw new EquipmentError("conflict");
    await logItemEvent(tx, item.id, delta > 0 ? "loaded" : "unloaded", actorId, { quantity: Math.abs(delta) }, line.bookingId);
    total += delta;
  }
  if (lines[0] && total > 0) await maybeLogMilestone(tx, lines[0].bookingId, actorId, "loaded");
  return { loaded: total, skipped };
}

/** Loads everything of a case or set on this booking that can be loaded; reports what was skipped. */
export async function loadGroup(organizationId: string, bookingId: string, containerId: string, actorId: string, now = new Date()) {
  return tenantDb(organizationId).$transaction(async (tx) => {
    const group = await tx.bookingEquipment.findMany({ where: { bookingId, OR: [{ itemId: containerId }, { viaContainerId: containerId }] } });
    if (group.length === 0) throw new EquipmentError("not_found");
    await lineContext(tx, organizationId, group.map((g) => g.id));
    const fresh = await tx.bookingEquipment.findMany({ where: { id: { in: group.map((g) => g.id) } } });
    const changes = fresh.filter((l) => l.loadedQty < l.quantity).map((l) => ({ lineId: l.id, delta: l.quantity - l.loadedQty }));
    if (changes.length === 0) return { loaded: 0, skipped: [] };
    return loadLinesTx(tx, organizationId, changes, actorId, now, false);
  }, equipmentTx);
}

/** One timeline entry when everything planned is loaded, and when everything loaded is resolved. */
async function maybeLogMilestone(tx: Tx, bookingId: string, actorId: string | null, kind: "loaded" | "returned") {
  const lines = await tx.bookingEquipment.findMany({ where: { bookingId } });
  const t = equipmentTotals(lines);
  const reached = kind === "loaded" ? t.loaded === t.planned && t.planned > 0 : t.loaded > 0 && t.outstanding === 0;
  if (!reached) return;
  const type = kind === "loaded" ? "equipment_loaded" : "equipment_returned";
  const last = await tx.bookingEvent.findFirst({ where: { bookingId, type: { startsWith: "equipment_" } }, orderBy: { id: "desc" }, select: { type: true } });
  if (last?.type === type) return;
  await logBookingEvent(tx, bookingId, type, actorId, kind === "returned" ? { returned: t.returned, damaged: t.damaged, lost: t.lost } : { count: t.loaded });
}

// ─── Returning ──────────────────────────────────────────────────────────

/**
 * Records units back fine and back damaged on one line. Damaged numbered
 * items become defective; damaged counted stock moves to the defective count.
 * Works on any booking status (equipment from a cancelled gig still comes back).
 */
export async function returnLine(organizationId: string, lineId: string, input: { ok: number; damaged: number; note?: string | null }, actorId: string) {
  const result = await tenantDb(organizationId).$transaction(async (tx) => {
    await lineContext(tx, organizationId, [lineId]);
    return returnLinesTx(tx, organizationId, [{ lineId, ...input }], actorId);
  }, equipmentTx);
  await notifyDamage(organizationId, result, actorId);
  return result;
}

/** Tells the desk (except whoever recorded it) that equipment came back damaged. */
async function notifyDamage(organizationId: string, result: { damaged: number; bookingId?: string }, actorId: string) {
  if (result.damaged === 0 || !result.bookingId) return;
  const booking = await tenantDb(organizationId).booking.findFirst({ where: { id: result.bookingId }, select: { trackingCode: true } });
  if (!booking) return;
  await notify(await agencyDeskUserIds(organizationId), { type: "equipment_damaged", data: { code: booking.trackingCode, count: result.damaged }, url: `/app/bookings/${booking.trackingCode}/equipment` }, actorId);
}

async function returnLinesTx(tx: Tx, organizationId: string, entries: { lineId: string; ok: number; damaged: number; note?: string | null }[], actorId: string) {
  const lines = await tx.bookingEquipment.findMany({ where: { id: { in: entries.map((e) => e.lineId) } }, include: { item: { select: itemStock } } });
  let damagedTotal = 0;
  for (const entry of entries) {
    const line = lines.find((l) => l.id === entry.lineId)!;
    const error = returnError(line, entry.ok, entry.damaged);
    if (error) throw new EquipmentError(error);
    if (entry.ok + entry.damaged === 0) continue;
    const updated = await tx.bookingEquipment.updateMany({
      where: { id: line.id, returnedQty: line.returnedQty, damagedQty: line.damagedQty, lostQty: line.lostQty },
      data: { returnedQty: line.returnedQty + entry.ok, damagedQty: line.damagedQty + entry.damaged },
    });
    if (updated.count === 0) throw new EquipmentError("conflict");
    const note = entry.note?.trim().slice(0, 500) || null;
    if (entry.ok > 0) await logItemEvent(tx, line.itemId, "returned", actorId, { quantity: entry.ok }, line.bookingId);
    if (entry.damaged > 0) {
      damagedTotal += entry.damaged;
      if (line.item.tracking === "unit") {
        await tx.equipmentItem.updateMany({ where: { id: line.itemId, status: { notIn: ["retired", "lost"] } }, data: { status: "defective" } });
      } else {
        await tx.equipmentItem.updateMany({ where: { id: line.itemId }, data: { defectiveQty: { increment: entry.damaged } } });
      }
      await logItemEvent(tx, line.itemId, "damaged", actorId, { quantity: entry.damaged, ...(note ? { note } : {}) }, line.bookingId);
    }
  }
  const bookingId = lines[0]?.bookingId;
  if (bookingId) await maybeLogMilestone(tx, bookingId, actorId, "returned");
  return { damaged: damagedTotal, bookingId };
}

/**
 * Checks a case or set back in. Only the lines the user confirmed present are
 * returned (fine or damaged); the rest stay outstanding. Lines already
 * resolved are left alone, so nothing missing or damaged is marked returned.
 */
export async function returnGroup(
  organizationId: string,
  bookingId: string,
  containerId: string,
  input: { present: readonly string[]; damaged: readonly string[]; note?: string | null },
  actorId: string,
) {
  const result = await tenantDb(organizationId).$transaction(async (tx) => {
    const group = await tx.bookingEquipment.findMany({ where: { bookingId, OR: [{ itemId: containerId }, { viaContainerId: containerId }] } });
    const ids = new Set(group.map((g) => g.id));
    const chosen = [...new Set([...input.present, ...input.damaged])];
    if (chosen.some((id) => !ids.has(id))) throw new EquipmentError("not_found");
    if (chosen.length === 0) return { damaged: 0, bookingId };
    await lineContext(tx, organizationId, chosen);
    const fresh = await tx.bookingEquipment.findMany({ where: { id: { in: chosen } } });
    const damaged = new Set(input.damaged);
    const entries = fresh
      .filter((l) => outstandingOf(l) > 0)
      .map((l) => (damaged.has(l.id) ? { lineId: l.id, ok: 0, damaged: outstandingOf(l), note: input.note } : { lineId: l.id, ok: outstandingOf(l), damaged: 0 }));
    return returnLinesTx(tx, organizationId, entries, actorId);
  }, equipmentTx);
  await notifyDamage(organizationId, result, actorId);
  return result;
}

/**
 * The agency finished checking equipment back in. Changes no counts: anything
 * still out is now shown as missing (and stays unavailable) until it's
 * returned late or an owner or admin confirms it lost.
 */
export async function finishCheckIn(organizationId: string, bookingId: string, actorId: string, now = new Date()) {
  const result = await tenantDb(organizationId).$transaction(async (tx) => {
    const booking = await loadBooking(tx, bookingId);
    const lines = await tx.bookingEquipment.findMany({ where: { bookingId }, include: { item: { select: { code: true } } } });
    const t = equipmentTotals(lines);
    if (t.loaded === 0) throw new EquipmentError("not_loaded");
    await tx.booking.updateMany({ where: { id: bookingId }, data: { equipmentCheckedInAt: now } });
    const missing = lines.filter((l) => outstandingOf(l) > 0).map((l) => `${l.item.code}${outstandingOf(l) > 1 ? ` ×${outstandingOf(l)}` : ""}`);
    await logBookingEvent(tx, bookingId, "equipment_checked_in", actorId, { missing: t.outstanding, codes: missing.join(", ") });
    return { missing: t.outstanding, code: booking.trackingCode };
  }, equipmentTx);
  if (result.missing > 0) {
    await notify(await agencyDeskUserIds(organizationId), { type: "equipment_missing", data: { code: result.code, count: result.missing }, url: `/app/bookings/${result.code}/equipment` }, actorId);
  }
  return result;
}

/**
 * Confirms outstanding units lost (owners and admins). Numbered items become
 * lost; counted stock shrinks. The line keeps the count as history. Audited.
 */
export async function confirmLost(organizationId: string, lineId: string, quantity: number, actor: EquipmentActor, note: string | null) {
  if (!actor.canOverride) throw new EquipmentError("not_allowed");
  return tenantDb(organizationId).$transaction(async (tx) => {
    await lineContext(tx, organizationId, [lineId]);
    const line = await tx.bookingEquipment.findFirst({ where: { id: lineId }, include: { item: { select: itemStock }, booking: { select: bookingSelect } } });
    if (!line) throw new EquipmentError("not_found");
    const n = line.item.tracking === "unit" ? 1 : Math.floor(quantity);
    const error = lostError(line, n);
    if (error) throw new EquipmentError(error);
    const updated = await tx.bookingEquipment.updateMany({ where: { id: lineId, lostQty: line.lostQty, returnedQty: line.returnedQty, damagedQty: line.damagedQty }, data: { lostQty: line.lostQty + n } });
    if (updated.count === 0) throw new EquipmentError("conflict");
    if (line.item.tracking === "unit") {
      await tx.equipmentItem.updateMany({ where: { id: line.itemId }, data: { status: "lost" } });
    } else {
      await tx.equipmentItem.updateMany({ where: { id: line.itemId }, data: { quantity: { decrement: n } } });
    }
    const clean = note?.trim().slice(0, 500) || null;
    await logItemEvent(tx, line.itemId, "lost", actor.id, { quantity: n, ...(clean ? { note: clean } : {}) }, line.bookingId);
    await logBookingEvent(tx, line.bookingId, "equipment_lost", actor.id, { codes: line.item.code, count: n });
    await audit({ actorId: actor.id, action: "inventory.lost", agencyId: organizationId, targetType: "equipment", targetId: line.itemId, data: { code: line.item.code, quantity: n, booking: line.booking.trackingCode } });
    await maybeLogMilestone(tx, line.bookingId, actor.id, "returned");
  }, equipmentTx);
}

// ─── Reading ────────────────────────────────────────────────────────────

/** A booking's packing list with counts, availability and stage, for the equipment pages. */
export async function bookingEquipment(organizationId: string, bookingId: string, now = new Date()) {
  const db = tenantDb(organizationId);
  const booking = await db.booking.findFirst({ where: { id: bookingId }, select: { ...bookingSelect, startTime: true, endTime: true, venueName: true, venueCity: true, eventType: true } });
  if (!booking) return null;
  const lines = await db.bookingEquipment.findMany({
    where: { bookingId },
    orderBy: { createdAt: "asc" },
    include: { item: { select: { ...itemStock, powerWatts: true, batteryPowered: true, category: { select: { id: true, name: true, position: true } } } } },
  });
  const ids = lines.map((l) => l.itemId);
  const via = [...new Set(lines.flatMap((l) => (l.viaContainerId ? [l.viaContainerId] : [])))];
  const [claims, containers] = await Promise.all([
    claimLinesOf(db, ids),
    via.length ? db.equipmentItem.findMany({ where: { id: { in: via } }, select: { id: true, code: true, name: true, kind: true } }) : Promise.resolve([]),
  ]);
  const today = todayInNetherlands(now);
  const date = dateOf(booking);
  const view = lines.map((line) => {
    const others = (claims.get(line.itemId) ?? []).filter((l) => l.id !== line.id);
    const own = toClaimLine({ ...line, booking });
    const availability = date ? availabilityOn(line.item, others, date, today, booking.id) : null;
    const loadable = date ? loadableNow(line.item, own, others, date, today) : 0;
    return {
      ...line,
      outstanding: outstandingOf(line),
      free: availability?.free ?? null,
      // Reserved, but not all of the rest can be loaded right now (still out elsewhere, defective…).
      atRisk: line.reservedAt !== null && isReservingStatus(booking.status) && loadable < line.quantity - line.loadedQty,
      loadable,
    };
  });
  const totals = equipmentTotals(lines);
  return {
    booking,
    date,
    reserving: isReservingStatus(booking.status),
    editable: isPackingStatus(booking.status),
    lines: view,
    containers,
    totals,
    stage: equipmentStage({ totals, eventDate: date, today, checkedIn: booking.equipmentCheckedInAt !== null }),
    power: powerTotal(lines),
  };
}

/** Totals and stage for the equipment card on the booking page. */
export async function bookingEquipmentSummary(organizationId: string, bookingId: string, now = new Date()) {
  const db = tenantDb(organizationId);
  const [booking, lines] = await Promise.all([
    db.booking.findFirst({ where: { id: bookingId }, select: { eventDate: true, equipmentCheckedInAt: true } }),
    db.bookingEquipment.findMany({ where: { bookingId } }),
  ]);
  if (!booking) return null;
  const totals = equipmentTotals(lines);
  return { totals, stage: equipmentStage({ totals, eventDate: dateOf(booking), today: todayInNetherlands(now), checkedIn: booking.equipmentCheckedInAt !== null }) };
}

export type BookingEquipmentView = NonNullable<Awaited<ReturnType<typeof bookingEquipment>>>;
export type { ClaimLine };
