import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { artistAdminDetail, deactivateArtist, deleteArtistProfile, relinkArtistUser, revokeArtistShares, unlinkArtistUser } from "./artist-admin";
import { acceptQuote, assignArtist, createBooking, respondToAssignment, sendQuote } from "./bookings";
import { prisma } from "./client";

/** Client feedback CF-14: platform support can take an artist off gigs, deactivate, fix the link and delete only what has no history. */
const run = `aa${Date.now().toString(36)}`;
const org = `${run}-a`;
const partner = `${run}-b`;
const owner = `${run}-owner`;
const customer = `${run}-cust`;
const artistUser = `${run}-artist`;
const otherUser = `${run}-other`;
const admin = `${run}-admin`;
const artist = `${run}-dj`;
const may1 = new Date("2027-05-01T10:00:00Z");
const lines = [{ description: "DJ", quantityHundredths: 100, unitPriceCents: 50_000, vatBps: 2_100 }];

beforeAll(async () => {
  await prisma.organization.createMany({ data: [{ id: org, name: "Admin Agency", slug: `${run}-a` }, { id: partner, name: "Partner", slug: `${run}-b` }] });
  await prisma.user.createMany({
    data: [
      { id: owner, name: "Owner", email: `${run}-o@test.local` },
      { id: customer, name: "Customer", email: `${run}-c@test.local` },
      { id: artistUser, name: "Artist", email: `${run}-ar@test.local` },
      { id: otherUser, name: "Right Account", email: `${run}-right@test.local` },
      { id: admin, name: "Admin", email: `${run}-admin@test.local`, platformRole: "platform_admin" },
    ],
  });
  await prisma.member.createMany({
    data: [
      { id: `${run}-m1`, organizationId: org, userId: owner, role: "agency_owner" },
      { id: `${run}-m2`, organizationId: org, userId: artistUser, role: "artist" },
    ],
  });
  await prisma.artist.create({ data: { id: artist, organizationId: org, userId: artistUser, stageName: "DJ Support", genres: [], lendable: true } });
  await prisma.artistShare.create({ data: { id: `${run}-s`, organizationId: org, artistId: artist, partnerOrganizationId: partner, status: "accepted" } });
});

afterAll(async () => {
  const orgs = [org, partner];
  await prisma.notification.deleteMany({ where: { userId: { in: [owner, customer, artistUser, otherUser, admin] } } });
  await prisma.auditEvent.deleteMany({ where: { actorId: admin } });
  await prisma.bookingAssignment.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.booking.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgs } } });
  await prisma.user.deleteMany({ where: { id: { in: [owner, customer, artistUser, otherUser, admin] } } });
  await prisma.$disconnect();
});

describe("artist support", () => {
  it("refuses to deactivate an artist on upcoming gigs, then withdraws them and the booking goes back to booked", async () => {
    const booking = await createBooking(org, { customerId: customer, eventType: "party", eventDate: "2027-06-01" }, owner);
    const quote = await sendQuote(org, booking.id, { lines, depositBps: 0, expiresInDays: 14 }, owner, may1);
    await acceptQuote(org, quote.id, { actor: "agency", actorId: owner, name: "Phone" }, may1);
    const { assignmentId } = await assignArtist(org, booking.id, artist, owner, may1);
    await respondToAssignment(assignmentId, artistUser, { accept: true }, may1);
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe("confirmed");

    await expect(deactivateArtist(artist, admin, "Left the agency")).rejects.toThrow("has_upcoming");
    await expect(deactivateArtist(artist, admin, "  ")).rejects.toThrow("reason_required");
    await deactivateArtist(artist, admin, "Left the agency", { withdraw: true });

    expect((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe("booked");
    expect(await prisma.bookingAssignment.findUniqueOrThrow({ where: { id: assignmentId } })).toMatchObject({ status: "withdrawn" });
    expect(await prisma.artist.findUniqueOrThrow({ where: { id: artist } })).toMatchObject({ active: false, showOnBookingPage: false, lendable: false });
    expect(await prisma.notification.count({ where: { userId: artistUser, type: "gig_withdrawn" } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { actorId: admin, action: { in: ["artist.withdraw", "artist.deactivate"] }, targetId: artist } })).toBe(2);
    // History is kept and the profile can't be deleted.
    await expect(deleteArtistProfile(artist, admin, "cleanup")).rejects.toThrow("has_history");
    expect((await artistAdminDetail(artist))?.history.assignments).toBe(1);
  });

  it("revokes sharing", async () => {
    expect(await revokeArtistShares(artist, admin, "No longer lent")).toBe(1);
    expect(await prisma.artistShare.findUniqueOrThrow({ where: { id: `${run}-s` } })).toMatchObject({ status: "revoked" });
  });

  it("fixes a wrong account link and moves the artist membership", async () => {
    await expect(relinkArtistUser(artist, `${run}-admin@test.local`, admin, "fix")).rejects.toThrow("user_not_allowed");
    await expect(relinkArtistUser(artist, `${run}-o@test.local`, admin, "fix")).rejects.toThrow("user_not_allowed");
    await expect(relinkArtistUser(artist, "nobody@test.local", admin, "fix")).rejects.toThrow("user_not_found");
    await relinkArtistUser(artist, `${run}-right@test.local`, admin, "Linked to the wrong email");
    expect((await prisma.artist.findUniqueOrThrow({ where: { id: artist } })).userId).toBe(otherUser);
    expect(await prisma.member.count({ where: { organizationId: org, userId: otherUser, role: "artist" } })).toBe(1);
    expect(await prisma.member.count({ where: { organizationId: org, userId: artistUser } })).toBe(0);

    await unlinkArtistUser(artist, admin, "Account closed");
    expect((await prisma.artist.findUniqueOrThrow({ where: { id: artist } })).userId).toBeNull();
    expect(await prisma.member.count({ where: { organizationId: org, userId: otherUser } })).toBe(0);
  });

  it("deletes a profile without history for good", async () => {
    await prisma.artist.create({ data: { id: `${run}-fresh`, organizationId: org, stageName: "Never used", genres: [] } });
    await deleteArtistProfile(`${run}-fresh`, admin, "Created by mistake");
    expect(await prisma.artist.count({ where: { id: `${run}-fresh` } })).toBe(0);
  });
});
