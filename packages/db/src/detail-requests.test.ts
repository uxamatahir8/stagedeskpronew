import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { acceptQuote, createBooking, sendQuote, updateBookingDetails } from "./bookings";
import { prisma } from "./client";
import { createDetailRequest, detailRequestByToken, type DetailInput, openDetailRequest, revokeDetailRequests, submitDetailRequest } from "./detail-requests";

/** Client feedback CF-07: the customer fills in the event details through a private link. */
const run = `dr${Date.now().toString(36)}`;
const org = `${run}-a`;
const other = `${run}-b`;
const owner = `${run}-owner`;
const customer = `${run}-cust`;
const now = new Date("2027-04-01T10:00:00Z");

const input = (extra: Partial<DetailInput> = {}): DetailInput => ({
  eventType: "wedding",
  eventDate: "2027-08-14",
  startTime: "20:00",
  endTime: "01:00",
  venueName: "Kasteel de Haar",
  venueAddress: "Kasteellaan 1",
  venueCity: "Haarzuilens",
  guestCount: 120,
  partnerName: "Tom",
  preferredGenre: "Disco",
  playlistUrl: null,
  notes: "First dance at 21:00",
  phone: "0612345678",
  ...extra,
});

beforeAll(async () => {
  await prisma.organization.createMany({ data: [{ id: org, name: "Details Agency", slug: `${run}-a` }, { id: other, name: "Other", slug: `${run}-b` }] });
  await prisma.user.createMany({ data: [{ id: owner, name: "Owner", email: `${run}-o@test.local` }, { id: customer, name: "Sanne", email: `${run}-c@test.local` }] });
  await prisma.member.createMany({ data: [{ id: `${run}-m1`, organizationId: org, userId: owner, role: "agency_owner" }] });
});

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { userId: { in: [owner, customer] } } });
  await prisma.booking.deleteMany({ where: { organizationId: { in: [org, other] } } });
  await prisma.organization.deleteMany({ where: { id: { in: [org, other] } } });
  await prisma.user.deleteMany({ where: { id: { in: [owner, customer] } } });
  await prisma.$disconnect();
});

const phoneBooking = () => createBooking(org, { customerId: customer, eventType: "party", eventDate: null }, owner);

describe("booking details link", () => {
  it("stores only a hash, fills in the booking once and tells the agency", async () => {
    const booking = await phoneBooking();
    const { token } = await createDetailRequest(org, booking.id, owner, { locale: "nl" }, now);
    expect(await prisma.bookingDetailRequest.count({ where: { tokenHash: token } })).toBe(0);
    const view = await detailRequestByToken(token, now);
    expect(view).toMatchObject({ locale: "nl", customer: { name: "Sanne", hasPhone: false }, fields: { eventType: "party", eventDate: null } });

    expect(await submitDetailRequest(token, input(), now)).toEqual({ kept: [] });
    const saved = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(saved).toMatchObject({ eventType: "wedding", venueCity: "Haarzuilens", guestCount: 120, message: "First dance at 21:00", status: "inquiry" });
    expect(saved.eventDate?.toISOString().slice(0, 10)).toBe("2027-08-14");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: customer } })).phone).toBe("0612345678");
    expect(await prisma.notification.count({ where: { userId: owner, type: "details_submitted" } })).toBe(1);

    // Used once: a second submit and the page itself no longer work.
    expect(await submitDetailRequest(token, input({ venueCity: "Elsewhere" }), now)).toBeNull();
    expect(await detailRequestByToken(token, now)).toBeNull();
  });

  it("stops working when revoked, replaced or expired", async () => {
    const booking = await phoneBooking();
    const first = await createDetailRequest(org, booking.id, owner, { locale: "en", days: 2 }, now);
    const second = await createDetailRequest(org, booking.id, owner, { locale: "en", days: 2 }, now);
    expect(await detailRequestByToken(first.token, now)).toBeNull();
    expect(await detailRequestByToken(second.token, now)).not.toBeNull();
    expect(await detailRequestByToken(second.token, new Date(now.getTime() + 3 * 86_400_000))).toBeNull();
    expect(await openDetailRequest(org, booking.id, now)).not.toBeNull();
    expect(await revokeDetailRequests(org, booking.id, owner, now)).toBe(1);
    expect(await submitDetailRequest(second.token, input(), now)).toBeNull();
    expect(await detailRequestByToken("not-a-real-token-but-long-enough", now)).toBeNull();
  });

  it("keeps what the agency changed after sending the link", async () => {
    const booking = await phoneBooking();
    const { token } = await createDetailRequest(org, booking.id, owner, { locale: "nl" }, now);
    await updateBookingDetails(org, booking.id, { venueCity: "Utrecht", eventDate: null }, owner);
    const result = await submitDetailRequest(token, input(), now);
    expect(result?.kept).toEqual(["venueCity"]);
    expect(await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).toMatchObject({ venueCity: "Utrecht", venueName: "Kasteel de Haar" });
  });

  it("never touches a booking with an accepted quote", async () => {
    const booking = await phoneBooking();
    const { token } = await createDetailRequest(org, booking.id, owner, { locale: "nl" }, now);
    const quote = await sendQuote(org, booking.id, { lines: [{ description: "DJ", quantityHundredths: 100, unitPriceCents: 10_000, vatBps: 2_100 }], depositBps: 0, expiresInDays: 14 }, owner, now);
    await acceptQuote(org, quote.id, { actor: "agency", actorId: owner, name: "Phone" }, now);
    expect(await detailRequestByToken(token, now)).toBeNull();
    expect(await submitDetailRequest(token, input(), now)).toBeNull();
    await expect(createDetailRequest(org, booking.id, owner, { locale: "nl" }, now)).rejects.toThrow("invalid_status");
  });

  it("can't be made for another agency's booking", async () => {
    const booking = await phoneBooking();
    await expect(createDetailRequest(other, booking.id, owner, { locale: "nl" }, now)).rejects.toThrow("not_found");
  });
});
