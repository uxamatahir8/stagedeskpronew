import { equipmentItemSchema } from "@stagedesk/core";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { setImpersonatorLookup } from "./audit";
import { addToPackingList, applyPackage, confirmLost, finishCheckIn, loadGroup, loadLine, previewPackage, returnLine } from "./booking-equipment";
import { acceptQuote, createBooking, sendQuote } from "./bookings";
import { prisma } from "./client";
import { changeDefectiveStock, createCategory, createItem, markItemLost, purgeInventory, savePackage, setItemStatus, updateItem } from "./inventory";

/**
 * Review fixes: stock changes against reservations, loading after check-in,
 * package picks against the package, and audit rows committed with the change.
 */
const run = `r${Date.now().toString(36)}`;
const org = `${run}-o`;
const owner = `${run}-owner`;
const planner = `${run}-planner`;
const customer = `${run}-cust`;
const ownerActor = { id: owner, canOverride: true };
const may1 = new Date("2027-05-01T10:00:00Z");
const quoteLines = [{ description: "DJ", quantityHundredths: 100, unitPriceCents: 10_000, vatBps: 2_100 }];
let n = 0;
const code = (p: string) => `${p}-${++n}`;
const item = (input: Record<string, unknown>) => equipmentItemSchema.parse(input);

beforeAll(async () => {
  await prisma.organization.create({ data: { id: org, name: "R", slug: org } });
  await prisma.user.createMany({ data: [owner, planner, customer].map((id) => ({ id, name: id, email: `${id}@test.local` })) });
  await prisma.member.createMany({
    data: [
      { id: `${run}-m1`, organizationId: org, userId: owner, role: "agency_owner" },
      { id: `${run}-m2`, organizationId: org, userId: planner, role: "agency_staff" },
    ],
  });
});

afterEach(() => setImpersonatorLookup(async () => null));

afterAll(async () => {
  await prisma.bookingEquipment.deleteMany({ where: { organizationId: org } });
  await prisma.quote.deleteMany({ where: { organizationId: org } });
  await prisma.booking.deleteMany({ where: { organizationId: org } });
  await prisma.$transaction((tx) => purgeInventory(tx, [org]));
  await prisma.auditEvent.deleteMany({ where: { agencyId: org } });
  await prisma.organization.deleteMany({ where: { id: org } });
  await prisma.user.deleteMany({ where: { id: { in: [owner, planner, customer] } } });
  await prisma.$disconnect();
});

async function booked(eventDate = "2027-06-12") {
  const b = await createBooking(org, { customerId: customer, eventType: "party", eventDate }, owner);
  const q = await sendQuote(org, b.id, { lines: quoteLines, depositBps: 0, expiresInDays: 14 }, owner, may1);
  await acceptQuote(org, q.id, { actor: "customer", actorId: customer, name: "K" }, may1);
  return b;
}
const lineOf = (bookingId: string, itemId: string) => prisma.bookingEquipment.findFirstOrThrow({ where: { bookingId, itemId } });
const stock = async (id: string) => prisma.equipmentItem.findUniqueOrThrow({ where: { id } });

describe("stock changes against reservations", () => {
  it("refuses cutting 10 reserved cables down to 3, and allows what still fits", async () => {
    const xlr = await createItem(org, item({ code: code("XLR"), name: "XLR", tracking: "bulk", quantity: 10 }), owner);
    const b = await booked();
    await addToPackingList(org, b.id, { itemId: xlr, quantity: 10 }, ownerActor, null, may1);
    const current = await stock(xlr);
    const input = (quantity: number) => item({ code: current.code, name: "XLR", tracking: "bulk", quantity });
    const error = await updateItem(org, xlr, input(3), owner).catch((e) => e);
    expect(error).toMatchObject({ code: "breaks_reservations" });
    expect(error.detail.codes).toEqual([b.trackingCode]);
    expect((await stock(xlr)).quantity).toBe(10);
    expect((await lineOf(b.id, xlr)).reservedAt).not.toBeNull();
    await updateItem(org, xlr, input(12), owner);
    await updateItem(org, xlr, input(10), owner);
    expect((await stock(xlr)).quantity).toBe(10);
  });

  it("damaging reserved counted stock is refused, or releases the latest reservation when asked", async () => {
    const xlr = await createItem(org, item({ code: code("XLR"), name: "XLR", tracking: "bulk", quantity: 10 }), owner);
    const first = await booked();
    const second = await booked();
    await addToPackingList(org, first.id, { itemId: xlr, quantity: 4 }, ownerActor, null, may1);
    await addToPackingList(org, second.id, { itemId: xlr, quantity: 6 }, ownerActor, null, may1);
    await expect(changeDefectiveStock(org, xlr, 3, owner, null)).rejects.toMatchObject({ code: "breaks_reservations" });
    expect((await stock(xlr)).defectiveQty).toBe(0);

    const released = await changeDefectiveStock(org, xlr, 3, owner, "kinked", { release: true });
    expect(released.map((r) => r.trackingCode)).toEqual([second.trackingCode]);
    expect((await lineOf(second.id, xlr)).reservedAt).toBeNull();
    expect((await lineOf(first.id, xlr)).reservedAt).not.toBeNull();
    expect(await prisma.bookingEvent.count({ where: { bookingId: second.id, type: "equipment_released" } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: planner, type: "equipment_unreserved", url: { contains: second.trackingCode } } })).toBe(1);
    // A released line can't be loaded until it's reserved again.
    await expect(loadLine(org, (await lineOf(second.id, xlr)).id, 1, owner, may1)).rejects.toMatchObject({ code: "not_reserved" });
  });

  it("a reserved speaker can't go into maintenance or be written off without releasing", async () => {
    const speaker = await createItem(org, item({ code: code("SPK"), name: "Speaker" }), owner);
    const b = await booked();
    await addToPackingList(org, b.id, { itemId: speaker, quantity: 1 }, ownerActor, null, may1);
    await expect(setItemStatus(org, speaker, "maintenance", owner, null)).rejects.toMatchObject({ code: "breaks_reservations" });
    await expect(markItemLost(org, speaker, 1, owner, null)).rejects.toMatchObject({ code: "breaks_reservations" });
    expect((await stock(speaker)).status).toBe("available");

    await setItemStatus(org, speaker, "maintenance", owner, null, { release: true });
    expect((await stock(speaker)).status).toBe("maintenance");
    expect((await lineOf(b.id, speaker)).reservedAt).toBeNull();
  });

  it("a write-off that releases reservations records them in its audit row", async () => {
    const speaker = await createItem(org, item({ code: code("SPK"), name: "Speaker" }), owner);
    const b = await booked();
    await addToPackingList(org, b.id, { itemId: speaker, quantity: 1 }, ownerActor, null, may1);
    await markItemLost(org, speaker, 1, owner, "stolen", { release: true });
    const row = await prisma.auditEvent.findFirstOrThrow({ where: { agencyId: org, action: "inventory.lost", targetId: speaker } });
    expect(row.data).toMatchObject({ releasedBookings: [b.trackingCode] });
  });

  it("equipment that comes back damaged releases its upcoming reservations automatically", async () => {
    const speaker = await createItem(org, item({ code: code("SPK"), name: "Speaker" }), owner);
    const now = await booked("2027-06-12");
    const later = await booked("2027-06-20");
    await addToPackingList(org, now.id, { itemId: speaker, quantity: 1 }, ownerActor, null, may1);
    await addToPackingList(org, later.id, { itemId: speaker, quantity: 1 }, ownerActor, null, may1);
    await loadLine(org, (await lineOf(now.id, speaker)).id, 1, owner, may1);
    await returnLine(org, (await lineOf(now.id, speaker)).id, { ok: 0, damaged: 1 }, owner);
    expect((await stock(speaker)).status).toBe("defective");
    expect((await lineOf(later.id, speaker)).reservedAt).toBeNull();
    expect(await prisma.bookingEvent.count({ where: { bookingId: later.id, type: "equipment_released" } })).toBe(1);
  });

  it("confirming equipment lost releases its upcoming reservations", async () => {
    const xlr = await createItem(org, item({ code: code("XLR"), name: "XLR", tracking: "bulk", quantity: 4 }), owner);
    const now = await booked("2027-06-12");
    const later = await booked("2027-06-20");
    await addToPackingList(org, now.id, { itemId: xlr, quantity: 2 }, ownerActor, null, may1);
    await addToPackingList(org, later.id, { itemId: xlr, quantity: 4 }, ownerActor, null, may1);
    const line = await lineOf(now.id, xlr);
    await loadLine(org, line.id, 2, owner, may1);
    await returnLine(org, line.id, { ok: 1, damaged: 0 }, owner);
    await finishCheckIn(org, now.id, owner, may1);
    await confirmLost(org, line.id, 1, ownerActor, "gone");
    expect((await stock(xlr)).quantity).toBe(3);
    expect((await lineOf(later.id, xlr)).reservedAt).toBeNull();
  });

  it("a stock cut racing a reservation never leaves more reserved than usable", async () => {
    const xlr = await createItem(org, item({ code: code("XLR"), name: "XLR", tracking: "bulk", quantity: 10 }), owner);
    const current = await stock(xlr);
    const b = await booked();
    await Promise.allSettled([
      updateItem(org, xlr, item({ code: current.code, name: "XLR", tracking: "bulk", quantity: 4 }), owner),
      addToPackingList(org, b.id, { itemId: xlr, quantity: 6 }, ownerActor, null, may1),
    ]);
    const after = await stock(xlr);
    const reserved = (await prisma.bookingEquipment.findMany({ where: { itemId: xlr, reservedAt: { not: null } } })).reduce((s, l) => s + l.quantity, 0);
    expect(reserved).toBeLessThanOrEqual(after.quantity - after.defectiveQty);
  });
});

describe("loading after check-in", () => {
  it("loading works before check-in; afterwards loading, unloading and grouped loading are refused", async () => {
    const box = await createItem(org, item({ code: code("BOX"), name: "Case", kind: "case" }), owner);
    await createItem(org, item({ code: code("MIC"), name: "Mic", containerId: box }), owner);
    const xlr = await createItem(org, item({ code: code("XLR"), name: "XLR", tracking: "bulk", quantity: 5 }), owner);
    const b = await booked();
    await addToPackingList(org, b.id, { itemId: box, quantity: 1 }, ownerActor, null, may1);
    await addToPackingList(org, b.id, { itemId: xlr, quantity: 3 }, ownerActor, null, may1);
    const cable = await lineOf(b.id, xlr);
    await loadLine(org, cable.id, 2, owner, may1);
    await finishCheckIn(org, b.id, owner, may1);

    await expect(loadLine(org, cable.id, 1, owner, may1)).rejects.toMatchObject({ code: "checked_in" });
    await expect(loadLine(org, cable.id, -1, owner, may1)).rejects.toMatchObject({ code: "checked_in" });
    await expect(loadGroup(org, b.id, box, owner, may1)).rejects.toMatchObject({ code: "checked_in" });
    expect((await lineOf(b.id, xlr)).loadedQty).toBe(2);

    // Late returns and confirmed losses still resolve what's missing.
    await returnLine(org, cable.id, { ok: 1, damaged: 0 }, owner);
    await confirmLost(org, cable.id, 1, ownerActor, null);
    expect(await lineOf(b.id, xlr)).toMatchObject({ loadedQty: 2, returnedQty: 1, lostQty: 1 });
  });

  it("finishing check-in twice changes nothing the second time", async () => {
    const xlr = await createItem(org, item({ code: code("XLR"), name: "XLR", tracking: "bulk", quantity: 5 }), owner);
    const b = await booked();
    await addToPackingList(org, b.id, { itemId: xlr, quantity: 3 }, ownerActor, null, may1);
    await loadLine(org, (await lineOf(b.id, xlr)).id, 3, owner, may1);
    const first = await finishCheckIn(org, b.id, owner, may1);
    const stamped = (await prisma.booking.findUniqueOrThrow({ where: { id: b.id } })).equipmentCheckedInAt;
    const again = await finishCheckIn(org, b.id, owner, new Date(may1.getTime() + 60_000));
    expect([first.repeated, again.repeated, again.missing]).toEqual([false, true, 3]);
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: b.id } })).equipmentCheckedInAt).toEqual(stamped);
    expect(await prisma.bookingEvent.count({ where: { bookingId: b.id, type: "equipment_checked_in" } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: planner, type: "equipment_missing", url: { contains: b.trackingCode } } })).toBe(1);
  });

  it("a load racing check-in either lands before it or is refused", async () => {
    const xlr = await createItem(org, item({ code: code("XLR"), name: "XLR", tracking: "bulk", quantity: 10 }), owner);
    const b = await booked();
    await addToPackingList(org, b.id, { itemId: xlr, quantity: 6 }, ownerActor, null, may1);
    const line = await lineOf(b.id, xlr);
    await loadLine(org, line.id, 1, owner, may1);
    await Promise.allSettled([finishCheckIn(org, b.id, owner, may1), ...Array.from({ length: 4 }, () => loadLine(org, line.id, 1, owner, may1))]);
    const checkedIn = (await prisma.booking.findUniqueOrThrow({ where: { id: b.id } })).equipmentCheckedInAt!;
    const event = await prisma.bookingEvent.findFirstOrThrow({ where: { bookingId: b.id, type: "equipment_checked_in" } });
    // What check-in reported missing is exactly what was loaded: nothing was loaded after it.
    expect((event.data as { missing: number }).missing).toBe((await lineOf(b.id, xlr)).loadedQty);
    const loads = await prisma.equipmentEvent.findMany({ where: { itemId: xlr, type: "loaded" } });
    expect(loads.every((e) => e.createdAt <= event.createdAt)).toBe(true);
    expect(checkedIn).toBeTruthy();
  });
});

describe("package picks are checked against the package", () => {
  it("refuses unrelated items, wrong categories, too many, duplicates and picks already planned; stale previews fail safely", async () => {
    const spk = await createCategory(org, `Spk ${run}`);
    const light = await createCategory(org, `Light ${run}`);
    const s1 = await createItem(org, item({ code: code("PS"), name: "S1", categoryId: spk.id }), owner);
    const s2 = await createItem(org, item({ code: code("PS"), name: "S2", categoryId: spk.id }), owner);
    const s3 = await createItem(org, item({ code: code("PS"), name: "S3", categoryId: spk.id }), owner);
    const l1 = await createItem(org, item({ code: code("PL"), name: "L1", categoryId: light.id }), owner);
    const xlr = await createItem(org, item({ code: code("PX"), name: "XLR", tracking: "bulk", quantity: 10 }), owner);
    const unrelated = await createItem(org, item({ code: code("PU"), name: "Other" }), owner);
    const pkg = await savePackage(org, null, {
      name: `Pkg ${run}`,
      description: null,
      lines: [
        { itemId: null, categoryId: spk.id, quantity: 2 },
        { itemId: xlr, categoryId: null, quantity: 4 },
      ],
    });
    const b = await booked();
    const apply = (picks: { itemId: string; quantity: number }[]) => applyPackage(org, b.id, pkg, picks, ownerActor, null, may1);
    for (const picks of [
      [{ itemId: unrelated, quantity: 1 }],
      [{ itemId: l1, quantity: 1 }],
      [{ itemId: s1, quantity: 1 }, { itemId: s2, quantity: 1 }, { itemId: s3, quantity: 1 }],
      [{ itemId: xlr, quantity: 5 }],
      [{ itemId: s1, quantity: 1 }, { itemId: s1, quantity: 1 }],
    ]) {
      await expect(apply(picks)).rejects.toMatchObject({ code: "invalid_package" });
    }
    expect(await prisma.bookingEquipment.count({ where: { bookingId: b.id } })).toBe(0);

    // A partial package is fine.
    await apply([{ itemId: s1, quantity: 1 }, { itemId: xlr, quantity: 2 }]);
    await expect(apply([{ itemId: s1, quantity: 1 }])).rejects.toMatchObject({ code: "invalid_package" });

    // Stale preview: another booking reserved the picked speaker meanwhile; nothing is added.
    const c = await booked();
    const preview = await previewPackage(org, c.id, pkg, may1);
    const picks = preview.lines.flatMap((l) => l.picks.flatMap((p) => (p.status === "ok" && p.itemId ? [{ itemId: p.itemId, quantity: p.quantity }] : [])));
    const taken = picks.find((p) => p.itemId === s2)!;
    expect(taken).toBeTruthy();
    const d = await booked();
    await addToPackingList(org, d.id, { itemId: s2, quantity: 1 }, ownerActor, null, may1);
    await expect(applyPackage(org, c.id, pkg, picks, ownerActor, null, may1)).rejects.toMatchObject({ code: "conflict" });
    expect(await prisma.bookingEquipment.count({ where: { bookingId: c.id } })).toBe(0);
  });
});

describe("audit rows commit with the change", () => {
  it("records the impersonator with the change", async () => {
    setImpersonatorLookup(async () => planner);
    const speaker = await createItem(org, item({ code: code("AU"), name: "Speaker" }), owner);
    await markItemLost(org, speaker, 1, owner, null);
    const row = await prisma.auditEvent.findFirstOrThrow({ where: { agencyId: org, action: "inventory.lost", targetId: speaker } });
    expect(row.impersonatorId).toBe(planner);
  });

  it("a failed audit write undoes the change", async () => {
    const speaker = await createItem(org, item({ code: code("AU"), name: "Speaker" }), owner);
    // An impersonator id longer than the column makes the audit insert fail inside the transaction.
    setImpersonatorLookup(async () => "x".repeat(100));
    await expect(markItemLost(org, speaker, 1, owner, null)).rejects.toThrow();
    expect((await stock(speaker)).status).toBe("available");
    expect(await prisma.equipmentEvent.count({ where: { itemId: speaker, type: "lost" } })).toBe(0);
    expect(await prisma.auditEvent.count({ where: { agencyId: org, targetId: speaker } })).toBe(0);
  });

  it("a change that's refused leaves no audit row", async () => {
    const speaker = await createItem(org, item({ code: code("AU"), name: "Speaker" }), owner);
    const b = await booked();
    await addToPackingList(org, b.id, { itemId: speaker, quantity: 1 }, ownerActor, null, may1);
    await expect(markItemLost(org, speaker, 1, owner, null)).rejects.toMatchObject({ code: "breaks_reservations" });
    expect(await prisma.auditEvent.count({ where: { agencyId: org, targetId: speaker } })).toBe(0);
  });
});
