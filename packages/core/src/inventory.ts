import { z } from "zod";

/**
 * Equipment inventory rules: what an item is, how much of it can be planned,
 * loaded or reserved, and where a booking's packing list stands. No database
 * code here; packages/db applies these inside locked transactions.
 *
 * Counts on a packing-list line:
 *   quantity (planned) ≥ loadedQty ≥ returnedQty + damagedQty + lostQty
 *   outstanding = loadedQty − returnedQty − damagedQty − lostQty  (out, or missing once checked in)
 *
 * A line's claim on stock is the larger of what it reserves on a date and what
 * is physically out, never the sum, so reserved-and-loaded units count once.
 */

export const equipmentKinds = ["item", "case", "set"] as const;
export type EquipmentKind = (typeof equipmentKinds)[number];

export const equipmentTrackings = ["unit", "bulk"] as const;
export type EquipmentTracking = (typeof equipmentTrackings)[number];

export const equipmentStatuses = ["available", "maintenance", "defective", "lost", "retired"] as const;
export type EquipmentStatus = (typeof equipmentStatuses)[number];

export const equipmentConditions = ["good", "fair", "poor"] as const;
export type EquipmentCondition = (typeof equipmentConditions)[number];

/** Booking statuses whose packing lists hold stock on the event date. */
export const reservingStatuses = ["booked", "confirmed"] as const;
/** Booking statuses whose packing list can still be changed. */
export const packingStatuses = ["inquiry", "quoted", "booked", "confirmed"] as const;

export const isReservingStatus = (status: string) => (reservingStatuses as readonly string[]).includes(status);
export const isPackingStatus = (status: string) => (packingStatuses as readonly string[]).includes(status);

// ─── Codes and item input ───────────────────────────────────────────────

/** "spk 12" → "SPK 12": trimmed, upper case, single spaces. */
export function normalizeEquipmentCode(code: string): string {
  return code.trim().replace(/\s+/g, " ").toUpperCase();
}

export const equipmentCodePattern = /^[A-Z0-9][A-Z0-9 ._\-/#]{0,31}$/;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional()
    .transform((v) => v ?? null);

export const equipmentSpecsSchema = z
  .array(z.object({ label: z.string().trim().min(1).max(60), value: z.string().trim().min(1).max(160) }))
  .max(30);
export type EquipmentSpecs = z.infer<typeof equipmentSpecsSchema>;

/** Reads stored specs, dropping anything malformed. */
export function parseEquipmentSpecs(value: unknown): EquipmentSpecs {
  const parsed = equipmentSpecsSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}

export const equipmentItemSchema = z
  .object({
    code: z
      .string()
      .transform(normalizeEquipmentCode)
      .pipe(z.string().regex(equipmentCodePattern, "code")),
    name: z.string().trim().min(1).max(191),
    kind: z.enum(equipmentKinds).default("item"),
    tracking: z.enum(equipmentTrackings).default("unit"),
    quantity: z.coerce.number().int().min(1).max(100_000).default(1),
    condition: z.enum(equipmentConditions).default("good"),
    categoryId: optionalText(64),
    containerId: optionalText(64),
    manufacturer: optionalText(96),
    model: optionalText(96),
    serialNumber: optionalText(96),
    powerWatts: z.coerce.number().int().min(0).max(100_000).nullable().optional().transform((v) => v ?? null),
    batteryPowered: z.boolean().default(false),
    specs: equipmentSpecsSchema.default([]),
    notes: optionalText(5000),
    excludeFromSharing: z.boolean().default(false),
  })
  .transform((item) => {
    // Cases and sets are single things; only plain items can be counted stock.
    if (item.kind !== "item") return { ...item, tracking: "unit" as const, quantity: 1, containerId: null };
    if (item.tracking === "unit") return { ...item, quantity: 1 };
    // Counted stock can't sit in a case or set (cases hold numbered items).
    return { ...item, containerId: null, serialNumber: null };
  })
  .transform((item) => (item.kind === "set" ? { ...item, powerWatts: null, batteryPowered: false, serialNumber: null } : item));
export type EquipmentItemInput = z.infer<typeof equipmentItemSchema>;

export const equipmentCategorySchema = z.object({ name: z.string().trim().min(1).max(96) });

// ─── Cases and sets ─────────────────────────────────────────────────────

export type MembershipError = "self" | "container_kind" | "nested" | "not_unit_item";

/**
 * Whether an item may go into a case or set: plain numbered items only, one
 * level deep (a container can't be inside another), never into itself.
 */
export function membershipError(
  child: { id?: string | null; kind: string; tracking: string; contentCount?: number },
  container: { id: string; kind: string; containerId: string | null },
): MembershipError | null {
  if (child.id && child.id === container.id) return "self";
  if (container.kind !== "case" && container.kind !== "set") return "container_kind";
  if (container.containerId) return "nested";
  if (child.kind !== "item" || child.tracking !== "unit") return "not_unit_item";
  return null;
}

// ─── Stock and availability ─────────────────────────────────────────────

export interface LineCounts {
  quantity: number;
  loadedQty: number;
  returnedQty: number;
  damagedQty: number;
  lostQty: number;
}

/** Loaded and not yet back, damaged or confirmed lost. */
export const outstandingOf = (l: LineCounts) => l.loadedQty - l.returnedQty - l.damagedQty - l.lostQty;
/** Planned but never loaded. */
export const notTakenOf = (l: LineCounts) => l.quantity - l.loadedQty;

/** A packing-list line on some booking, with what availability needs to know about that booking. */
export interface ClaimLine extends LineCounts {
  bookingId: string;
  reservedAt: Date | null;
  overrideReason?: string | null;
  bookingStatus: string;
  /** YYYY-MM-DD or null. */
  eventDate: string | null;
  /** The booking's equipment was checked in: anything outstanding is missing. */
  checkedIn: boolean;
}

export interface StockItem {
  kind: string;
  tracking: string;
  status: string;
  quantity: number;
  defectiveQty: number;
}

/** Units that could be used at all: in stock, not defective, status available. Sets are not stock. */
export function usableStock(item: StockItem): number {
  if (item.kind === "set" || item.status !== "available") return 0;
  return item.tracking === "bulk" ? Math.max(0, item.quantity - item.defectiveQty) : 1;
}

/** Whether the line's reservation holds stock on this date. */
export function holdsOn(line: ClaimLine, date: string): boolean {
  return line.reservedAt !== null && isReservingStatus(line.bookingStatus) && line.eventDate === date;
}

/** What the line reserves on a date: planned units minus those that came back damaged or were lost (they left usable stock already). */
export function holdOn(line: ClaimLine, date: string): number {
  return holdsOn(line, date) ? Math.max(0, line.quantity - line.damagedQty - line.lostQty) : 0;
}

/** Statuses where the gig won't happen: equipment loaded for it has no gig to come back from. */
const called_off = ["cancelled", "declined", "expired"];

/**
 * Outstanding units that block another booking on `date`. Equipment out for a
 * gig is expected back after that gig's date; until then, and for good once it's
 * overdue, missing, its gig was called off, or the gig has no date, it blocks every date.
 */
export function outBlocking(line: ClaimLine, date: string, today: string): number {
  const out = outstandingOf(line);
  if (out <= 0) return 0;
  const stuck = line.checkedIn || line.eventDate === null || line.eventDate < today || called_off.includes(line.bookingStatus);
  return stuck || date <= line.eventDate! ? out : 0;
}

/** One line's claim on stock for a date: reserved and out never add up for the same units. */
export function claimOn(line: ClaimLine, date: string, today: string): number {
  return Math.max(holdOn(line, date), outBlocking(line, date, today));
}

export type Shortage = "unusable" | "unavailable" | "reserved";

export interface Availability {
  /** Units this booking could still reserve on the date. */
  free: number;
  /** Units free if same-day reservations of other bookings were ignored (what an override could reach). */
  freeIgnoringReservations: number;
  /** Units out or missing elsewhere that block the date. */
  out: number;
  /** Units other bookings hold on the date (beyond what's already out). */
  reserved: number;
  usable: number;
}

/**
 * Stock for `bookingId` on `date`, ignoring that booking's own lines.
 * `lines` are all lines of the item (any booking).
 */
export function availabilityOn(item: StockItem, lines: readonly ClaimLine[], date: string, today: string, bookingId: string | null): Availability {
  const usable = usableStock(item);
  let claims = 0;
  let out = 0;
  for (const l of lines) {
    if (l.bookingId === bookingId) continue;
    const blocking = outBlocking(l, date, today);
    out += blocking;
    claims += Math.max(holdOn(l, date), blocking);
  }
  return { usable, free: usable - claims, freeIgnoringReservations: usable - out, out, reserved: claims - out };
}

export type ReserveCheck = { ok: true } | { ok: false; shortage: Shortage; free: number; overridable: boolean };

/**
 * Whether `requested` units can be reserved. Only a shortfall caused by other
 * bookings' same-day reservations can be overridden (by an owner or admin);
 * unusable or physically unavailable stock never can.
 */
export function checkReserve(item: StockItem, a: Availability, requested: number): ReserveCheck {
  if (requested <= a.free) return { ok: true };
  if (a.usable === 0) return { ok: false, shortage: "unusable", free: Math.max(0, a.free), overridable: false };
  if (requested <= a.freeIgnoringReservations) return { ok: false, shortage: "reserved", free: Math.max(0, a.free), overridable: true };
  return { ok: false, shortage: "unavailable", free: Math.max(0, a.free), overridable: false };
}

/**
 * How many more units this line may load now. Physical: usable stock minus
 * everything out elsewhere, minus other bookings' same-day holds (unless an
 * owner or admin overrode that conflict for this line), minus what this line
 * already has out; and never beyond the plan.
 */
export function loadableNow(item: StockItem, own: ClaimLine, others: readonly ClaimLine[], date: string, today: string): number {
  if (own.reservedAt === null || !isReservingStatus(own.bookingStatus)) return 0;
  const usable = usableStock(item);
  let taken = 0;
  for (const l of others) {
    if (l.bookingId === own.bookingId) continue;
    const out = outstandingOf(l) > 0 ? outstandingOf(l) : 0;
    taken += own.overrideReason ? out : Math.max(holdOn(l, date), out);
  }
  const physical = usable - taken - Math.max(0, outstandingOf(own));
  return Math.max(0, Math.min(physical, own.quantity - own.loadedQty));
}

// ─── Line changes ───────────────────────────────────────────────────────

export type LineError = "too_many" | "not_loaded" | "nothing_outstanding" | "negative";

/** Loading `n` more (or unloading with a negative n, only units not yet resolved). */
export function loadError(line: LineCounts, n: number): LineError | null {
  if (n === 0) return null;
  if (n > 0) return line.loadedQty + n > line.quantity ? "too_many" : null;
  return outstandingOf(line) + n < 0 ? "negative" : null;
}

/** Recording `ok` back fine and `damaged` back damaged. */
export function returnError(line: LineCounts, ok: number, damaged: number): LineError | null {
  if (ok < 0 || damaged < 0) return "negative";
  if (line.loadedQty === 0) return "not_loaded";
  if (ok + damaged === 0) return null;
  return ok + damaged > outstandingOf(line) ? "too_many" : null;
}

/** Confirming `n` outstanding units lost. */
export function lostError(line: LineCounts, n: number): LineError | null {
  if (n <= 0) return "negative";
  if (outstandingOf(line) === 0) return "nothing_outstanding";
  return n > outstandingOf(line) ? "too_many" : null;
}

/** A planned quantity can't drop below what's already loaded. */
export function plannedQuantityError(line: LineCounts, quantity: number): LineError | null {
  if (quantity < 1) return "negative";
  return quantity < line.loadedQty ? "too_many" : null;
}

// ─── Booking-level stage ────────────────────────────────────────────────

export const equipmentStages = ["none", "packing", "loading", "out", "returning", "missing", "complete", "unused"] as const;
export type EquipmentStage = (typeof equipmentStages)[number];

export interface EquipmentTotals {
  lines: number;
  planned: number;
  loaded: number;
  returned: number;
  damaged: number;
  lost: number;
  outstanding: number;
  notTaken: number;
  unreserved: number;
}

export function equipmentTotals(lines: readonly (LineCounts & { reservedAt?: Date | null })[]): EquipmentTotals {
  const t: EquipmentTotals = { lines: lines.length, planned: 0, loaded: 0, returned: 0, damaged: 0, lost: 0, outstanding: 0, notTaken: 0, unreserved: 0 };
  for (const l of lines) {
    t.planned += l.quantity;
    t.loaded += l.loadedQty;
    t.returned += l.returnedQty;
    t.damaged += l.damagedQty;
    t.lost += l.lostQty;
    t.outstanding += outstandingOf(l);
    t.notTaken += notTakenOf(l);
    if (l.reservedAt === null) t.unreserved += 1;
  }
  return t;
}

/**
 * Where a booking's equipment stands. Complete means everything that was loaded
 * is resolved (back, damaged or lost); planned items never loaded don't count.
 * Missing means the agency finished check-in with units still out.
 */
export function equipmentStage(input: { totals: EquipmentTotals; eventDate: string | null; today: string; checkedIn: boolean }): EquipmentStage {
  const { totals: t, eventDate, today, checkedIn } = input;
  if (t.lines === 0) return "none";
  if (t.loaded === 0) return eventDate !== null && eventDate < today ? "unused" : "packing";
  if (t.outstanding === 0) return "complete";
  if (checkedIn) return "missing";
  if (t.returned + t.damaged + t.lost > 0) return "returning";
  if ((eventDate !== null && eventDate <= today) || t.loaded === t.planned) return "out";
  return "loading";
}

// ─── Power ──────────────────────────────────────────────────────────────

/** Total power of the planned equipment in watts (cases and sets draw nothing themselves). */
export function powerTotal(lines: readonly { quantity: number; item: { kind: string; powerWatts: number | null } }[]): number {
  return lines.reduce((sum, l) => (l.item.kind === "item" && l.item.powerWatts ? sum + l.item.powerWatts * l.quantity : sum), 0);
}

// ─── Packages ───────────────────────────────────────────────────────────

export const packageLineSchema = z
  .object({
    itemId: z.string().min(1).max(64).nullable(),
    categoryId: z.string().min(1).max(64).nullable(),
    quantity: z.coerce.number().int().min(1).max(10_000),
  })
  .refine((l) => (l.itemId === null) !== (l.categoryId === null), "target");

export const equipmentPackageSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: optionalText(2000),
  lines: z.array(packageLineSchema).max(200),
});
export type EquipmentPackageInput = z.infer<typeof equipmentPackageSchema>;

export interface PackageCandidate extends StockItem {
  id: string;
  code: string;
  categoryId: string | null;
  containerId: string | null;
  /** Units free on the booking's date (from availabilityOn). */
  free: number;
}

export type PackagePick =
  | { lineIndex: number; itemId: string; quantity: number; status: "ok" }
  | { lineIndex: number; itemId: string | null; quantity: number; status: "short" | "unavailable"; reason: Shortage | "already_planned" | "none_free" };

/**
 * Turns package lines into concrete items for one booking. Specific lines take
 * that item (bulk up to what's free); category lines pick loose available
 * numbered items by code. Items already on the booking or picked by an earlier
 * line are skipped, so nothing is planned twice.
 */
export function resolvePackage(
  lines: readonly { itemId: string | null; categoryId: string | null; quantity: number }[],
  candidates: readonly PackageCandidate[],
  alreadyPlanned: ReadonlySet<string>,
): PackagePick[] {
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const used = new Map<string, number>();
  const picks: PackagePick[] = [];
  const left = (c: PackageCandidate) => c.free - (used.get(c.id) ?? 0);

  lines.forEach((line, lineIndex) => {
    if (line.itemId) {
      const item = byId.get(line.itemId);
      if (!item || item.kind === "set") {
        picks.push({ lineIndex, itemId: line.itemId, quantity: line.quantity, status: "unavailable", reason: "unusable" });
        return;
      }
      if (alreadyPlanned.has(item.id) || used.has(item.id)) {
        picks.push({ lineIndex, itemId: item.id, quantity: line.quantity, status: "unavailable", reason: "already_planned" });
        return;
      }
      const wanted = item.tracking === "bulk" ? line.quantity : 1;
      const can = Math.max(0, Math.min(wanted, left(item)));
      if (can > 0) {
        used.set(item.id, can);
        picks.push({ lineIndex, itemId: item.id, quantity: can, status: "ok" });
      }
      if (can < wanted) {
        const reason: Shortage = usableStock(item) === 0 ? "unusable" : "unavailable";
        picks.push({ lineIndex, itemId: can > 0 ? null : item.id, quantity: wanted - can, status: can > 0 ? "short" : "unavailable", reason });
      }
      return;
    }
    const pool = candidates
      .filter((c) => c.categoryId === line.categoryId && c.kind === "item" && c.tracking === "unit" && c.containerId === null)
      .filter((c) => !alreadyPlanned.has(c.id) && !used.has(c.id) && left(c) >= 1)
      .sort((a, b) => a.code.localeCompare(b.code, "en", { numeric: true }));
    const chosen = pool.slice(0, line.quantity);
    for (const c of chosen) {
      used.set(c.id, 1);
      picks.push({ lineIndex, itemId: c.id, quantity: 1, status: "ok" });
    }
    if (chosen.length < line.quantity) {
      picks.push({ lineIndex, itemId: null, quantity: line.quantity - chosen.length, status: chosen.length > 0 ? "short" : "unavailable", reason: "none_free" });
    }
  });
  return picks;
}

// ─── Stock changes against reservations ─────────────────────────────────

/** A line with what's needed to release it (latest reservations go first). */
export interface ReservedLine extends ClaimLine {
  id: string;
}

/**
 * Which reservations a stock change breaks. For each upcoming date with
 * reservations, compares the shortfall before and after the change (a same-day
 * override may already run short; that isn't made worse). Returns the lines to
 * release, latest reserved first (pass lines oldest first), until no date is shorter than before; an
 * empty list means the change keeps every reservation whole.
 */
export function reservationsBrokenBy(before: StockItem, after: StockItem, lines: readonly ReservedLine[], today: string): ReservedLine[] {
  const dates = [...new Set(lines.filter((l) => l.reservedAt && isReservingStatus(l.bookingStatus) && l.eventDate !== null && l.eventDate >= today).map((l) => l.eventDate!))];
  const release: ReservedLine[] = [];
  for (const date of dates) {
    const shortBefore = Math.max(0, -availabilityOn(before, lines, date, today, null).free);
    let remaining = lines.filter((l) => !release.includes(l));
    const candidates = remaining
      .filter((l) => holdsOn(l, date) && outstandingOf(l) === 0)
      // Latest reservation first; equal times go by position (lines come oldest first), so the newest line goes first.
      .sort((a, b) => b.reservedAt!.getTime() - a.reservedAt!.getTime() || lines.indexOf(b) - lines.indexOf(a));
    for (const line of candidates) {
      if (Math.max(0, -availabilityOn(after, remaining, date, today, null).free) <= shortBefore) break;
      release.push(line);
      remaining = remaining.filter((l) => l !== line);
    }
  }
  return release;
}

// ─── Package picks against the template ─────────────────────────────────

export type PackagePickError = "duplicate" | "not_in_package" | "wrong_category" | "too_many";

/**
 * Checks picks sent back from a package preview against the package itself:
 * each item at most once; specific items only as listed and up to their
 * quantity; category picks only loose numbered items of that category, no more
 * than the category lines ask for. Fewer than asked is fine (partial packages).
 */
export function packagePickError(
  lines: readonly { itemId: string | null; categoryId: string | null; quantity: number }[],
  picks: readonly { itemId: string; quantity: number }[],
  items: ReadonlyMap<string, { kind: string; tracking: string; categoryId: string | null; containerId: string | null }>,
): PackagePickError | null {
  const seen = new Set<string>();
  const perCategory = new Map<string, number>();
  for (const pick of picks) {
    if (seen.has(pick.itemId)) return "duplicate";
    seen.add(pick.itemId);
    const specific = lines.filter((l) => l.itemId === pick.itemId);
    if (specific.length > 0) {
      const item = items.get(pick.itemId);
      const allowed = item?.tracking === "bulk" ? specific.reduce((s, l) => s + l.quantity, 0) : 1;
      if (pick.quantity < 1 || pick.quantity > allowed) return "too_many";
      continue;
    }
    const item = items.get(pick.itemId);
    if (!item) return "not_in_package";
    const categoryLines = lines.filter((l) => l.categoryId !== null && l.categoryId === item.categoryId);
    if (categoryLines.length === 0) return lines.some((l) => l.categoryId !== null) ? "wrong_category" : "not_in_package";
    if (item.kind !== "item" || item.tracking !== "unit" || item.containerId !== null || pick.quantity !== 1) return "wrong_category";
    const used = (perCategory.get(item.categoryId!) ?? 0) + 1;
    if (used > categoryLines.reduce((s, l) => s + l.quantity, 0)) return "too_many";
    perCategory.set(item.categoryId!, used);
  }
  return null;
}
