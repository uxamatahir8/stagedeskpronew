import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  acceptQuote,
  assignArtist,
  BookingError,
  changeBookingStatus,
  createBooking,
  expireQuotes,
  issueInvoice,
  recordPayment,
  respondToAssignment,
  sendQuote,
} from "./bookings";
import { prisma } from "./client";

const run = `b${Date.now().toString(36)}`;
const orgA = `${run}-a`;
const orgB = `${run}-b`;
const owner = `${run}-owner`;
const customer = `${run}-cust`;
const artistUser = `${run}-artist-user`;
const artistA = `${run}-artist-a`;
const artistB = `${run}-artist-b`;

// Event on 12 June 2027; "now" moves through the scenario.
const may1 = new Date("2027-05-01T10:00:00Z");
const eventDay = new Date("2027-06-12T22:00:00Z");
const lines = [
  { description: "DJ, per uur", quantityHundredths: 600, unitPriceCents: 12_500, vatBps: 2_100 },
  { description: "Reiskosten", quantityHundredths: 100, unitPriceCents: 4_500, vatBps: 0 },
];

beforeAll(async () => {
  await prisma.organization.createMany({
    data: [
      { id: orgA, name: "Agency A", slug: `${run}-a` },
      { id: orgB, name: "Agency B", slug: `${run}-b` },
    ],
  });
  await prisma.user.createMany({
    data: [
      { id: owner, name: "Owner", email: `${run}-o@test.local` },
      { id: customer, name: "Customer", email: `${run}-c@test.local` },
      { id: artistUser, name: "Artist", email: `${run}-ar@test.local` },
    ],
  });
  await prisma.artist.createMany({
    data: [
      { id: artistA, organizationId: orgA, userId: artistUser, stageName: "DJ A", genres: [], defaultShareBps: 4_000 },
      { id: artistB, organizationId: orgB, stageName: "DJ B", genres: [] },
    ],
  });
});

afterAll(async () => {
  // Payments and invoices are protected from cascading deletes, so remove them first.
  await prisma.payment.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
  await prisma.invoice.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
  await prisma.bookingAssignment.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
  await prisma.booking.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
  await prisma.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
  await prisma.user.deleteMany({ where: { id: { in: [owner, customer, artistUser] } } });
  await prisma.$disconnect();
});

async function newBooking(organizationId = orgA) {
  return createBooking(organizationId, { customerId: customer, eventType: "wedding", eventDate: "2027-06-12" }, owner);
}

describe("booking flow", () => {
  it("takes a booking from inquiry to settled with a quote and offline payments", async () => {
    const booking = await newBooking();
    expect(booking.status).toBe("inquiry");
    expect(booking.trackingCode).toMatch(/^[A-Z2-9]{8}$/);

    const quote = await sendQuote(orgA, booking.id, { lines, depositBps: 3_000, expiresInDays: 14 }, owner, may1);
    expect(quote).toMatchObject({ version: 1, status: "sent", totalCents: 95_250, depositCents: 28_575 });

    await acceptQuote(orgA, quote.id, { actor: "customer", actorId: customer, name: "Sanne" }, may1);
    let b = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(b).toMatchObject({ status: "booked", totalCents: 95_250, depositCents: 28_575 });

    await assignArtist(orgA, booking.id, artistA, owner, may1);
    const assignment = await prisma.bookingAssignment.findFirstOrThrow({ where: { bookingId: booking.id, status: "pending" } });
    await respondToAssignment(assignment.id, artistUser, { accept: true }, may1);
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe("confirmed");

    await recordPayment(orgA, booking.id, { amountCents: 28_575, kind: "deposit", method: "bank_transfer", receivedAt: may1 }, owner);
    const invoice = await issueInvoice(orgA, booking.id, owner, may1);
    expect(invoice.number).toBe("2027-0001");
    expect(await issueInvoice(orgA, booking.id, owner, may1)).toMatchObject({ id: invoice.id });

    await expect(changeBookingStatus(orgA, booking.id, "complete", { actor: "agency", actorId: owner }, may1)).rejects.toThrow(
      "event_not_reached",
    );
    await changeBookingStatus(orgA, booking.id, "complete", { actor: "agency", actorId: owner }, eventDay);
    await expect(changeBookingStatus(orgA, booking.id, "settle", { actor: "agency", actorId: owner }, eventDay)).rejects.toThrow(
      "not_fully_paid",
    );
    await recordPayment(orgA, booking.id, { amountCents: 66_675, kind: "balance", method: "cash", receivedAt: eventDay }, owner);
    await changeBookingStatus(orgA, booking.id, "settle", { actor: "agency", actorId: owner }, eventDay);

    b = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(b).toMatchObject({ status: "settled", paidCents: 95_250 });
    const events = await prisma.bookingEvent.findMany({ where: { bookingId: booking.id }, orderBy: { id: "asc" } });
    expect(events.map((e) => e.type)).toEqual([
      "created",
      "send_quote",
      "accept_quote",
      "artist_assigned",
      "artist_accepted",
      "payment_recorded",
      "invoice_issued",
      "complete",
      "payment_recorded",
      "settle",
    ]);
    expect(events.every((e) => e.organizationId === orgA)).toBe(true);
  });

  it("supersedes the previous quote and only accepts the current one", async () => {
    const booking = await newBooking();
    const v1 = await sendQuote(orgA, booking.id, { lines, depositBps: 0, expiresInDays: 14 }, owner, may1);
    const v2 = await sendQuote(orgA, booking.id, { lines: lines.slice(0, 1), depositBps: 0, expiresInDays: 14 }, owner, may1);
    expect(v2.version).toBe(2);
    expect((await prisma.quote.findUniqueOrThrow({ where: { id: v1.id } })).status).toBe("superseded");
    await expect(acceptQuote(orgA, v1.id, { actor: "customer", actorId: customer, name: "x" }, may1)).rejects.toThrow(
      "quote_not_current",
    );
  });

  it("expires overdue quotes", async () => {
    const booking = await newBooking();
    await sendQuote(orgA, booking.id, { lines, depositBps: 0, expiresInDays: 7 }, owner, may1);
    await expireQuotes(new Date("2027-05-09T00:00:00Z"));
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe("expired");
  });

  it("can't touch another agency's booking", async () => {
    const booking = await newBooking();
    await expect(changeBookingStatus(orgB, booking.id, "decline", { actor: "agency", actorId: owner })).rejects.toThrow("not_found");
    await expect(
      recordPayment(orgB, booking.id, { amountCents: 100, kind: "other", method: "cash", receivedAt: may1 }, owner),
    ).rejects.toThrow("not_found");
  });

  it("only assigns own or shared artists, and not twice on one day", async () => {
    const first = await newBooking();
    const quote = await sendQuote(orgA, first.id, { lines, depositBps: 0, expiresInDays: 14 }, owner, may1);
    await acceptQuote(orgA, quote.id, { actor: "agency", actorId: owner, name: "Phone" }, may1);

    await expect(assignArtist(orgA, first.id, artistB, owner, may1)).rejects.toThrow("artist_not_available_to_agency");
    await prisma.artistShare.create({
      data: { id: randomUUID(), organizationId: orgB, artistId: artistB, partnerOrganizationId: orgA, status: "accepted" },
    });
    await assignArtist(orgA, first.id, artistB, owner, may1);

    const second = await newBooking();
    const q2 = await sendQuote(orgA, second.id, { lines, depositBps: 0, expiresInDays: 14 }, owner, may1);
    await acceptQuote(orgA, q2.id, { actor: "agency", actorId: owner, name: "Phone" }, may1);
    await expect(assignArtist(orgA, second.id, artistB, owner, may1)).rejects.toThrow("artist_unavailable");
  });

  it("returns typed errors", async () => {
    const booking = await newBooking();
    const error = await sendQuote(orgA, booking.id, { lines: [], depositBps: 0, expiresInDays: 14 }, owner).catch((e) => e);
    expect(error).toBeInstanceOf(BookingError);
    expect(error.code).toBe("no_lines");
  });
});
