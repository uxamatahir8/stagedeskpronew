import { randomUUID } from "node:crypto";
import { equipmentItemSchema } from "@stagedesk/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
} from "./booking-equipment";
import { acceptQuote, changeBookingStatus, createBooking, sendQuote, updateBookingDetails } from "./bookings";
import { prisma } from "./client";
import {
  availabilityFor,
  createCategory,
  createItem,
  deleteCategory,
  deleteItem,
  InventoryError,
  inventoryStats,
  markItemFound,
  packageDetail,
  purgeInventory,
  retireItem,
  savePackage,
  setContainer,
  updateItem,
} from "./inventory";
import { sharedInventory, sharedItem } from "./shared-inventory";
import { tenantDb } from "./tenant";

const run = `i${Date.now().toString(36)}`;
const orgA = `${run}-a`;
const orgB = `${run}-b`;
const owner = `${run}-owner`;
const customer = `${run}-cust`;
const ownerActor = { id: owner, canOverride: true };
const staffActor = { id: owner, canOverride: false };

const may1 = new Date("2027-05-01T10:00:00Z");
const D = "2027-06-12";
const quoteLines = [{ description: "DJ", quantityHundredths: 100, unitPriceCents: 50_000, vatBps: 2_100 }];

const item = (input: Record<string, unknown>) => equipmentItemSchema.parse(input);

beforeAll(async () => {
  await prisma.organization.createMany({
    data: [
      { id: orgA, name: "Agency A", slug: `${run}-a`, city: "Utrecht" },
      { id: orgB, name: "Agency B", slug: `${run}-b` },
    ],
  });
  await prisma.user.createMany({
    data: [
      { id: owner, name: "Owner", email: `${run}-o@test.local` },
      { id: customer, name: "Customer", email: `${run}-c@test.local` },
    ],
  });
  await prisma.member.create({ data: { id: `${run}-m`, organizationId: orgA, userId: owner, role: "agency_owner" } });
});

afterAll(async () => {
  await prisma.bookingEquipment.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
  await prisma.quote.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
  await prisma.booking.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
  await prisma.$transaction((tx) => purgeInventory(tx, [orgA, orgB]));
  await prisma.auditEvent.deleteMany({ where: { agencyId: { in: [orgA, orgB] } } });
  await prisma.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
  await prisma.user.deleteMany({ where: { id: { in: [owner, customer] } } });
  await prisma.$disconnect();
});

async function inquiry(organizationId = orgA, eventDate = D) {
  return createBooking(organizationId, { customerId: customer, eventType: "wedding", eventDate }, owner);
}

/** Inquiry → quoted → booked (accepting reserves the packing list). */
async function accept(organizationId: string, bookingId: string) {
  const quote = await sendQuote(organizationId, bookingId, { lines: quoteLines, depositBps: 3_000, expiresInDays: 14 }, owner, may1);
  await acceptQuote(organizationId, quote.id, { actor: "customer", actorId: customer, name: "Klant" }, may1);
}

async function booked(organizationId = orgA, eventDate = D) {
  const b = await inquiry(organizationId, eventDate);
  await accept(organizationId, b.id);
  return b;
}

/** One after another: the existing sendQuote deadlocks when one agency sends several quotes in the same instant. */
async function bookedMany(n: number) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(await booked());
  return out;
}

const lineOf = (bookingId: string, itemId: string) => prisma.bookingEquipment.findFirstOrThrow({ where: { bookingId, itemId } });
const code = (prefix: string) => `${prefix}-${randomUUID().slice(0, 6)}`;

describe("agency isolation", () => {
  it("keeps items to their agency and lets agencies reuse each other's codes", async () => {
    const a = await createItem(orgA, item({ code: "SAME-1", name: "Speaker" }), owner);
    const b = await createItem(orgB, item({ code: "SAME-1", name: "Speaker" }), owner);
    expect(await tenantDb(orgB).equipmentItem.findFirst({ where: { id: a } })).toBeNull();
    expect(await tenantDb(orgA).equipmentItem.count({ where: { id: { in: [a, b] } } })).toBe(1);
    await expect(createItem(orgA, item({ code: "same-1", name: "Twice" }), owner)).rejects.toMatchObject({ code: "code_taken" });
  });

  it("refuses references to another agency's rows in the database itself", async () => {
    const theirs = await createItem(orgB, item({ code: code("B"), name: "Theirs" }), owner);
    const ours = await inquiry();
    // Through the plain client, bypassing every application check.
    await expect(
      prisma.bookingEquipment.create({ data: { id: randomUUID(), organizationId: orgA, bookingId: ours.id, itemId: theirs, quantity: 1 } }),
    ).rejects.toThrow();
    await expect(
      prisma.bookingEquipment.create({ data: { id: randomUUID(), organizationId: orgB, bookingId: ours.id, itemId: theirs, quantity: 1 } }),
    ).rejects.toThrow();
    // And through the app: another agency's item is simply not found.
    await expect(addToPackingList(orgA, ours.id, { itemId: theirs, quantity: 1 }, ownerActor)).rejects.toMatchObject({ code: "not_found" });
  });

  it("won't put an item in another agency's case", async () => {
    const theirCase = await createItem(orgB, item({ code: code("CASE"), name: "Case", kind: "case" }), owner);
    await expect(createItem(orgA, item({ code: code("M"), name: "Mic", containerId: theirCase }), owner)).rejects.toMatchObject({ code: "not_found" });
  });

  it("enforces the quantity rules with CHECK constraints", async () => {
    const speaker = await createItem(orgA, item({ code: code("CHK"), name: "Speaker" }), owner);
    const b = await booked();
    await addToPackingList(orgA, b.id, { itemId: speaker, quantity: 1 }, ownerActor, null, may1);
    const line = await lineOf(b.id, speaker);
    await expect(prisma.bookingEquipment.update({ where: { id: line.id }, data: { loadedQty: 2 } })).rejects.toThrow();
    await expect(prisma.bookingEquipment.update({ where: { id: line.id }, data: { returnedQty: 1 } })).rejects.toThrow();
    await expect(prisma.equipmentItem.update({ where: { id: speaker }, data: { defectiveQty: 2 } })).rejects.toThrow();
  });
});

describe("categories", () => {
  it("are unique per agency and can't be deleted while used", async () => {
    const cat = await createCategory(orgA, `Speakers ${run}`);
    await expect(createCategory(orgA, `Speakers ${run}`)).rejects.toMatchObject({ code: "name_taken" });
    await createCategory(orgB, `Speakers ${run}`);
    const id = await createItem(orgA, item({ code: code("CAT"), name: "Top", categoryId: cat.id }), owner);
    await expect(deleteCategory(orgA, cat.id)).rejects.toMatchObject({ code: "in_use" });
    await deleteItem(orgA, id, owner);
    await deleteCategory(orgA, cat.id);
  });
});

describe("cases and sets", () => {
  it("validates membership: one level, numbered items only", async () => {
    const box = await createItem(orgA, item({ code: code("BOX"), name: "Case", kind: "case" }), owner);
    const box2 = await createItem(orgA, item({ code: code("BOX"), name: "Case 2", kind: "case" }), owner);
    const cables = await createItem(orgA, item({ code: code("XLR"), name: "XLR", tracking: "bulk", quantity: 10 }), owner);
    await expect(setContainer(orgA, [box2], box, owner)).rejects.toMatchObject({ code: "not_unit_item" });
    await expect(setContainer(orgA, [cables], box, owner)).rejects.toMatchObject({ code: "not_unit_item" });
    const mic = await createItem(orgA, item({ code: code("MIC"), name: "Mic", containerId: box }), owner);
    await expect(setContainer(orgA, [mic], mic, owner)).rejects.toBeInstanceOf(InventoryError);
    const events = await prisma.equipmentEvent.findMany({ where: { itemId: mic } });
    expect(events.map((e) => e.type)).toEqual(["created", "moved_in"]);
  });

  it("packs a case with its contents, never twice, and keeps the grouping when membership changes", async () => {
    const box = await createItem(orgA, item({ code: code("BOX"), name: "Mic case", kind: "case" }), owner);
    const m1 = await createItem(orgA, item({ code: code("MIC"), name: "Mic 1", containerId: box }), owner);
    const m2 = await createItem(orgA, item({ code: code("MIC"), name: "Mic 2", containerId: box }), owner);
    const b = await inquiry();
    await addToPackingList(orgA, b.id, { itemId: m1, quantity: 1 }, ownerActor, null, may1);
    await addToPackingList(orgA, b.id, { itemId: box, quantity: 1 }, ownerActor, null, may1);
    const lines = await prisma.bookingEquipment.findMany({ where: { bookingId: b.id } });
    expect(lines.map((l) => l.itemId).sort()).toEqual([box, m1, m2].sort());
    expect(lines.find((l) => l.itemId === m2)?.viaContainerId).toBe(box);
    // Moving m2 out of the case later doesn't rewrite this packing list.
    await setContainer(orgA, [m2], null, owner);
    expect((await lineOf(b.id, m2)).viaContainerId).toBe(box);
    // The case can't be deleted now: it's part of a packing list's history.
    await setContainer(orgA, [m1], null, owner);
    await expect(deleteItem(orgA, box, owner)).rejects.toMatchObject({ code: "has_history" });
  });

  it("adds a set's members but not the set itself", async () => {
    const pair = await createItem(orgA, item({ code: code("SET"), name: "Speaker pair", kind: "set" }), owner);
    const l = await createItem(orgA, item({ code: code("SPK"), name: "Left", containerId: pair }), owner);
    const r = await createItem(orgA, item({ code: code("SPK"), name: "Right", containerId: pair }), owner);
    const b = await inquiry();
    await addToPackingList(orgA, b.id, { itemId: pair, quantity: 1 }, ownerActor, null, may1);
    const lines = await prisma.bookingEquipment.findMany({ where: { bookingId: b.id } });
    expect(lines.map((x) => x.itemId).sort()).toEqual([l, r].sort());
  });
});

describe("reservations follow the booking status", () => {
  it("inquiries plan without reserving; accepting the quote reserves", async () => {
    const speaker = await createItem(orgA, item({ code: code("RES"), name: "Speaker" }), owner);
    const b1 = await inquiry();
    const b2 = await inquiry();
    await addToPackingList(orgA, b1.id, { itemId: speaker, quantity: 1 }, ownerActor, null, may1);
    // Another inquiry can plan the same speaker: nothing is held yet, a warning only if reserved elsewhere.
    const r = await addToPackingList(orgA, b2.id, { itemId: speaker, quantity: 1 }, ownerActor, null, may1);
    expect(r.warnings).toEqual([]);
    expect((await lineOf(b1.id, speaker)).reservedAt).toBeNull();

    await accept(orgA, b1.id);
    expect((await lineOf(b1.id, speaker)).reservedAt).not.toBeNull();
    const events = await prisma.bookingEvent.findMany({ where: { bookingId: b1.id, type: "equipment_reserved" } });
    expect(events[0]?.data).toMatchObject({ reserved: 1, failed: 0 });

    // b2's acceptance still goes through, but its line can't be reserved and the desk hears about it.
    await accept(orgA, b2.id);
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: b2.id } })).status).toBe("booked");
    expect((await lineOf(b2.id, speaker)).reservedAt).toBeNull();
    expect(await prisma.notification.count({ where: { userId: owner, type: "equipment_unreserved", url: { contains: b2.trackingCode } } })).toBe(1);
    await expect(loadLine(orgA, (await lineOf(b2.id, speaker)).id, 1, owner, may1)).rejects.toMatchObject({ code: "not_reserved" });

    // Retrying fails while b1 holds it; once b1 is cancelled the retry reserves it.
    expect((await retryReservations(orgA, b2.id, staffActor, may1)).failed).toHaveLength(1);
    await changeBookingStatus(orgA, b1.id, "cancel", { actor: "agency", actorId: owner }, may1);
    expect((await retryReservations(orgA, b2.id, staffActor, may1)).reserved).toBe(1);
  });

  it("a booked booking reserves on adding, refuses conflicts, and only owners/admins override same-day ones", async () => {
    const speaker = await createItem(orgA, item({ code: code("OVR"), name: "Speaker" }), owner);
    const morning = await booked();
    const evening = await booked();
    await addToPackingList(orgA, morning.id, { itemId: speaker, quantity: 1 }, ownerActor, null, may1);
    const conflict = await addToPackingList(orgA, evening.id, { itemId: speaker, quantity: 1 }, staffActor, "two gigs", may1).catch((e) => e);
    expect(conflict).toBeInstanceOf(EquipmentError);
    expect(conflict.code).toBe("conflict");
    expect(conflict.conflicts[0]).toMatchObject({ shortage: "reserved", overridable: true });
    await expect(addToPackingList(orgA, evening.id, { itemId: speaker, quantity: 1 }, ownerActor, null, may1)).rejects.toMatchObject({ code: "conflict" });

    await addToPackingList(orgA, evening.id, { itemId: speaker, quantity: 1 }, ownerActor, "Morning and evening gig", may1);
    const line = await lineOf(evening.id, speaker);
    expect(line).toMatchObject({ overrideReason: "Morning and evening gig", overriddenById: owner });
    expect(line.reservedAt).not.toBeNull();
    expect(await prisma.auditEvent.count({ where: { agencyId: orgA, action: "inventory.override", targetId: evening.id } })).toBe(1);
    expect(await prisma.bookingEvent.count({ where: { bookingId: evening.id, type: "equipment_override" } })).toBe(1);
  });

  it("never overrides physically unavailable or defective equipment", async () => {
    const speaker = await createItem(orgA, item({ code: code("PHY"), name: "Speaker" }), owner);
    const first = await booked();
    await addToPackingList(orgA, first.id, { itemId: speaker, quantity: 1 }, ownerActor, null, may1);
    await loadLine(orgA, (await lineOf(first.id, speaker)).id, 1, owner, may1);
    const other = await booked();
    const error = await addToPackingList(orgA, other.id, { itemId: speaker, quantity: 1 }, ownerActor, "please", may1).catch((e) => e);
    expect(error.conflicts[0]).toMatchObject({ shortage: "unavailable", overridable: false });

    const broken = await createItem(orgA, item({ code: code("DEF"), name: "Broken" }), owner);
    await prisma.equipmentItem.update({ where: { id: broken }, data: { status: "defective" } });
    const error2 = await addToPackingList(orgA, other.id, { itemId: broken, quantity: 1 }, ownerActor, "please", may1).catch((e) => e);
    expect(error2.conflicts[0]).toMatchObject({ shortage: "unusable", overridable: false });
  });

  it("refuses a date change that reserved equipment can't follow", async () => {
    const speaker = await createItem(orgA, item({ code: code("DATE"), name: "Speaker" }), owner);
    const there = await booked(orgA, "2027-06-19");
    await addToPackingList(orgA, there.id, { itemId: speaker, quantity: 1 }, ownerActor, null, may1);
    const moving = await booked();
    await addToPackingList(orgA, moving.id, { itemId: speaker, quantity: 1 }, ownerActor, null, may1);
    await expect(updateBookingDetails(orgA, moving.id, { eventDate: new Date("2027-06-19T00:00:00Z") }, owner)).rejects.toMatchObject({ code: "reschedule_conflict" });
    await expect(updateBookingDetails(orgA, moving.id, { eventDate: null }, owner)).rejects.toMatchObject({ code: "reschedule_conflict" });
    await updateBookingDetails(orgA, moving.id, { eventDate: new Date("2027-06-26T00:00:00Z") }, owner);
  });
});

describe("counted stock: 10 cables", () => {
  it("counts reserved-and-loaded cables once and keeps missing ones unavailable", async () => {
    const xlr = await createItem(orgA, item({ code: code("XLR"), name: "XLR 10m", tracking: "bulk", quantity: 10 }), owner);
    const a = await booked();
    await addToPackingList(orgA, a.id, { itemId: xlr, quantity: 4 }, ownerActor, null, may1);
    const free = async (date = D) => (await availabilityFor(orgA, [xlr], date, null, may1)).get(xlr)!.free;
    expect(await free()).toBe(6);

    const line = await lineOf(a.id, xlr);
    await loadLine(orgA, line.id, 4, owner, may1);
    expect(await free()).toBe(6);

    const b = await booked();
    await expect(addToPackingList(orgA, b.id, { itemId: xlr, quantity: 7 }, ownerActor, null, may1)).rejects.toMatchObject({ code: "conflict" });
    await addToPackingList(orgA, b.id, { itemId: xlr, quantity: 6 }, ownerActor, null, may1);
    await removeLine(orgA, (await lineOf(b.id, xlr)).id, ownerActor);

    await returnLine(orgA, line.id, { ok: 3, damaged: 0 }, owner);
    await finishCheckIn(orgA, a.id, owner, may1);
    // One missing: blocks every date until resolved.
    expect(await free("2027-08-01")).toBe(9);
    // The desk is told (except whoever finished check-in); the timeline names what's missing.
    const checkedIn = await prisma.bookingEvent.findFirstOrThrow({ where: { bookingId: a.id, type: "equipment_checked_in" } });
    expect(checkedIn.data).toMatchObject({ missing: 1 });

    await expect(confirmLost(orgA, line.id, 1, staffActor, null)).rejects.toMatchObject({ code: "not_allowed" });
    await confirmLost(orgA, line.id, 1, ownerActor, "Left at the venue");
    expect((await prisma.equipmentItem.findUniqueOrThrow({ where: { id: xlr } })).quantity).toBe(9);
    expect(await free("2027-08-01")).toBe(9);
    expect(await prisma.auditEvent.count({ where: { agencyId: orgA, action: "inventory.lost", targetId: xlr } })).toBe(1);

    await markItemFound(orgA, xlr, 1, owner, null);
    expect(await free("2027-08-01")).toBe(10);
  });

  it("a late return resolves missing equipment", async () => {
    const xlr = await createItem(orgA, item({ code: code("LATE"), name: "XLR", tracking: "bulk", quantity: 5 }), owner);
    const a = await booked();
    await addToPackingList(orgA, a.id, { itemId: xlr, quantity: 5 }, ownerActor, null, may1);
    const line = await lineOf(a.id, xlr);
    await loadLine(orgA, line.id, 5, owner, may1);
    await returnLine(orgA, line.id, { ok: 4, damaged: 0 }, owner);
    await finishCheckIn(orgA, a.id, owner, may1);
    expect((await availabilityFor(orgA, [xlr], "2027-09-01", null, may1)).get(xlr)!.free).toBe(4);
    await returnLine(orgA, line.id, { ok: 0, damaged: 1, note: "bent plug" }, owner);
    const after = await prisma.equipmentItem.findUniqueOrThrow({ where: { id: xlr } });
    expect(after.defectiveQty).toBe(1);
    expect((await availabilityFor(orgA, [xlr], "2027-09-01", null, may1)).get(xlr)!.free).toBe(4);
    expect(await prisma.bookingEvent.count({ where: { bookingId: a.id, type: "equipment_returned" } })).toBe(1);
  });
});

describe("loading and returning", () => {
  it("damaged numbered equipment becomes defective and unavailable", async () => {
    const speaker = await createItem(orgA, item({ code: code("DMG"), name: "Speaker" }), owner);
    const b = await booked();
    await addToPackingList(orgA, b.id, { itemId: speaker, quantity: 1 }, ownerActor, null, may1);
    const line = await lineOf(b.id, speaker);
    await expect(returnLine(orgA, line.id, { ok: 1, damaged: 0 }, owner)).rejects.toMatchObject({ code: "not_loaded" });
    await loadLine(orgA, line.id, 1, owner, may1);
    await expect(loadLine(orgA, line.id, 1, owner, may1)).rejects.toBeInstanceOf(EquipmentError);
    await returnLine(orgA, line.id, { ok: 0, damaged: 1, note: "Cone torn" }, owner);
    const after = await prisma.equipmentItem.findUniqueOrThrow({ where: { id: speaker } });
    expect(after.status).toBe("defective");
    expect((await availabilityFor(orgA, [speaker], "2027-09-01", null, may1)).get(speaker)!.free).toBe(0);
    const events = await prisma.equipmentEvent.findMany({ where: { itemId: speaker }, orderBy: { id: "asc" } });
    expect(events.map((e) => e.type)).toEqual(["created", "allocated", "loaded", "damaged"]);
  });

  it("a grouped return only returns what was confirmed", async () => {
    const box = await createItem(orgA, item({ code: code("GRP"), name: "Case", kind: "case" }), owner);
    const m1 = await createItem(orgA, item({ code: code("GM"), name: "Mic 1", containerId: box }), owner);
    const m2 = await createItem(orgA, item({ code: code("GM"), name: "Mic 2", containerId: box }), owner);
    const m3 = await createItem(orgA, item({ code: code("GM"), name: "Mic 3", containerId: box }), owner);
    const b = await booked();
    await addToPackingList(orgA, b.id, { itemId: box, quantity: 1 }, ownerActor, null, may1);
    expect((await loadGroup(orgA, b.id, box, owner, may1)).loaded).toBe(4);
    const [lBox, l1, l2] = await Promise.all([lineOf(b.id, box), lineOf(b.id, m1), lineOf(b.id, m2)]);
    await returnGroup(orgA, b.id, box, { present: [lBox.id, l1.id], damaged: [l2.id] }, owner);
    const lines = await prisma.bookingEquipment.findMany({ where: { bookingId: b.id } });
    const of = (id: string) => lines.find((l) => l.itemId === id)!;
    expect(of(m1)).toMatchObject({ returnedQty: 1, damagedQty: 0 });
    expect(of(m2)).toMatchObject({ returnedQty: 0, damagedQty: 1 });
    expect(of(m3)).toMatchObject({ returnedQty: 0, damagedQty: 0, loadedQty: 1 });
    // Returning the group again doesn't touch resolved lines.
    await returnGroup(orgA, b.id, box, { present: [l1.id, l2.id], damaged: [] }, owner);
    expect(await lineOf(b.id, m2)).toMatchObject({ returnedQty: 0, damagedQty: 1 });
  });

  it("loaded equipment stays out after the booking is cancelled", async () => {
    const speaker = await createItem(orgA, item({ code: code("CXL"), name: "Speaker" }), owner);
    const b = await booked();
    await addToPackingList(orgA, b.id, { itemId: speaker, quantity: 1 }, ownerActor, null, may1);
    await loadLine(orgA, (await lineOf(b.id, speaker)).id, 1, owner, may1);
    await changeBookingStatus(orgA, b.id, "cancel", { actor: "agency", actorId: owner }, may1);
    expect((await availabilityFor(orgA, [speaker], "2027-09-01", null, may1)).get(speaker)!.free).toBe(0);
    await returnLine(orgA, (await lineOf(b.id, speaker)).id, { ok: 1, damaged: 0 }, owner);
    expect((await availabilityFor(orgA, [speaker], "2027-09-01", null, may1)).get(speaker)!.free).toBe(1);
  });

  it("can't change the plan below what's loaded or remove loaded lines", async () => {
    const xlr = await createItem(orgA, item({ code: code("PLN"), name: "XLR", tracking: "bulk", quantity: 8 }), owner);
    const b = await booked();
    await addToPackingList(orgA, b.id, { itemId: xlr, quantity: 4 }, ownerActor, null, may1);
    const line = await lineOf(b.id, xlr);
    await loadLine(orgA, line.id, 3, owner, may1);
    await expect(setLineQuantity(orgA, line.id, 2, ownerActor)).rejects.toMatchObject({ code: "too_many" });
    await setLineQuantity(orgA, line.id, 8, ownerActor, null, may1);
    await expect(removeLine(orgA, line.id, ownerActor)).rejects.toMatchObject({ code: "loaded" });
  });
});

describe("concurrency", () => {
  it("two bookings racing for the same speaker: exactly one gets it", async () => {
    const speaker = await createItem(orgA, item({ code: code("RACE"), name: "Speaker" }), owner);
    const bookings = await bookedMany(3);
    const results = await Promise.allSettled(bookings.map((b) => addToPackingList(orgA, b.id, { itemId: speaker, quantity: 1 }, ownerActor, null, may1)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.bookingEquipment.count({ where: { itemId: speaker, reservedAt: { not: null } } })).toBe(1);
  });

  it("never oversubscribes counted stock", async () => {
    const xlr = await createItem(orgA, item({ code: code("RACE"), name: "XLR", tracking: "bulk", quantity: 10 }), owner);
    const bookings = await bookedMany(4);
    await Promise.allSettled(bookings.map((b) => addToPackingList(orgA, b.id, { itemId: xlr, quantity: 4 }, ownerActor, null, may1)));
    const lines = await prisma.bookingEquipment.findMany({ where: { itemId: xlr } });
    expect(lines.reduce((s, l) => s + l.quantity, 0)).toBe(8);
  });

  it("parallel loading never exceeds the plan", async () => {
    const xlr = await createItem(orgA, item({ code: code("LOAD"), name: "XLR", tracking: "bulk", quantity: 10 }), owner);
    const b = await booked();
    await addToPackingList(orgA, b.id, { itemId: xlr, quantity: 3 }, ownerActor, null, may1);
    const line = await lineOf(b.id, xlr);
    await Promise.allSettled(Array.from({ length: 6 }, () => loadLine(orgA, line.id, 1, owner, may1)));
    expect((await lineOf(b.id, xlr)).loadedQty).toBe(3);
    await Promise.allSettled(Array.from({ length: 6 }, () => returnLine(orgA, line.id, { ok: 1, damaged: 0 }, owner)));
    expect((await lineOf(b.id, xlr)).returnedQty).toBe(3);
  });

  it("accepting two quotes at once doesn't reserve the same speaker twice", async () => {
    const speaker = await createItem(orgA, item({ code: code("ACC"), name: "Speaker" }), owner);
    const pair = [await inquiry(), await inquiry()];
    for (const b of pair) await addToPackingList(orgA, b.id, { itemId: speaker, quantity: 1 }, ownerActor, null, may1);
    const quotes = [];
    for (const b of pair) quotes.push(await sendQuote(orgA, b.id, { lines: quoteLines, depositBps: 3_000, expiresInDays: 14 }, owner, may1));
    await Promise.all(quotes.map((q) => acceptQuote(orgA, q.id, { actor: "customer", actorId: customer, name: "Klant" }, may1)));
    expect(await prisma.bookingEquipment.count({ where: { itemId: speaker, reservedAt: { not: null } } })).toBe(1);
  });
});

describe("packages", () => {
  it("previews and applies a package without planning anything twice", async () => {
    const cat = await createCategory(orgA, `Tops ${run}`);
    const s1 = await createItem(orgA, item({ code: code("PKG"), name: "Top 1", categoryId: cat.id }), owner);
    await createItem(orgA, item({ code: code("PKG"), name: "Top 2", categoryId: cat.id }), owner);
    const xlr = await createItem(orgA, item({ code: code("PKX"), name: "XLR", tracking: "bulk", quantity: 4 }), owner);
    const pkg = await tenantDb(orgA).equipmentPackage.create({ data: { id: randomUUID(), name: `DJ ${run}`, organizationId: orgA } });
    await tenantDb(orgA).equipmentPackageLine.createMany({
      data: [
        { id: randomUUID(), packageId: pkg.id, categoryId: cat.id, quantity: 3, position: 0, organizationId: orgA },
        { id: randomUUID(), packageId: pkg.id, itemId: xlr, quantity: 6, position: 1, organizationId: orgA },
      ],
    });
    const b = await booked();
    await addToPackingList(orgA, b.id, { itemId: s1, quantity: 1 }, ownerActor, null, may1);
    const preview = await previewPackage(orgA, b.id, pkg.id, may1);
    const picks = preview.lines.flatMap((l) => l.picks);
    expect(picks.filter((p) => p.status === "ok").map((p) => [p.itemId === s1, p.quantity])).toEqual([[false, 1], [false, 4]]);
    expect(picks.filter((p) => p.status !== "ok").map((p) => p.quantity)).toEqual([2, 2]);
    const ok = picks.flatMap((p) => (p.status === "ok" && p.itemId ? [{ itemId: p.itemId, quantity: p.quantity }] : []));
    await applyPackage(orgA, b.id, pkg.id, ok, ownerActor, null, may1);
    expect(await prisma.bookingEquipment.count({ where: { bookingId: b.id } })).toBe(3);
    expect(await prisma.bookingEvent.count({ where: { bookingId: b.id, type: "package_applied" } })).toBe(1);
    // Changing the package later doesn't touch the booking.
    await tenantDb(orgA).equipmentPackageLine.deleteMany({ where: { packageId: pkg.id } });
    expect(await prisma.bookingEquipment.count({ where: { bookingId: b.id } })).toBe(3);
  });
});

describe("package records", () => {
  it("saves lines in order, only with the agency's own equipment", async () => {
    const mine = await createItem(orgA, item({ code: code("PR"), name: "Mine" }), owner);
    const theirs = await createItem(orgB, item({ code: code("PR"), name: "Theirs" }), owner);
    const lines = [{ itemId: mine, categoryId: null, quantity: 1 }];
    const id = await savePackage(orgA, null, { name: `Basic ${run}`, description: null, lines });
    await expect(savePackage(orgA, null, { name: `Basic ${run}`, description: null, lines })).rejects.toMatchObject({ code: "name_taken" });
    await expect(savePackage(orgA, id, { name: `Basic ${run}`, description: null, lines: [...lines, { itemId: theirs, categoryId: null, quantity: 1 }] })).rejects.toMatchObject({ code: "not_found" });
    await expect(savePackage(orgB, id, { name: "Hijack", description: null, lines: [] })).rejects.toMatchObject({ code: "not_found" });
    expect((await packageDetail(orgA, id))?.lines.map((l) => l.itemId)).toEqual([mine]);
  });
});

describe("history and deletion", () => {
  it("retires instead of deleting equipment with history; can't retire what's out or reserved", async () => {
    const speaker = await createItem(orgA, item({ code: code("RET"), name: "Speaker" }), owner);
    const b = await booked();
    await addToPackingList(orgA, b.id, { itemId: speaker, quantity: 1 }, ownerActor, null, may1);
    await expect(deleteItem(orgA, speaker, owner)).rejects.toMatchObject({ code: "has_history" });
    await expect(retireItem(orgA, speaker, owner, null, may1)).rejects.toMatchObject({ code: "reserved" });
    const line = await lineOf(b.id, speaker);
    await loadLine(orgA, line.id, 1, owner, may1);
    await changeBookingStatus(orgA, b.id, "cancel", { actor: "agency", actorId: owner }, may1);
    await expect(retireItem(orgA, speaker, owner, null, may1)).rejects.toMatchObject({ code: "out" });
    await returnLine(orgA, line.id, { ok: 1, damaged: 0 }, owner);
    await retireItem(orgA, speaker, owner, null, may1);
    // The database refuses to drop history even through the plain client.
    await expect(prisma.booking.delete({ where: { id: b.id } })).rejects.toThrow();
    await expect(prisma.equipmentItem.delete({ where: { id: speaker } })).rejects.toThrow();
  });

  it("refuses kind changes once used and stock below what's out", async () => {
    const xlr = await createItem(orgA, item({ code: "XLR-KIND", name: "XLR", tracking: "bulk", quantity: 5 }), owner);
    const b = await booked();
    await addToPackingList(orgA, b.id, { itemId: xlr, quantity: 3 }, ownerActor, null, may1);
    await loadLine(orgA, (await lineOf(b.id, xlr)).id, 3, owner, may1);
    await expect(updateItem(orgA, xlr, item({ code: "XLR-KIND", name: "XLR", tracking: "unit" }), owner)).rejects.toMatchObject({ code: "kind_locked" });
    await expect(updateItem(orgA, xlr, item({ code: "XLR-KIND", name: "XLR", tracking: "bulk", quantity: 2 }), owner)).rejects.toMatchObject({ code: "below_use" });
    await updateItem(orgA, xlr, item({ code: "XLR-KIND", name: "XLR", tracking: "bulk", quantity: 7 }), owner);
    expect(await prisma.auditEvent.count({ where: { agencyId: orgA, action: "inventory.stock", targetId: xlr } })).toBe(1);
  });

  it("dashboard counts cases and items once, sets not at all", async () => {
    const stats = await inventoryStats(orgA, may1);
    const unitItems = await prisma.equipmentItem.count({ where: { organizationId: orgA, tracking: "unit", kind: { not: "set" }, status: { not: "retired" } } });
    expect(stats.assets).toBe(unitItems);
    expect(stats.missing).toBeGreaterThanOrEqual(0);
  });
});

describe("shared inventory", () => {
  it("is private by default, read-only fields only when on, and gone the moment it's off", async () => {
    const shown = await createItem(orgA, item({ code: code("SHR"), name: "Shared top", serialNumber: "SN-1", notes: "secret", specs: [{ label: "x", value: "y" }] }), owner);
    const hidden = await createItem(orgA, item({ code: code("SHR"), name: "Private", excludeFromSharing: true }), owner);
    expect(await sharedItem(orgB, shown)).toBeNull();

    await prisma.organization.update({ where: { id: orgA }, data: { inventorySharing: true } });
    const one = await sharedItem(orgB, shown);
    expect(Object.keys(one!).sort()).toEqual(["agency", "batteryPowered", "category", "code", "id", "kind", "manufacturer", "model", "name", "powerWatts"]);
    expect(Object.keys(one!.agency).sort()).toEqual(["bookingPage", "city", "id", "name"]);
    expect(JSON.stringify(one)).not.toMatch(/SN-1|secret/);
    expect(await sharedItem(orgB, hidden)).toBeNull();
    expect(await sharedItem(orgA, shown)).toBeNull();
    const list = await sharedInventory(orgB, { q: "Shared top" });
    expect(list.items.map((i) => i.id)).toContain(shown);

    await prisma.organization.update({ where: { id: orgA }, data: { suspendedAt: new Date() } });
    expect(await sharedItem(orgB, shown)).toBeNull();
    await prisma.organization.update({ where: { id: orgA }, data: { suspendedAt: null, inventorySharing: false } });
    expect(await sharedItem(orgB, shown)).toBeNull();
    expect((await sharedInventory(orgB, { q: "Shared top" })).items).toEqual([]);
  });
});
