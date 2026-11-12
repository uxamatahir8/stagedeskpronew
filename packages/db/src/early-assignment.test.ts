import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { acceptQuote, assignArtist, createBooking, expireQuotes, isArtistFree, respondToAssignment, sendQuote } from "./bookings";
import { prisma } from "./client";

/**
 * Agencies line up the DJ while the quote is out: the request can go before
 * the customer accepts, the artist's yes holds the date, and accepting the
 * quote then confirms the booking at once.
 */
const run = `ea${Date.now().toString(36)}`;
const org = `${run}-org`;
const owner = `${run}-owner`;
const customer = `${run}-cust`;
const djUser = `${run}-dj-user`;
const dj = `${run}-dj`;
const may1 = new Date("2027-05-01T10:00:00Z");
const lines = [{ description: "DJ", quantityHundredths: 100, unitPriceCents: 50_000, vatBps: 2_100 }];

beforeAll(async () => {
  await prisma.organization.create({ data: { id: org, name: "Early Agency", slug: run } });
  await prisma.user.createMany({
    data: [
      { id: owner, name: "Owner", email: `${run}-o@test.local` },
      { id: customer, name: "Customer", email: `${run}-c@test.local` },
      { id: djUser, name: "DJ", email: `${run}-dj@test.local` },
    ],
  });
  await prisma.member.create({ data: { id: `${run}-m`, organizationId: org, userId: djUser, role: "artist" } });
  await prisma.artist.create({ data: { id: dj, organizationId: org, userId: djUser, stageName: "DJ Early", genres: [] } });
});

afterAll(async () => {
  await prisma.bookingAssignment.deleteMany({ where: { organizationId: org } });
  await prisma.booking.deleteMany({ where: { organizationId: org } });
  await prisma.organization.deleteMany({ where: { id: org } });
  await prisma.user.deleteMany({ where: { id: { in: [owner, customer, djUser] } } });
});

const booking = (date: string) => createBooking(org, { customerId: customer, eventType: "corporate", eventDate: date }, owner);
const statusOf = async (id: string) => (await prisma.booking.findUniqueOrThrow({ where: { id } })).status;
const assignmentOf = (bookingId: string) => prisma.bookingAssignment.findFirstOrThrow({ where: { bookingId }, orderBy: { createdAt: "desc" } });

describe("asking the artist before the quote is accepted", () => {
  it("assigns on an inquiry, keeps the yes, and confirms when the customer accepts", async () => {
    const b = await booking("2027-07-03");
    await assignArtist(org, b.id, dj, owner, may1);
    const request = await assignmentOf(b.id);
    await respondToAssignment(request.id, djUser, { accept: true }, may1);
    expect(await statusOf(b.id)).toBe("inquiry");
    expect((await assignmentOf(b.id)).status).toBe("accepted");

    const quote = await sendQuote(org, b.id, { lines, depositBps: 0, expiresInDays: 14 }, owner, may1);
    const result = await acceptQuote(org, quote.id, { actor: "customer", actorId: customer, name: "Klant" }, may1);
    expect(result).toEqual({ confirmed: true });
    expect(await statusOf(b.id)).toBe("confirmed");
    expect(await prisma.notification.count({ where: { userId: djUser, type: "gig_confirmed" } })).toBe(1);
  });

  it("holds the date for an open request on a quoted booking", async () => {
    const first = await booking("2027-07-10");
    await sendQuote(org, first.id, { lines, depositBps: 0, expiresInDays: 14 }, owner, may1);
    await assignArtist(org, first.id, dj, owner, may1);
    expect(await isArtistFree(dj, new Date("2027-07-10"))).toBe(false);

    const second = await booking("2027-07-10");
    await expect(assignArtist(org, second.id, dj, owner, may1)).rejects.toThrow("artist_unavailable");
  });

  it("goes to booked, not confirmed, when the artist hasn't answered yet", async () => {
    const b = await booking("2027-07-17");
    const quote = await sendQuote(org, b.id, { lines, depositBps: 0, expiresInDays: 14 }, owner, may1);
    await assignArtist(org, b.id, dj, owner, may1);
    expect(await acceptQuote(org, quote.id, { actor: "agency", actorId: owner, name: "Phone" }, may1)).toEqual({ confirmed: false });
    expect(await statusOf(b.id)).toBe("booked");
    await respondToAssignment((await assignmentOf(b.id)).id, djUser, { accept: true }, may1);
    expect(await statusOf(b.id)).toBe("confirmed");
  });

  it("releases the date while a quote has expired, and takes the artist off if the date went to another booking", async () => {
    const lapsed = await booking("2027-07-24");
    await sendQuote(org, lapsed.id, { lines, depositBps: 0, expiresInDays: 1 }, owner, may1);
    await assignArtist(org, lapsed.id, dj, owner, may1);
    await expireQuotes(new Date("2027-05-03T10:00:00Z"));
    expect(await statusOf(lapsed.id)).toBe("expired");
    expect(await isArtistFree(dj, new Date("2027-07-24"))).toBe(true);

    const other = await booking("2027-07-24");
    await assignArtist(org, other.id, dj, owner, may1);
    await sendQuote(org, lapsed.id, { lines, depositBps: 0, expiresInDays: 14 }, owner, new Date("2027-05-04T10:00:00Z"));
    expect(await statusOf(lapsed.id)).toBe("quoted");
    expect((await assignmentOf(lapsed.id)).status).toBe("withdrawn");
    expect(await prisma.bookingEvent.count({ where: { bookingId: lapsed.id, type: "artist_released" } })).toBe(1);
  });
});
