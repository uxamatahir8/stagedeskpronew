import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "./client";
import { agencyFullyBookedDates, submitInquiry } from "./inquiries";

const run = `i${Date.now().toString(36)}`;
const org = `${run}-org`;
const other = `${run}-other`;
const staffUser = `${run}-staff`;
const artists = [`${run}-a1`, `${run}-a2`];

const base = {
  name: "Femke Visser",
  email: `${run}-femke@test.local`,
  phone: "+31 6 1111 2222",
  locale: "nl" as const,
  eventType: "wedding" as const,
  eventDate: "2027-09-04",
  startTime: "20:00",
  venueName: "Kasteel",
  venueCity: "Haarzuilens",
  guestCount: 120,
  budgetRange: "1500_2500",
  preferredArtistId: null,
  preferredGenre: "House",
  partnerName: "Bram",
  ceremony: true,
  message: "Graag een dj met sax.",
};

beforeAll(async () => {
  await prisma.organization.createMany({
    data: [
      { id: org, name: "Agency", slug: `${run}-agency` },
      { id: other, name: "Closed", slug: `${run}-closed`, bookingPageEnabled: false },
    ],
  });
  await prisma.user.create({ data: { id: staffUser, name: "Staff", email: `${run}-staff@test.local` } });
  await prisma.member.create({ data: { id: randomUUID(), organizationId: org, userId: staffUser, role: "agency_staff" } });
  await prisma.artist.createMany({
    data: artists.map((id, i) => ({ id, organizationId: org, stageName: `DJ ${i}`, genres: [], showOnBookingPage: i === 0 })),
  });
});

afterAll(async () => {
  await prisma.booking.deleteMany({ where: { organizationId: { in: [org, other] } } });
  await prisma.organization.deleteMany({ where: { id: { in: [org, other] } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: run } } });
  await prisma.$disconnect();
});

describe("submitInquiry", () => {
  it("creates the customer, links them to the agency and opens an inquiry", async () => {
    const result = await submitInquiry(`${run}-agency`, { ...base, preferredArtistId: artists[0]! });
    expect(result?.newAccount).toBe(true);
    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: result!.booking.id } });
    expect(booking).toMatchObject({
      status: "inquiry",
      source: "booking_page",
      organizationId: org,
      partnerName: "Bram",
      ceremony: true,
      budgetRange: "1500_2500",
      preferredArtistId: artists[0],
    });
    const member = await prisma.member.findFirst({ where: { organizationId: org, userId: result!.customerId } });
    expect(member?.role).toBe("customer");
  });

  it("reuses an existing account without changing its name or adding a second membership", async () => {
    const result = await submitInquiry(`${run}-agency`, { ...base, name: "Someone Else", eventType: "party" });
    expect(result?.newAccount).toBe(false);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: result!.customerId } });
    expect(user.name).toBe("Femke Visser");
    expect(await prisma.member.count({ where: { organizationId: org, userId: user.id } })).toBe(1);
    // Wedding-only fields are dropped for other event types.
    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: result!.booking.id } });
    expect(booking.partnerName).toBeNull();
  });

  it("doesn't turn a staff member into a customer", async () => {
    await submitInquiry(`${run}-agency`, { ...base, email: `${run}-staff@test.local` });
    const member = await prisma.member.findFirstOrThrow({ where: { organizationId: org, userId: staffUser } });
    expect(member.role).toBe("agency_staff");
  });

  it("ignores artists that aren't on the booking page and unknown budget keys", async () => {
    const result = await submitInquiry(`${run}-agency`, { ...base, preferredArtistId: artists[1]!, budgetRange: "free" });
    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: result!.booking.id } });
    expect(booking.preferredArtistId).toBeNull();
    expect(booking.budgetRange).toBeNull();
  });

  it("returns null for unknown or disabled booking pages", async () => {
    expect(await submitInquiry(`${run}-nope`, base)).toBeNull();
    expect(await submitInquiry(`${run}-closed`, base)).toBeNull();
  });
});

describe("agencyFullyBookedDates", () => {
  it("marks a date fully booked only when every artist is busy", async () => {
    const day = new Date("2027-10-01T00:00:00Z");
    await prisma.artistUnavailability.create({ data: { id: randomUUID(), organizationId: org, artistId: artists[0]!, date: day } });
    expect(await agencyFullyBookedDates(org, "2027-09-01", "2027-10-31")).toEqual([]);
    await prisma.artistUnavailability.create({ data: { id: randomUUID(), organizationId: org, artistId: artists[1]!, date: day } });
    expect(await agencyFullyBookedDates(org, "2027-09-01", "2027-10-31")).toEqual(["2027-10-01"]);
  });
});
