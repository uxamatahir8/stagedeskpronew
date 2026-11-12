import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { conflictFingerprint, changeConflicts, quoteEventSnapshot } from "@stagedesk/core";
import { grantPlan } from "./agencies";
import { currentArtistIds, isLiveArtistOnBooking, liveAssignmentOnBooking, reachableArtistUserIds } from "./artist-access";
import { artistAccountState, artistCanBeAssigned, unlinkRemovedMember } from "./artist-accounts";
import { agencyUsage } from "./billing";
import { acceptQuote, assignArtist, changeBookingStatus, createBooking, respondToAssignment, sendQuote, updateBookingDetails } from "./bookings";
import { prisma } from "./client";
import { CustomerEventError, decideChangeRequest, submitEventChange, withdrawChangeRequest } from "./customer-event";
import { resolveEquipmentAccess } from "./equipment-access";
import { artistGigs, pendingGigCount } from "./gigs";
import { agencyTakesRequests, CustomerRequestError, submitCustomerRequest } from "./inquiries";
import { conversations, threadParticipants } from "./messages";
import { seedPlans } from "./seed-plans";

/**
 * The independent review's findings, against the database: one artist access
 * policy, change requests that can't overwrite newer values, booking requests
 * that only the form's key can make duplicates of, and the subscription rules.
 */

const run = `ph-${Date.now().toString(36)}`;
const orgA = `${run}-a`;
const orgB = `${run}-b`;
const owner = `${run}-owner`;
const staffer = `${run}-staffer`;
const customer = `${run}-customer`;
const line = { description: "DJ", quantityHundredths: 100, unitPriceCents: 100_000, vatBps: 2100 };
const future = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
const details = (over: Record<string, string | number | null> = {}) => ({ eventType: "wedding", eventDate: future(100), startTime: "20:00", endTime: "23:00", venueName: "Tivoli", venueAddress: null, venueCity: "Utrecht", guestCount: 100, ...over });
const allOrgs = [orgA, orgB];
let n = 0;

async function bookedBooking(eventDate: string | null = future(100), org = orgA) {
  const booking = await createBooking(org, { customerId: customer, eventType: "wedding", eventDate, startTime: "20:00", endTime: "23:00", venueName: "Tivoli", venueCity: "Utrecht", guestCount: 100 }, owner);
  const quote = await sendQuote(org, booking.id, { lines: [line], depositBps: 0, expiresInDays: 14 }, owner);
  await acceptQuote(org, quote.id, { actor: "customer", actorId: customer, name: "Klant" });
  return booking;
}

/** An artist at orgA, also an artist at orgB when `both`. */
async function artistAt(opts: { both?: boolean } = {}) {
  const id = `${run}-u${n++}`;
  await prisma.user.create({ data: { id, name: id, email: `${id}@test.local`, emailVerified: true } });
  await prisma.account.create({ data: { id: `${id}-acc`, accountId: id, providerId: "credential", userId: id, password: "x" } });
  await prisma.member.create({ data: { id: `${id}-ma`, organizationId: orgA, userId: id, role: "artist" } });
  const artistA = `${id}-a`;
  await prisma.artist.create({ data: { id: artistA, organizationId: orgA, userId: id, stageName: `DJ ${id}`, genres: [], defaultShareBps: 4000 } });
  let artistB: string | null = null;
  if (opts.both) {
    await prisma.member.create({ data: { id: `${id}-mb`, organizationId: orgB, userId: id, role: "artist" } });
    artistB = `${id}-b`;
    await prisma.artist.create({ data: { id: artistB, organizationId: orgB, userId: id, stageName: `DJ ${id} B`, genres: [], defaultShareBps: 4000 } });
  }
  return { userId: id, artistA, artistB };
}

/** Everything an artist could reach on a booking, each through its real service. */
async function reach(userId: string, code: string, bookingId: string) {
  const { requests, upcoming } = await artistGigs(userId);
  const listed = [...requests, ...upcoming].some((g) => g.booking.trackingCode === code);
  const detail = await prisma.bookingAssignment.count({ where: liveAssignmentOnBooking(userId, code) });
  const equipment = await resolveEquipmentAccess({ userId, organizationId: null, permissions: ["artist.gigs"] }, code, "artist");
  return { listed, detail: detail > 0, equipment: equipment !== null, messages: await isLiveArtistOnBooking(userId, bookingId) };
}
const everything = { listed: true, detail: true, equipment: true, messages: true };
const nothing = { listed: false, detail: false, equipment: false, messages: false };

beforeAll(async () => {
  await seedPlans(prisma);
  await prisma.user.createMany({ data: [owner, staffer, customer].map((id) => ({ id, name: id, email: `${id}@test.local`, emailVerified: true })) });
  await prisma.organization.createMany({ data: allOrgs.map((id) => ({ id, name: id, slug: id })) });
  await prisma.member.createMany({
    data: [
      { id: `${run}-m1`, organizationId: orgA, userId: owner, role: "agency_owner" },
      { id: `${run}-m2`, organizationId: orgA, userId: staffer, role: "agency_staff" },
      { id: `${run}-m3`, organizationId: orgA, userId: customer, role: "customer" },
      { id: `${run}-m4`, organizationId: orgB, userId: owner, role: "agency_owner" },
    ],
  });
  await grantPlan(orgA, "business");
  await grantPlan(orgB, "business");
}, 60_000);

afterAll(async () => {
  const bookings = await prisma.booking.findMany({ where: { organizationId: { in: allOrgs } }, select: { id: true } });
  const ids = bookings.map((b) => b.id);
  await prisma.bookingAssignment.deleteMany({ where: { bookingId: { in: ids } } });
  await prisma.bookingChangeRequest.deleteMany({ where: { bookingId: { in: ids } } });
  await prisma.bookingEvent.deleteMany({ where: { bookingId: { in: ids } } });
  await prisma.quoteItem.deleteMany({ where: { organizationId: { in: allOrgs } } });
  await prisma.quote.deleteMany({ where: { organizationId: { in: allOrgs } } });
  await prisma.booking.deleteMany({ where: { id: { in: ids } } });
  await prisma.artistShare.deleteMany({ where: { organizationId: { in: allOrgs } } });
  await prisma.artist.deleteMany({ where: { organizationId: { in: allOrgs } } });
  await prisma.member.deleteMany({ where: { organizationId: { in: allOrgs } } });
  await prisma.subscription.deleteMany({ where: { organizationId: { in: allOrgs } } });
  await prisma.auditEvent.deleteMany({ where: { agencyId: { in: allOrgs } } });
  await prisma.organization.deleteMany({ where: { id: { in: allOrgs } } });
  await prisma.notification.deleteMany({ where: { userId: { startsWith: run } } });
  await prisma.account.deleteMany({ where: { userId: { startsWith: run } } });
  await prisma.user.deleteMany({ where: { id: { startsWith: run } } });
});

describe("one artist access policy", () => {
  it("gives an artist their gig everywhere, whichever agency is active", async () => {
    const a = await artistAt();
    const booking = await bookedBooking(future(101));
    await assignArtist(orgA, booking.id, a.artistA, owner);
    expect(await reach(a.userId, booking.trackingCode, booking.id)).toEqual(everything);
    // The equipment check ignores the active agency for an artist.
    expect(await resolveEquipmentAccess({ userId: a.userId, organizationId: orgB, permissions: ["artist.gigs"] }, booking.trackingCode, "artist")).not.toBeNull();
  });

  it("gives a shared artist the other agency's gig", async () => {
    const a = await artistAt();
    await prisma.artistShare.create({ data: { id: `${a.userId}-s`, organizationId: orgA, artistId: a.artistA, partnerOrganizationId: orgB, status: "accepted" } });
    const booking = await bookedBooking(future(102), orgB);
    await assignArtist(orgB, booking.id, a.artistA, owner);
    expect(await reach(a.userId, booking.trackingCode, booking.id)).toEqual(everything);
  });

  it("ends access when the role changes to staff, also while they're still an artist elsewhere", async () => {
    const a = await artistAt({ both: true });
    const atA = await bookedBooking(future(103));
    const { assignmentId } = await assignArtist(orgA, atA.id, a.artistA, owner);
    const atB = await bookedBooking(future(104), orgB);
    await assignArtist(orgB, atB.id, a.artistB!, owner);
    expect(await reach(a.userId, atA.trackingCode, atA.id)).toEqual(everything);

    await prisma.member.update({ where: { id: `${a.userId}-ma` }, data: { role: "agency_staff" } });

    expect(await reach(a.userId, atA.trackingCode, atA.id)).toEqual(nothing);
    // Their work at the other agency is untouched.
    expect(await reach(a.userId, atB.trackingCode, atB.id)).toEqual(everything);
    // Calling the answer directly is refused too, and changes nothing.
    await expect(respondToAssignment(assignmentId, a.userId, { accept: true })).rejects.toThrow("no_open_assignment");
    expect((await prisma.bookingAssignment.findUniqueOrThrow({ where: { id: assignmentId } })).status).toBe("pending");
    expect(await artistAccountState(a.artistA)).toBe("not_member");
    expect(artistCanBeAssigned("not_member")).toBe(false);
  });

  it("restores access when the artist role comes back: the link was kept", async () => {
    const a = await artistAt();
    const booking = await bookedBooking(future(105));
    await assignArtist(orgA, booking.id, a.artistA, owner);
    await prisma.member.update({ where: { id: `${a.userId}-ma` }, data: { role: "agency_staff" } });
    expect(await reach(a.userId, booking.trackingCode, booking.id)).toEqual(nothing);
    await prisma.member.update({ where: { id: `${a.userId}-ma` }, data: { role: "artist" } });
    expect(await reach(a.userId, booking.trackingCode, booking.id)).toEqual(everything);
  });

  it("ends access for a disabled account", async () => {
    const a = await artistAt();
    const booking = await bookedBooking(future(106));
    const { assignmentId } = await assignArtist(orgA, booking.id, a.artistA, owner);
    await prisma.user.update({ where: { id: a.userId }, data: { disabledAt: new Date() } });
    expect(await reach(a.userId, booking.trackingCode, booking.id)).toEqual(nothing);
    expect(await pendingGigCount(a.userId)).toBe(0);
    await expect(respondToAssignment(assignmentId, a.userId, { accept: true })).rejects.toThrow("no_open_assignment");
  });

  it("ends access to open gigs for a deactivated profile, keeping its history", async () => {
    const a = await artistAt();
    const booking = await bookedBooking(future(107));
    await assignArtist(orgA, booking.id, a.artistA, owner);
    await prisma.artist.update({ where: { id: a.artistA }, data: { active: false } });
    expect(await reach(a.userId, booking.trackingCode, booking.id)).toEqual(nothing);
    expect(await artistAccountState(a.artistA)).toBe("inactive");
    // Earnings still count: they did that work.
    expect(await currentArtistIds(a.userId)).toContain(a.artistA);
  });

  it("ends access when the profile is unlinked, and keeps the assignment on record", async () => {
    const a = await artistAt();
    const booking = await bookedBooking(future(108));
    const { assignmentId } = await assignArtist(orgA, booking.id, a.artistA, owner);
    await unlinkRemovedMember(orgA, a.userId);
    expect(await reach(a.userId, booking.trackingCode, booking.id)).toEqual(nothing);
    expect(await prisma.bookingAssignment.count({ where: { id: assignmentId } })).toBe(1);
    expect(await currentArtistIds(a.userId)).not.toContain(a.artistA);
  });

  it("ends access to a withdrawn assignment", async () => {
    const a = await artistAt();
    const other = await artistAt();
    const booking = await bookedBooking(future(109));
    const first = await assignArtist(orgA, booking.id, a.artistA, owner);
    await assignArtist(orgA, booking.id, other.artistA, owner);
    expect(await reach(a.userId, booking.trackingCode, booking.id)).toEqual(nothing);
    await expect(respondToAssignment(first.assignmentId, a.userId, { accept: true })).rejects.toThrow("no_open_assignment");
  });

  it("doesn't reach or message someone who lost access", async () => {
    const a = await artistAt();
    const booking = await bookedBooking(future(110));
    await assignArtist(orgA, booking.id, a.artistA, owner);
    expect(await reachableArtistUserIds(booking.id)).toEqual([a.userId]);
    expect((await threadParticipants(booking.id, "artist")).other).toBe(a.userId);
    await prisma.member.update({ where: { id: `${a.userId}-ma` }, data: { role: "agency_staff" } });
    expect(await reachableArtistUserIds(booking.id)).toEqual([]);
    expect((await threadParticipants(booking.id, "artist")).other).toBeNull();
    await prisma.bookingMessage.create({ data: { id: `${a.userId}-msg`, organizationId: orgA, bookingId: booking.id, channel: "artist", authorId: owner, body: "Hallo" } });
    expect((await conversations({ userId: a.userId, artistUserId: a.userId })).map((c) => c.booking.id)).not.toContain(booking.id);
    await prisma.bookingMessage.delete({ where: { id: `${a.userId}-msg` } });
  });

  it("doesn't let one artist act on another's assignment", async () => {
    const a = await artistAt();
    const other = await artistAt();
    const booking = await bookedBooking(future(111));
    const { assignmentId } = await assignArtist(orgA, booking.id, a.artistA, owner);
    expect(await reach(other.userId, booking.trackingCode, booking.id)).toEqual(nothing);
    await expect(respondToAssignment(assignmentId, other.userId, { accept: true })).rejects.toThrow("no_open_assignment");
  });
});

describe("change requests can't overwrite newer values", () => {
  const dateOf = async (id: string) => (await prisma.booking.findUniqueOrThrow({ where: { id } })).eventDate?.toISOString().slice(0, 10);
  const statusOf = async (id: string) => (await prisma.bookingChangeRequest.findUniqueOrThrow({ where: { id } })).status;
  const moveDate = (bookingId: string, date: string) => updateBookingDetails(orgA, bookingId, { eventDate: new Date(`${date}T00:00:00Z`) }, owner);

  it("refuses approval when the date moved after the customer asked, and changes nothing", async () => {
    const booking = await bookedBooking(future(120));
    const { requestId } = await submitEventChange(orgA, booking.id, customer, details({ eventDate: future(125) }), null);
    await moveDate(booking.id, future(130));

    const error = await decideChangeRequest(orgA, requestId!, staffer, { approve: true }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CustomerEventError);
    expect((error as CustomerEventError).code).toBe("stale_change");
    expect((error as CustomerEventError).conflicts).toEqual([{ field: "eventDate", original: future(120), requested: future(125), current: future(130) }]);

    expect(await dateOf(booking.id)).toBe(future(130));
    expect(await statusOf(requestId!)).toBe("pending");
    expect(await prisma.auditEvent.count({ where: { action: "booking.change_conflict", targetId: requestId! } })).toBe(1);
  });

  it("approves when only a field the customer didn't ask about changed", async () => {
    const booking = await bookedBooking(future(121));
    const { requestId } = await submitEventChange(orgA, booking.id, customer, details({ eventDate: future(121), venueCity: "Zeist" }), null);
    await updateBookingDetails(orgA, booking.id, { eventDate: new Date(`${future(121)}T00:00:00Z`), guestCount: 250 }, owner);
    await decideChangeRequest(orgA, requestId!, owner, { approve: true });
    const after = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(after.venueCity).toBe("Zeist");
    expect(after.guestCount).toBe(250);
  });

  it("lets a reviewer apply it after seeing the current values, but only those values", async () => {
    const booking = await bookedBooking(future(122));
    const { requestId } = await submitEventChange(orgA, booking.id, customer, details({ eventDate: future(126) }), null);
    await moveDate(booking.id, future(131));
    const request = await prisma.bookingChangeRequest.findUniqueOrThrow({ where: { id: requestId! } });
    const seen = conflictFingerprint(changeConflicts(request.changes, request.baseline, quoteEventSnapshot(await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } }))));

    // Someone moved it again after the reviewer looked: what they saw no longer holds.
    await moveDate(booking.id, future(132));
    await expect(decideChangeRequest(orgA, requestId!, owner, { approve: true, acknowledge: seen })).rejects.toMatchObject({ code: "stale_change" });
    expect(await dateOf(booking.id)).toBe(future(132));

    const fresh = conflictFingerprint(changeConflicts(request.changes, request.baseline, quoteEventSnapshot(await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } }))));
    const decided = await decideChangeRequest(orgA, requestId!, owner, { approve: true, acknowledge: fresh });
    expect(decided.approved).toBe(true);
    expect(await dateOf(booking.id)).toBe(future(126));
    const audit = await prisma.auditEvent.findFirstOrThrow({ where: { action: "booking.change_approved", targetId: booking.id } });
    expect((audit.data as { overrodeConflicts?: unknown[] }).overrodeConflicts).toHaveLength(1);
  });

  it("can always be refused, also when stale", async () => {
    const booking = await bookedBooking(future(123));
    const { requestId } = await submitEventChange(orgA, booking.id, customer, details({ eventDate: future(127) }), null);
    await moveDate(booking.id, future(133));
    await decideChangeRequest(orgA, requestId!, owner, { approve: false, note: "Staat al vast" });
    expect(await statusOf(requestId!)).toBe("rejected");
    expect(await dateOf(booking.id)).toBe(future(133));
  });

  it("lets one of two simultaneous approvals through", async () => {
    const booking = await bookedBooking(future(140));
    const { requestId } = await submitEventChange(orgA, booking.id, customer, details({ eventDate: future(141) }), null);
    const before = await prisma.notification.count({ where: { userId: customer, type: "change_approved" } });
    const results = await Promise.allSettled([decideChangeRequest(orgA, requestId!, owner, { approve: true }), decideChangeRequest(orgA, requestId!, staffer, { approve: true })]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected" && (r.reason as CustomerEventError).code === "not_pending")).toHaveLength(1);
    expect(await prisma.notification.count({ where: { userId: customer, type: "change_approved" } })).toBe(before + 1);
  });

  it("gives one answer when approval and refusal cross", async () => {
    const booking = await bookedBooking(future(142));
    const { requestId } = await submitEventChange(orgA, booking.id, customer, details({ eventDate: future(143) }), null);
    const results = await Promise.allSettled([decideChangeRequest(orgA, requestId!, owner, { approve: true }), decideChangeRequest(orgA, requestId!, staffer, { approve: false })]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const status = await statusOf(requestId!);
    expect(await dateOf(booking.id)).toBe(status === "approved" ? future(143) : future(142));
  });

  it("gives one outcome when the customer withdraws during approval", async () => {
    const booking = await bookedBooking(future(144));
    const { requestId } = await submitEventChange(orgA, booking.id, customer, details({ eventDate: future(145) }), null);
    const results = await Promise.allSettled([decideChangeRequest(orgA, requestId!, owner, { approve: true }), withdrawChangeRequest(orgA, requestId!, customer)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const status = await statusOf(requestId!);
    expect(["approved", "withdrawn"]).toContain(status);
    expect(await dateOf(booking.id)).toBe(status === "approved" ? future(145) : future(144));
  });

  it("refuses to approve a request the customer has replaced", async () => {
    const booking = await bookedBooking(future(146));
    const first = await submitEventChange(orgA, booking.id, customer, details({ eventDate: future(147) }), null);
    const second = await submitEventChange(orgA, booking.id, customer, details({ eventDate: future(148) }), null);
    await expect(decideChangeRequest(orgA, first.requestId!, owner, { approve: true })).rejects.toMatchObject({ code: "not_pending" });
    await decideChangeRequest(orgA, second.requestId!, owner, { approve: true });
    expect(await dateOf(booking.id)).toBe(future(148));
  });

  it("gives one outcome when the booking is cancelled during approval", async () => {
    const booking = await bookedBooking(future(149));
    const { requestId } = await submitEventChange(orgA, booking.id, customer, details({ eventDate: future(150) }), null);
    const results = await Promise.allSettled([decideChangeRequest(orgA, requestId!, owner, { approve: true }), changeBookingStatus(orgA, booking.id, "cancel", { actor: "agency", actorId: owner })]);
    expect(results[1]!.status).toBe("fulfilled");
    const after = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(after.status).toBe("cancelled");
    expect(["approved", "superseded"]).toContain(await statusOf(requestId!));
  });

  it("retried after a lost answer, changes nothing more", async () => {
    const booking = await bookedBooking(future(151));
    const { requestId } = await submitEventChange(orgA, booking.id, customer, details({ eventDate: future(152) }), null);
    await decideChangeRequest(orgA, requestId!, owner, { approve: true });
    await moveDate(booking.id, future(153));
    await expect(decideChangeRequest(orgA, requestId!, owner, { approve: true })).rejects.toMatchObject({ code: "not_pending" });
    expect(await dateOf(booking.id)).toBe(future(153));
  });

  it("refuses a requested date that has passed while it waited", async () => {
    const booking = await bookedBooking(future(154));
    const { requestId } = await submitEventChange(orgA, booking.id, customer, details({ eventDate: future(155) }), null);
    const later = new Date(Date.now() + 200 * 86_400_000);
    await expect(decideChangeRequest(orgA, requestId!, owner, { approve: true }, later)).rejects.toMatchObject({ code: "invalid_date" });
    expect(await statusOf(requestId!)).toBe("pending");
  });

  it("keeps the money and the accepted quote as they were", async () => {
    const booking = await bookedBooking(future(156));
    const before = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    const quote = await prisma.quote.findFirstOrThrow({ where: { bookingId: booking.id, status: "accepted" } });
    const { requestId } = await submitEventChange(orgA, booking.id, customer, details({ eventDate: future(157), guestCount: 300 }), null);
    await decideChangeRequest(orgA, requestId!, owner, { approve: true });
    const after = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(after.totalCents).toBe(before.totalCents);
    expect(after.depositCents).toBe(before.depositCents);
    expect(after.status).toBe(before.status);
    const quoteAfter = await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } });
    expect(quoteAfter.status).toBe("accepted");
    expect(quoteAfter.eventSnapshot).toEqual(quote.eventSnapshot);
  });
});

describe("booking request duplicates", () => {
  const request = (key: string, over: Partial<Parameters<typeof submitCustomerRequest>[2]> = {}) => ({
    clientRequestId: `${run}-${key}`,
    eventType: "party" as const,
    eventDate: future(200),
    startTime: "20:00",
    venueName: "Tivoli",
    venueCity: "Utrecht",
    guestCount: 50,
    budgetRange: null,
    preferredArtistId: null,
    preferredGenre: null,
    partnerName: null,
    ceremony: null,
    message: null,
    ...over,
  });

  it("returns the first booking for the same key: a double click or a retry", async () => {
    const first = await submitCustomerRequest(orgA, customer, request("retry"));
    const again = await submitCustomerRequest(orgA, customer, request("retry"));
    expect(first.duplicate).toBe(false);
    expect(again.duplicate).toBe(true);
    expect(again.booking.id).toBe(first.booking.id);
  });

  it("makes one booking from three simultaneous submits", async () => {
    const results = await Promise.all([submitCustomerRequest(orgA, customer, request("three")), submitCustomerRequest(orgA, customer, request("three")), submitCustomerRequest(orgA, customer, request("three"))]);
    expect(new Set(results.map((r) => r.booking.id)).size).toBe(1);
    expect(results.filter((r) => !r.duplicate)).toHaveLength(1);
    expect(await prisma.booking.count({ where: { organizationId: orgA, clientRequestId: `${run}-three` } })).toBe(1);
  });

  it("keeps two real requests with identical details apart: two DJs, one day, one venue", async () => {
    const one = await submitCustomerRequest(orgA, customer, request("room-1", { venueCity: "Baarn" }));
    const two = await submitCustomerRequest(orgA, customer, request("room-2", { venueCity: "Baarn" }));
    expect(two.duplicate).toBe(false);
    expect(two.booking.id).not.toBe(one.booking.id);
  });
});

describe("booking requests and the subscription", () => {
  const req = (key: string) => ({ clientRequestId: `${run}-sub-${key}`, eventType: "party" as const, eventDate: future(210), startTime: null, venueName: null, venueCity: "Utrecht", guestCount: null, budgetRange: null, preferredArtistId: null, preferredGenre: null, partnerName: null, ceremony: null, message: null });

  it("doesn't count or block inquiries at the monthly limit, and the booking can still be confirmed", async () => {
    await grantPlan(orgA, "starter");
    const { limits } = await import("./billing").then((m) => m.agencyBilling(orgA));
    const max = limits.maxBookingsPerMonth!;
    const already = (await agencyUsage(orgA)).maxBookingsPerMonth;
    for (let i = already; i < max; i++) await createBooking(orgA, { customerId: customer, eventType: "party", eventDate: future(211) }, owner);
    expect((await agencyUsage(orgA)).maxBookingsPerMonth).toBeGreaterThanOrEqual(max);

    const usage = (await agencyUsage(orgA)).maxBookingsPerMonth;
    const { booking } = await submitCustomerRequest(orgA, customer, req("at-limit"));
    expect(booking.status).toBe("inquiry");
    expect((await agencyUsage(orgA)).maxBookingsPerMonth).toBe(usage);

    // Confirming it isn't limited either: the limit counts bookings the agency enters itself (see the report).
    const quote = await sendQuote(orgA, booking.id, { lines: [line], depositBps: 0, expiresInDays: 14 }, owner);
    await acceptQuote(orgA, quote.id, { actor: "customer", actorId: customer, name: "Klant" });
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe("booked");
    await grantPlan(orgA, "business");
  }, 120_000);

  it("is closed while the public booking page is off", async () => {
    await prisma.organization.update({ where: { id: orgA }, data: { bookingPageEnabled: false } });
    expect(await agencyTakesRequests(orgA)).toBe(false);
    await expect(submitCustomerRequest(orgA, customer, req("page-off"))).rejects.toMatchObject({ code: "closed" });
    await prisma.organization.update({ where: { id: orgA }, data: { bookingPageEnabled: true } });
  });

  it("is closed for a suspended agency", async () => {
    await prisma.organization.update({ where: { id: orgA }, data: { suspendedAt: new Date() } });
    await expect(submitCustomerRequest(orgA, customer, req("suspended"))).rejects.toBeInstanceOf(CustomerRequestError);
    await prisma.organization.update({ where: { id: orgA }, data: { suspendedAt: null } });
  });

  it("is closed on a plan without the booking page", async () => {
    const plan = await prisma.plan.findFirstOrThrow({ where: { key: "business" } });
    const noPage = await prisma.plan.create({ data: { id: `${run}-plan`, key: `${run}-nopage`, name: plan.name as object, description: plan.description as object, monthlyPriceCents: 0, yearlyPriceCents: 0, features: { nl: [], en: [] }, limits: { ...(plan.limits as object), bookingPage: false } } as never });
    await prisma.subscription.updateMany({ where: { organizationId: orgB }, data: { planId: noPage.id } });
    await prisma.member.create({ data: { id: `${run}-m5`, organizationId: orgB, userId: customer, role: "customer" } });
    expect(await agencyTakesRequests(orgB)).toBe(false);
    await expect(submitCustomerRequest(orgB, customer, req("no-entitlement"))).rejects.toMatchObject({ code: "closed" });
    const business = await prisma.plan.findFirstOrThrow({ where: { key: "business" } });
    await prisma.subscription.updateMany({ where: { organizationId: orgB }, data: { planId: business.id } });
    await prisma.plan.delete({ where: { id: noPage.id } });
    await prisma.member.delete({ where: { id: `${run}-m5` } });
  });

  it("is refused for someone who isn't a customer of that agency", async () => {
    await expect(submitCustomerRequest(orgB, customer, req("other"))).rejects.toMatchObject({ code: "not_customer" });
  });
});
