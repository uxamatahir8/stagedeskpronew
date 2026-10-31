import { equipmentItemSchema, permissionsFor } from "@stagedesk/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addToPackingList, confirmLost, finishCheckIn, loadLine, overrideLine } from "./booking-equipment";
import { acceptQuote, createBooking, sendQuote } from "./bookings";
import { prisma } from "./client";
import { lineOfBooking, resolveEquipmentAccess } from "./equipment-access";
import { createItem, deleteItem, inventoryExportRows, markItemLost, purgeInventory, retireItem, updateItem } from "./inventory";

/**
 * The gig-equipment gate and the agency checks inside every inventory write,
 * against the database: what the web actions rely on, so a direct request
 * can't do more than the UI offers.
 */
const run = `g${Date.now().toString(36)}`;
const orgA = `${run}-a`;
const orgB = `${run}-b`;
const u = { owner: `${run}-owner`, staff: `${run}-staff`, ownerB: `${run}-ownerb`, dj: `${run}-dj`, djB: `${run}-djb`, cust: `${run}-cust` };
const may1 = new Date("2027-05-01T10:00:00Z");
let code = "";
let bookingId = "";
let lineId = "";
let speaker = "";

const desk = (userId: string, organizationId: string, role: "agency_owner" | "agency_staff") => ({ userId, organizationId, permissions: permissionsFor(role) });
const artist = (userId: string) => ({ userId, organizationId: null, permissions: permissionsFor("artist") });

beforeAll(async () => {
  await prisma.organization.createMany({ data: [{ id: orgA, name: "A", slug: `${run}-a` }, { id: orgB, name: "B", slug: `${run}-b` }] });
  await prisma.user.createMany({ data: Object.values(u).map((id) => ({ id, name: id, email: `${id}@test.local` })) });
  await prisma.artist.createMany({
    data: [
      { id: `${run}-art`, organizationId: orgA, userId: u.dj, stageName: "DJ A", genres: [] },
      { id: `${run}-artb`, organizationId: orgB, userId: u.djB, stageName: "DJ B", genres: [] },
    ],
  });
  speaker = await createItem(orgA, equipmentItemSchema.parse({ code: "GATE-1", name: "Speaker", serialNumber: "SN-PRIVATE" }), u.owner);
  const b = await createBooking(orgA, { customerId: u.cust, eventType: "wedding", eventDate: "2027-06-12" }, u.owner);
  const q = await sendQuote(orgA, b.id, { lines: [{ description: "DJ", quantityHundredths: 100, unitPriceCents: 10_000, vatBps: 2_100 }], depositBps: 0, expiresInDays: 14 }, u.owner, may1);
  await acceptQuote(orgA, q.id, { actor: "customer", actorId: u.cust, name: "K" }, may1);
  await addToPackingList(orgA, b.id, { itemId: speaker, quantity: 1 }, { id: u.owner, canOverride: true }, null, may1);
  code = b.trackingCode;
  bookingId = b.id;
  lineId = (await prisma.bookingEquipment.findFirstOrThrow({ where: { bookingId } })).id;
});

afterAll(async () => {
  await prisma.bookingEquipment.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
  await prisma.bookingAssignment.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
  await prisma.quote.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
  await prisma.booking.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
  await prisma.$transaction((tx) => purgeInventory(tx, [orgA, orgB]));
  await prisma.auditEvent.deleteMany({ where: { agencyId: { in: [orgA, orgB] } } });
  await prisma.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
  await prisma.user.deleteMany({ where: { id: { in: Object.values(u) } } });
  await prisma.$disconnect();
});

async function assign(artistId: string, status: string) {
  await prisma.bookingAssignment.deleteMany({ where: { bookingId } });
  await prisma.bookingAssignment.create({ data: { id: `${run}-as-${status}-${artistId}`, organizationId: orgA, bookingId, artistId, status, shareBps: 0 } });
}

describe("desk access", () => {
  it("the agency's own people with gig-equipment rights get the booking; overrides only with the admin permission", async () => {
    const owner = await resolveEquipmentAccess(desk(u.owner, orgA, "agency_owner"), code);
    expect(owner).toMatchObject({ mode: "desk", bookingId, canPlan: true, canHandle: true, canOverride: true });
    const staff = await resolveEquipmentAccess(desk(u.staff, orgA, "agency_staff"), code);
    expect(staff).toMatchObject({ mode: "desk", canPlan: true, canOverride: false });
  });

  it("another agency gets nothing, even by tracking code", async () => {
    expect(await resolveEquipmentAccess(desk(u.ownerB, orgB, "agency_owner"), code)).toBeNull();
  });

  it("no gig-equipment permission, no access", async () => {
    expect(await resolveEquipmentAccess({ userId: u.staff, organizationId: orgA, permissions: ["agency.bookings", "agency.inventory"] }, code)).toBeNull();
  });

  it("lines of other bookings can't be reached through an access", async () => {
    const access = (await resolveEquipmentAccess(desk(u.owner, orgA, "agency_owner"), code))!;
    expect(await lineOfBooking(access, lineId)).not.toBeNull();
    const other = await createBooking(orgA, { customerId: u.cust, eventType: "party", eventDate: "2027-07-01" }, u.owner);
    const otherAccess = (await resolveEquipmentAccess(desk(u.owner, orgA, "agency_owner"), other.trackingCode))!;
    expect(await lineOfBooking(otherAccess, lineId)).toBeNull();
  });
});

describe("artist access", () => {
  it("an artist who isn't on the gig gets nothing", async () => {
    await prisma.bookingAssignment.deleteMany({ where: { bookingId } });
    expect(await resolveEquipmentAccess(artist(u.dj), code, "artist")).toBeNull();
  });

  it("a pending artist only sees; an accepted one handles only when the agency allows it", async () => {
    await prisma.organization.update({ where: { id: orgA }, data: { artistsHandleEquipment: true } });
    await assign(`${run}-art`, "pending");
    expect(await resolveEquipmentAccess(artist(u.dj), code, "artist")).toMatchObject({ mode: "artist", canHandle: false, canPlan: false, canSeePrivate: false });
    await assign(`${run}-art`, "accepted");
    expect(await resolveEquipmentAccess(artist(u.dj), code, "artist")).toMatchObject({ canHandle: true, canPlan: false, canOverride: false });
    await prisma.organization.update({ where: { id: orgA }, data: { artistsHandleEquipment: false } });
    expect(await resolveEquipmentAccess(artist(u.dj), code, "artist")).toMatchObject({ canHandle: false });
  });

  it("withdrawn or declined assignments lose access at once", async () => {
    for (const status of ["withdrawn", "declined"]) {
      await assign(`${run}-art`, status);
      expect(await resolveEquipmentAccess(artist(u.dj), code, "artist")).toBeNull();
    }
  });

  it("a lent artist from another agency is gated by the booking's agency", async () => {
    await prisma.organization.update({ where: { id: orgA }, data: { artistsHandleEquipment: true } });
    await assign(`${run}-artb`, "accepted");
    expect(await resolveEquipmentAccess(artist(u.djB), code, "artist")).toMatchObject({ organizationId: orgA, canHandle: true });
    expect(await resolveEquipmentAccess(artist(u.dj), code, "artist")).toBeNull();
    await prisma.organization.update({ where: { id: orgA }, data: { artistsHandleEquipment: false } });
  });
});

describe("inventory writes refuse other agencies' equipment", () => {
  it("edit, retire, delete and write-off by another agency find nothing", async () => {
    const input = equipmentItemSchema.parse({ code: "HIJACK", name: "Mine now" });
    await expect(updateItem(orgB, speaker, input, u.ownerB)).rejects.toMatchObject({ code: "not_found" });
    await expect(retireItem(orgB, speaker, u.ownerB, null)).rejects.toMatchObject({ code: "not_found" });
    await expect(deleteItem(orgB, speaker, u.ownerB)).rejects.toMatchObject({ code: "not_found" });
    await expect(markItemLost(orgB, speaker, 1, u.ownerB, null)).rejects.toMatchObject({ code: "not_found" });
    expect((await prisma.equipmentItem.findUniqueOrThrow({ where: { id: speaker } })).name).toBe("Speaker");
  });

  it("packing-list writes with another agency's ids find nothing", async () => {
    await expect(loadLine(orgB, lineId, 1, u.ownerB, may1)).rejects.toMatchObject({ code: "not_found" });
    await expect(overrideLine(orgB, lineId, "x", { id: u.ownerB, canOverride: true }, may1)).rejects.toMatchObject({ code: "not_found" });
    await expect(finishCheckIn(orgB, bookingId, u.ownerB)).rejects.toMatchObject({ code: "not_found" });
  });

  it("overrides and losses need the admin permission even within the agency", async () => {
    await expect(overrideLine(orgA, lineId, "because", { id: u.staff, canOverride: false }, may1)).rejects.toMatchObject({ code: "not_allowed" });
    await expect(confirmLost(orgA, lineId, 1, { id: u.staff, canOverride: false }, null)).rejects.toMatchObject({ code: "not_allowed" });
  });

  it("exports hold only the agency's own equipment", async () => {
    expect((await inventoryExportRows(orgB)).map((r) => r.code)).not.toContain("GATE-1");
    expect((await inventoryExportRows(orgA)).find((r) => r.code === "GATE-1")?.serialNumber).toBe("SN-PRIVATE");
  });
});
