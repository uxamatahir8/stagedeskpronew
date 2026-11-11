import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { grantPlan, listAllBookings } from "./agencies";
import { makeArtistIndependent, moveArtist } from "./artist-admin";
import { acceptQuote, assignArtist, createBooking, sendQuote } from "./bookings";
import { prisma } from "./client";
import { seedPlans } from "./seed-plans";
import { createSoloArtistForPerson } from "./solo";
import { addAgencyCustomerByAdmin, addAgencyMemberByAdmin } from "./users";

/**
 * What a platform admin can set up for people: an independent artist, an
 * agency's team member or customer, and an agency artist moved to their own
 * independent business.
 */
const run = `ap${Date.now().toString(36)}`;
const agency = `${run}-agency`;
const owner = `${run}-owner`;
const djUser = `${run}-dj`;
const dj = `${run}-dj-profile`;
const mail = (name: string) => `${run}.${name}@test.local`;

beforeAll(async () => {
  await seedPlans(prisma);
  await prisma.organization.create({ data: { id: agency, name: "Team Agency", slug: agency, city: "Utrecht" } });
  await grantPlan(agency, "starter"); // 2 staff seats
  await prisma.user.createMany({ data: [{ id: owner, name: "Owner", email: mail("owner") }, { id: djUser, name: "DJ Person", email: mail("dj") }] });
  await prisma.member.createMany({ data: [{ id: randomUUID(), organizationId: agency, userId: owner, role: "agency_owner" }, { id: randomUUID(), organizationId: agency, userId: djUser, role: "artist" }] });
  await prisma.artist.create({ data: { id: dj, organizationId: agency, userId: djUser, stageName: "DJ Move", bio: "Bio", genres: ["house"], mediaLinks: [], defaultShareBps: 4_000 } });
});

afterAll(async () => {
  const people = await prisma.user.findMany({ where: { email: { startsWith: `${run}.` } }, select: { id: true } });
  const ids = people.map((p) => p.id);
  const solos = await prisma.member.findMany({ where: { userId: { in: ids }, role: "solo_artist" }, select: { organizationId: true } });
  await prisma.bookingAssignment.deleteMany({ where: { organizationId: agency } });
  await prisma.booking.deleteMany({ where: { organizationId: agency } });
  await prisma.organization.deleteMany({ where: { id: { in: [agency, ...solos.map((s) => s.organizationId)] } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
});

describe("independent artists set up by a platform admin", () => {
  it("makes the account and business, and refuses a second one", async () => {
    const result = await createSoloArtistForPerson({ name: "Iris", email: mail("iris"), stageName: "DJ Iris", city: "Gouda", genres: ["disco"], locale: "nl" });
    expect(result.newUser).toBe(true);
    expect(result.organization).toMatchObject({ kind: "solo", name: "DJ Iris", city: "Gouda" });
    expect(await prisma.member.count({ where: { userId: result.user.id, role: "solo_artist" } })).toBe(1);
    await expect(createSoloArtistForPerson({ name: "Iris", email: mail("iris"), stageName: "Other", city: null, genres: [], locale: "nl" })).rejects.toMatchObject({ code: "already_independent" });
  });

  it("uses an existing account and doesn't leave a new one behind on a refusal", async () => {
    const existing = await createSoloArtistForPerson({ name: "Owner", email: mail("owner"), stageName: "Owner Live", city: null, genres: [], locale: "en" });
    expect(existing).toMatchObject({ newUser: false, user: { id: owner } });
    await expect(createSoloArtistForPerson({ name: "X", email: "not-an-email", stageName: "X", city: null, genres: [], locale: "en" })).rejects.toMatchObject({ code: "invalid" });
  });
});

describe("team members and customers added by a platform admin", () => {
  it("adds staff within the plan's seats, and refuses someone already there", async () => {
    // Starter: 2 seats, the owner has one.
    const first = await addAgencyMemberByAdmin({ organizationId: agency, name: "Sam Staff", email: mail("sam"), role: "agency_staff", locale: "nl" });
    expect(first.newUser).toBe(true);
    await expect(addAgencyMemberByAdmin({ organizationId: agency, name: "Too Many", email: mail("toomany"), role: "agency_admin", locale: "nl" })).rejects.toMatchObject({ code: "seats_full" });
    expect(await prisma.user.count({ where: { email: mail("toomany") } })).toBe(0);
    await expect(addAgencyMemberByAdmin({ organizationId: agency, name: "Sam", email: mail("sam"), role: "agency_admin", locale: "nl" })).rejects.toMatchObject({ code: "already_member" });
  });

  it("adds a customer once", async () => {
    const c = await addAgencyCustomerByAdmin({ organizationId: agency, name: "Klant", email: mail("klant"), phone: "0612345678", locale: "nl" });
    expect(await prisma.member.findFirst({ where: { organizationId: agency, userId: c.user.id } })).toMatchObject({ role: "customer" });
    await expect(addAgencyCustomerByAdmin({ organizationId: agency, name: "Klant", email: mail("klant"), phone: null, locale: "nl" })).rejects.toMatchObject({ code: "already_member" });
  });
});

describe("making an agency's artist independent", () => {
  it("refuses to leave the agency with gigs coming up, unless they're withdrawn", async () => {
    const b = await createBooking(agency, { customerId: null, eventType: "party", eventDate: "2027-08-14" }, owner);
    const q = await sendQuote(agency, b.id, { lines: [{ description: "DJ", quantityHundredths: 100, unitPriceCents: 10_000, vatBps: 2_100 }], depositBps: 0, expiresInDays: 14 }, owner, new Date("2027-05-01"));
    await acceptQuote(agency, q.id, { actor: "agency", actorId: owner, name: "Phone" }, new Date("2027-05-01"));
    await assignArtist(agency, b.id, dj, owner, new Date("2027-05-01"));
    await expect(makeArtistIndependent(dj, owner, "moving on", { leaveAgency: true })).rejects.toMatchObject({ code: "has_upcoming" });
    expect(await prisma.member.count({ where: { userId: djUser, role: "solo_artist" } })).toBe(0);

    const solo = await makeArtistIndependent(dj, owner, "moving on", { leaveAgency: true, withdraw: true, photoUrl: "/files/copy.jpg" });
    const own = await prisma.artist.findFirstOrThrow({ where: { organizationId: solo.id } });
    expect(own).toMatchObject({ userId: djUser, stageName: "DJ Move", bio: "Bio", genres: ["house"], photoUrl: "/files/copy.jpg" });
    expect(solo).toMatchObject({ kind: "solo", city: "Utrecht" });
    // The agency keeps the profile and its history, without the person.
    expect(await prisma.artist.findUniqueOrThrow({ where: { id: dj } })).toMatchObject({ active: false, userId: null });
    expect(await prisma.member.count({ where: { organizationId: agency, userId: djUser } })).toBe(0);
    expect(await prisma.bookingAssignment.findFirstOrThrow({ where: { bookingId: b.id } })).toMatchObject({ status: "withdrawn" });
    await expect(makeArtistIndependent(dj, owner, "again", { leaveAgency: false })).rejects.toMatchObject({ code: "user_not_found" });
  });

  it("moves an artist to another agency, keeping the current role when asked", async () => {
    const other = `${run}-other`;
    await prisma.organization.create({ data: { id: other, name: "Other Agency", slug: other } });
    const userId = (await prisma.user.create({ data: { id: randomUUID(), name: "Mover", email: mail("mover") } })).id;
    await prisma.member.create({ data: { id: randomUUID(), organizationId: agency, userId, role: "artist" } });
    const from = await prisma.artist.create({ data: { id: randomUUID(), organizationId: agency, userId, stageName: "DJ Mover", genres: ["funk"], compensationType: "fixed", defaultFixedFeeCents: 30_000, defaultShareBps: 0 } });

    const moved = await moveArtist(from.id, { kind: "organization", organizationId: other }, owner, "new agency", { keepCurrent: true });
    expect(moved).toMatchObject({ organizationId: other, userId, stageName: "DJ Mover", compensationType: "fixed", defaultFixedFeeCents: 30_000 });
    expect(await prisma.member.findFirst({ where: { organizationId: other, userId } })).toMatchObject({ role: "artist" });
    expect(await prisma.artist.findUniqueOrThrow({ where: { id: from.id } })).toMatchObject({ active: true, userId });
    await expect(moveArtist(from.id, { kind: "organization", organizationId: other }, owner, "again", { keepCurrent: true })).rejects.toMatchObject({ code: "user_taken" });
    await expect(moveArtist(moved.id, { kind: "organization", organizationId: other }, owner, "same", { keepCurrent: true })).rejects.toMatchObject({ code: "same_place" });

    // Leaving: the old profile is deactivated and unlinked, the membership there ends.
    await prisma.artist.delete({ where: { id: moved.id } });
    await prisma.member.deleteMany({ where: { organizationId: other, userId } });
    await moveArtist(from.id, { kind: "organization", organizationId: other }, owner, "left", { keepCurrent: false });
    expect(await prisma.artist.findUniqueOrThrow({ where: { id: from.id } })).toMatchObject({ active: false, userId: null });
    expect(await prisma.member.count({ where: { organizationId: agency, userId } })).toBe(0);
    await prisma.organization.delete({ where: { id: other } });
  });

  it("needs a reason", async () => {
    await expect(makeArtistIndependent(dj, owner, " ", { leaveAgency: false })).rejects.toMatchObject({ code: "reason_required" });
  });
});

describe("the platform's booking list", () => {
  it("shows open bookings first, soonest event first, and sorts status by stage across pages", async () => {
    const org = `${run}-list`;
    await prisma.organization.create({ data: { id: org, name: "List Agency", slug: org } });
    const make = (code: string, status: string, date: string, createdAt: string) =>
      prisma.booking.create({ data: { id: randomUUID(), organizationId: org, trackingCode: code, status, eventType: "party", eventDate: new Date(date), createdAt: new Date(createdAt), currency: "EUR" } });
    // The cancelled one was made last: "newest first" would put it on top.
    await make(`${run}C`.slice(-8).toUpperCase(), "cancelled", "2027-03-01", "2026-11-10");
    await make(`${run}B`.slice(-8).toUpperCase(), "booked", "2027-05-01", "2026-09-01");
    await make(`${run}Q`.slice(-8).toUpperCase(), "quoted", "2027-02-01", "2026-10-01");
    await make(`${run}S`.slice(-8).toUpperCase(), "settled", "2026-06-01", "2026-03-01");

    const statuses = async (input: Parameters<typeof listAllBookings>[0]) => (await listAllBookings({ organizationId: org, ...input })).rows.map((r) => r.status);
    // Closed ones after, latest event first.
    expect(await statuses({})).toEqual(["quoted", "booked", "cancelled", "settled"]);
    expect(await statuses({ sort: "status", dir: "asc" })).toEqual(["quoted", "booked", "settled", "cancelled"]);
    expect(await statuses({ sort: "status", dir: "desc" })).toEqual(["cancelled", "settled", "booked", "quoted"]);
    // Paging runs across the groups as one list.
    expect(await statuses({ pageSize: 3, page: 2 })).toEqual(["settled"]);
    expect((await listAllBookings({ organizationId: org, pageSize: 3 })).total).toBe(4);
    await prisma.booking.deleteMany({ where: { organizationId: org } });
    await prisma.organization.delete({ where: { id: org } });
  });
});
