import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { acceptQuote, assignArtist, createBooking, expireQuotes, respondToAssignment, sendQuote } from "./bookings";
import { prisma } from "./client";

/**
 * Competing requests on one booking. Each case fires the operations at the
 * same moment through separate connections; the booking row lock must turn
 * them into a valid sequence (no deadlock, no impossible state).
 */
const run = `bc${Date.now().toString(36)}`;
const org = `${run}-org`;
const owner = `${run}-owner`;
const customer = `${run}-cust`;
const artistUser = `${run}-artist-user`;
const artist = `${run}-artist`;
const may1 = new Date("2027-05-01T10:00:00Z");
const lines = [{ description: "DJ", quantityHundredths: 100, unitPriceCents: 100_000, vatBps: 2_100 }];

beforeAll(async () => {
  await prisma.organization.create({ data: { id: org, name: "Race Agency", slug: `${run}-org` } });
  await prisma.user.createMany({
    data: [
      { id: owner, name: "Owner", email: `${run}-o@test.local` },
      { id: customer, name: "Customer", email: `${run}-c@test.local` },
      { id: artistUser, name: "Artist", email: `${run}-ar@test.local` },
    ],
  });
  await prisma.artist.create({ data: { id: artist, organizationId: org, userId: artistUser, stageName: "DJ Race", genres: [], defaultShareBps: 4_000 } });
});

afterAll(async () => {
  await prisma.bookingAssignment.deleteMany({ where: { organizationId: org } });
  await prisma.booking.deleteMany({ where: { organizationId: org } });
  await prisma.organization.deleteMany({ where: { id: org } });
  await prisma.user.deleteMany({ where: { email: { startsWith: run } } });
  await prisma.$disconnect();
});

const newBooking = (eventDate = "2027-06-12") => createBooking(org, { customerId: customer, eventType: "wedding", eventDate }, owner);

describe("booking concurrency", () => {
  it("serialises simultaneous quotes on one booking without deadlocking", async () => {
    const booking = await newBooking();
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => sendQuote(org, booking.id, { lines, depositBps: 3_000, expiresInDays: 14 }, owner, may1)),
    );
    expect(results.filter((r) => r.status === "rejected")).toEqual([]);
    const quotes = await prisma.quote.findMany({ where: { bookingId: booking.id }, orderBy: { version: "asc" } });
    expect(quotes.map((q) => q.version)).toEqual([1, 2, 3, 4, 5]);
    // Exactly one quote stays current.
    expect(quotes.filter((q) => q.status === "sent")).toHaveLength(1);
    expect(quotes.at(-1)!.status).toBe("sent");
  });

  it("lets only one of two simultaneous answers to a gig request win", async () => {
    const booking = await newBooking("2027-06-13");
    const quote = await sendQuote(org, booking.id, { lines, depositBps: 3_000, expiresInDays: 14 }, owner, may1);
    await acceptQuote(org, quote.id, { actor: "customer", actorId: customer, name: "Customer" }, may1);
    await assignArtist(org, booking.id, artist, owner, may1);
    const pending = await prisma.bookingAssignment.findFirstOrThrow({ where: { bookingId: booking.id, status: "pending" } });

    const results = await Promise.allSettled([
      respondToAssignment(pending.id, artistUser, { accept: true }, may1),
      respondToAssignment(pending.id, artistUser, { accept: false, reason: "busy" }, may1),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const assignment = await prisma.bookingAssignment.findUniqueOrThrow({ where: { id: pending.id } });
    const fresh = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    // Accepted ⇔ confirmed; declined ⇔ still booked. Never declined-but-confirmed.
    expect(fresh.status).toBe(assignment.status === "accepted" ? "confirmed" : "booked");
  });

  it("doesn't let two bookings on one date take the same artist", async () => {
    const make = async () => {
      const b = await newBooking("2027-07-04");
      const q = await sendQuote(org, b.id, { lines, depositBps: 3_000, expiresInDays: 14 }, owner, may1);
      await acceptQuote(org, q.id, { actor: "customer", actorId: customer, name: "Customer" }, may1);
      return b;
    };
    const [one, two] = [await make(), await make()];
    const results = await Promise.allSettled([assignArtist(org, one.id, artist, owner, may1), assignArtist(org, two.id, artist, owner, may1)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({ reason: { code: "artist_unavailable" } });
  });

  it("doesn't expire a quote the customer accepts at the same moment", async () => {
    const booking = await newBooking("2027-08-01");
    const sent = new Date("2027-05-01T10:00:00Z");
    const quote = await sendQuote(org, booking.id, { lines, depositBps: 3_000, expiresInDays: 1 }, owner, sent);
    const atDeadline = new Date(sent.getTime() + 86_400_000 - 1);
    const results = await Promise.allSettled([
      acceptQuote(org, quote.id, { actor: "customer", actorId: customer, name: "Customer" }, atDeadline),
      expireQuotes(new Date(sent.getTime() + 86_400_000)),
    ]);
    // The expiry job never fails; the acceptance may lose the race with a clean booking error.
    expect(results[1].status).toBe("fulfilled");
    if (results[0].status === "rejected") expect(results[0].reason).toMatchObject({ name: "BookingError" });
    const fresh = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    const q = await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } });
    // Either order is fine, but status and quote must agree.
    expect(fresh.status === "booked").toBe(q.status === "accepted");
  });
});
