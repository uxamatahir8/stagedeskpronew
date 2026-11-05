import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { acceptQuote, assignArtist, changeBookingStatus, createBooking, issueInvoice, nextInvoiceNumber, resolveBookingCustomer, sendQuote, updateBookingDetails } from "./bookings";
import { prisma } from "./client";

/**
 * Client feedback on bookings: upfront payment kinds (none / percentage /
 * fixed), the quote's language, fixed artist fees on assignments, and agency
 * invoice numbering (prefix, continuous series, typed numbers).
 */
const run = `bo${Date.now().toString(36)}`;
const org = `${run}-a`;
const usdOrg = `${run}-usd`;
const owner = `${run}-owner`;
const customer = `${run}-cust`;
const artistUser = `${run}-artist`;
const fixedArtist = `${run}-fixed`;
const pctArtist = `${run}-pct`;
const may1 = new Date("2027-05-01T10:00:00Z");
const lines = [{ description: "DJ", quantityHundredths: 100, unitPriceCents: 100_000, vatBps: 2_100 }];

beforeAll(async () => {
  await prisma.organization.createMany({
    data: [
      { id: org, name: "Options Agency", slug: `${run}-a`, correspondenceLocale: "nl" },
      { id: usdOrg, name: "Dollar Agency", slug: `${run}-usd`, currency: "USD" },
    ],
  });
  await prisma.user.createMany({
    data: [
      { id: owner, name: "Owner", email: `${run}-o@test.local` },
      { id: customer, name: "Customer", email: `${run}-c@test.local` },
      { id: artistUser, name: "Artist", email: `${run}-ar@test.local` },
      { id: `${run}-artist-pct`, name: "Artist Pct", email: `${run}-arp@test.local` },
    ],
  });
  await prisma.member.createMany({
    data: [
      { id: `${run}-m`, organizationId: org, userId: customer, role: "customer" },
      { id: `${run}-m2`, organizationId: org, userId: artistUser, role: "artist" },
      { id: `${run}-m3`, organizationId: org, userId: `${run}-artist-pct`, role: "artist" },
    ],
  });
  await prisma.artist.createMany({
    data: [
      { id: fixedArtist, organizationId: org, userId: artistUser, stageName: "DJ Fixed", genres: [], compensationType: "fixed", defaultFixedFeeCents: 25_000 },
      { id: pctArtist, organizationId: org, userId: `${run}-artist-pct`, stageName: "DJ Pct", genres: [], defaultShareBps: 4_000 },
    ],
  });
});

afterAll(async () => {
  const orgs = [org, usdOrg];
  await prisma.invoice.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.bookingAssignment.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.booking.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgs } } });
  await prisma.notification.deleteMany({ where: { userId: { in: [owner, customer, artistUser] } } });
  await prisma.user.deleteMany({ where: { OR: [{ id: { in: [owner, customer, artistUser] } }, { email: { startsWith: run } }] } });
  await prisma.$disconnect();
});

async function bookedBooking(deposit: Parameters<typeof sendQuote>[2]["deposit"], date = "2027-06-12", organizationId = org) {
  const booking = await createBooking(organizationId, { customerId: organizationId === org ? customer : null, eventType: "wedding", eventDate: date }, owner);
  const quote = await sendQuote(organizationId, booking.id, { lines, deposit, expiresInDays: 14, locale: "nl" }, owner, may1);
  await acceptQuote(organizationId, quote.id, { actor: "agency", actorId: owner, name: "Phone" }, may1);
  return { booking, quote };
}

describe("upfront payment", () => {
  it("stores no upfront payment as 0 and copies it to the booking", async () => {
    const { booking, quote } = await bookedBooking({ type: "none" });
    expect(quote).toMatchObject({ depositType: "none", depositBps: 0, depositCents: 0, totalCents: 121_000, locale: "nl" });
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).depositCents).toBe(0);
  });

  it("stores a fixed upfront amount, capped at the total", async () => {
    const { quote } = await bookedBooking({ type: "fixed", cents: 25_000 }, "2027-06-13");
    expect(quote).toMatchObject({ depositType: "fixed", depositFixedCents: 25_000, depositCents: 25_000 });
    const capped = await sendQuote(org, (await createBooking(org, { customerId: customer, eventType: "party", eventDate: null }, owner)).id, { lines, deposit: { type: "fixed", cents: 9_999_999 }, expiresInDays: 14 }, owner, may1);
    expect(capped.depositCents).toBe(capped.totalCents);
  });

  it("keeps old callers (depositBps) working as a percentage", async () => {
    const b = await createBooking(org, { customerId: customer, eventType: "party", eventDate: null }, owner);
    const quote = await sendQuote(org, b.id, { lines, depositBps: 3_000, expiresInDays: 14 }, owner, may1);
    expect(quote).toMatchObject({ depositType: "percentage", depositBps: 3_000, depositCents: 36_300, locale: null });
  });

  it("refuses an impossible deposit with a typed error", async () => {
    const b = await createBooking(org, { customerId: customer, eventType: "party", eventDate: null }, owner);
    await expect(sendQuote(org, b.id, { lines, deposit: { type: "fixed", cents: -5 }, expiresInDays: 14 }, owner, may1)).rejects.toThrow("invalid_amount");
  });
});

describe("customer language", () => {
  it("gives a customer the agency enters the agency's language, not English", async () => {
    const id = await resolveBookingCustomer(org, { mode: "new", name: "Phone Customer", email: `${run}-phone@test.local`, phone: null });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: id! } })).locale).toBe("nl");
  });
});

describe("artist compensation", () => {
  it("copies a fixed fee onto the assignment and keeps percentages as they were", async () => {
    const { booking } = await bookedBooking({ type: "none" }, "2027-07-01");
    await assignArtist(org, booking.id, fixedArtist, owner, may1);
    expect(await prisma.bookingAssignment.findFirstOrThrow({ where: { bookingId: booking.id, status: "pending" } })).toMatchObject({ compensationType: "fixed", fixedFeeCents: 25_000, shareBps: 0 });

    const other = await bookedBooking({ type: "none" }, "2027-07-02");
    await assignArtist(org, other.booking.id, pctArtist, owner, may1);
    expect(await prisma.bookingAssignment.findFirstOrThrow({ where: { bookingId: other.booking.id, status: "pending" } })).toMatchObject({ compensationType: "percentage", fixedFeeCents: null, shareBps: 4_000 });
  });

  it("takes a fee for this booking only, and refuses nonsense", async () => {
    const { booking } = await bookedBooking({ type: "none" }, "2027-07-03");
    await assignArtist(org, booking.id, pctArtist, owner, may1, { type: "fixed", shareBps: 0, fixedCents: 30_000 });
    expect(await prisma.bookingAssignment.findFirstOrThrow({ where: { bookingId: booking.id, status: "pending" } })).toMatchObject({ compensationType: "fixed", fixedFeeCents: 30_000 });
    // The artist's own default is untouched.
    expect(await prisma.artist.findUniqueOrThrow({ where: { id: pctArtist } })).toMatchObject({ compensationType: "percentage", defaultShareBps: 4_000 });
    await expect(assignArtist(org, booking.id, pctArtist, owner, may1, { type: "percentage", shareBps: 12_000, fixedCents: null })).rejects.toThrow("invalid_compensation");
    await expect(assignArtist(org, booking.id, pctArtist, owner, may1, { type: "fixed", shareBps: 0, fixedCents: -1 })).rejects.toThrow("invalid_compensation");
  });

  it("refuses to copy a fixed fee into a booking in another currency", async () => {
    await prisma.artistShare.create({ data: { id: `${run}-share`, organizationId: org, artistId: fixedArtist, partnerOrganizationId: usdOrg, status: "accepted" } });
    const { booking } = await bookedBooking({ type: "none" }, "2027-07-04", usdOrg);
    await expect(assignArtist(usdOrg, booking.id, fixedArtist, owner, may1)).rejects.toThrow("compensation_currency");
    // With an amount for this booking (in its own currency) it works.
    await assignArtist(usdOrg, booking.id, fixedArtist, owner, may1, { type: "fixed", shareBps: 0, fixedCents: 30_000 });
  });
});

describe("invoice numbering", () => {
  it("previews and issues with the agency's prefix and continuous series", async () => {
    await prisma.organization.update({ where: { id: org }, data: { invoiceNumbering: "continuous", invoicePrefix: "OA-" } });
    const { booking } = await bookedBooking({ type: "none" }, "2027-08-01");
    expect(await nextInvoiceNumber(org, may1)).toBe("OA-000001");
    const invoice = await issueInvoice(org, booking.id, owner, may1);
    expect(invoice).toMatchObject({ number: "OA-000001", manualNumber: false });
    expect(await nextInvoiceNumber(org, may1)).toBe("OA-000002");
  });

  it("only accepts typed numbers when the agency allows it, and never twice", async () => {
    const { booking } = await bookedBooking({ type: "none" }, "2027-08-02");
    await expect(issueInvoice(org, booking.id, owner, may1, { manualNumber: "2027-100" })).rejects.toThrow("manual_numbers_off");
    await prisma.organization.update({ where: { id: org }, data: { allowManualInvoiceNumbers: true } });
    await expect(issueInvoice(org, booking.id, owner, may1, { manualNumber: "bad number!" })).rejects.toThrow("invoice_number_invalid");
    await expect(issueInvoice(org, booking.id, owner, may1, { manualNumber: "oa-000001" })).rejects.toThrow("invoice_number_taken");
    const typed = await issueInvoice(org, booking.id, owner, may1, { manualNumber: "oa-000002" });
    expect(typed).toMatchObject({ number: "OA-000002", manualNumber: true });
    expect(await prisma.auditEvent.count({ where: { action: "invoice.manual_number", targetId: typed.id } })).toBe(1);

    // The counter skips the number that was typed instead of reusing it.
    const next = await bookedBooking({ type: "none" }, "2027-08-03");
    expect((await issueInvoice(org, next.booking.id, owner, may1)).number).toBe("OA-000003");
  });

  it("gives two simultaneous typed issues of one number to one invoice only", async () => {
    const [one, two] = [await bookedBooking({ type: "none" }, "2027-08-04"), await bookedBooking({ type: "none" }, "2027-08-05")];
    const results = await Promise.allSettled([
      issueInvoice(org, one.booking.id, owner, may1, { manualNumber: "RACE-1" }),
      issueInvoice(org, two.booking.id, owner, may1, { manualNumber: "RACE-1" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const failure = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(String(failure.reason)).toContain("invoice_number_taken");
    expect(await prisma.invoice.count({ where: { organizationId: org, number: "RACE-1" } })).toBe(1);
  });

  it("keeps the original yearly numbers for agencies that change nothing", async () => {
    const { booking } = await bookedBooking({ type: "none" }, "2027-06-20", usdOrg);
    expect((await issueInvoice(usdOrg, booking.id, owner, may1)).number).toBe("2027-0001");
  });
});

describe("artist notifications", () => {
  it("tells the artist about a request, about being taken off it, and about a cancellation", async () => {
    const otherUser = `${run}-artist2`;
    await prisma.user.create({ data: { id: otherUser, name: "Artist 2", email: `${run}-ar2@test.local` } });
    await prisma.member.create({ data: { id: `${run}-m4`, organizationId: org, userId: otherUser, role: "artist" } });
    await prisma.artist.create({ data: { id: `${run}-second`, organizationId: org, userId: otherUser, stageName: "DJ Second", genres: [] } });
    const count = (userId: string, type: string) => prisma.notification.count({ where: { userId, type } });

    const { booking } = await bookedBooking({ type: "none" }, "2027-09-01");
    const first = await assignArtist(org, booking.id, fixedArtist, owner, may1);
    expect(first.withdrawnIds).toEqual([]);
    expect(await count(artistUser, "gig_request")).toBeGreaterThanOrEqual(1);

    // Reassigning withdraws the first request and tells that artist.
    const second = await assignArtist(org, booking.id, `${run}-second`, owner, may1);
    expect(second.withdrawnIds).toEqual([first.assignmentId]);
    expect(await count(artistUser, "gig_withdrawn")).toBe(1);
    expect(await prisma.bookingAssignment.findUniqueOrThrow({ where: { id: first.assignmentId } })).toMatchObject({ status: "withdrawn" });

    await changeBookingStatus(org, booking.id, "cancel", { actor: "agency", actorId: owner, reason: "Weather" }, may1);
    expect(await count(otherUser, "gig_cancelled")).toBe(1);
    // The first artist was already off the booking: no cancellation notice for them.
    expect(await count(artistUser, "gig_cancelled")).toBe(0);
    expect(await prisma.bookingAssignment.count({ where: { bookingId: booking.id, status: { in: ["pending", "accepted"] } } })).toBe(0);

    await prisma.notification.deleteMany({ where: { userId: { in: [artistUser, otherUser] } } });
    await prisma.bookingAssignment.deleteMany({ where: { bookingId: booking.id } });
    await prisma.artist.delete({ where: { id: `${run}-second` } });
    await prisma.user.delete({ where: { id: otherUser } });
  });
});

describe("moving a booking", () => {
  it("refuses a new date on which the assigned artist already plays", async () => {
    const one = await bookedBooking({ type: "none" }, "2027-10-01");
    const two = await bookedBooking({ type: "none" }, "2027-10-02");
    await assignArtist(org, one.booking.id, pctArtist, owner, may1);
    await assignArtist(org, two.booking.id, pctArtist, owner, may1);
    await expect(updateBookingDetails(org, two.booking.id, { eventDate: new Date("2027-10-01T00:00:00Z") }, owner)).rejects.toThrow("artist_unavailable");
    // Another free date is fine.
    await updateBookingDetails(org, two.booking.id, { eventDate: new Date("2027-10-03T00:00:00Z") }, owner);
  });
});
