import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { acceptQuote, assignArtist, changeBookingStatus, createBooking, respondToAssignment, sendQuote, updateBookingDetails } from "./bookings";
import { artistAccountState, artistCanBeAssigned } from "./artist-accounts";
import { prisma } from "./client";
import { CustomerEventError, decideChangeRequest, submitEventChange, updateCustomerPreferences, withdrawChangeRequest } from "./customer-event";
import { artistGigs, hasArtistProfileAt, pendingGigCount } from "./gigs";
import { CustomerRequestError, submitCustomerRequest } from "./inquiries";

/**
 * The customer's portal and the artist's view of their assignments, against
 * the database: what's edited, by whom, who hears about it, and what each side
 * can see. Mirrors the client's reports: customers couldn't edit or request,
 * artists couldn't see what was assigned to them.
 */

const run = `cap-${Date.now().toString(36)}`;
const orgA = `${run}-a`;
const orgB = `${run}-b`;
const owner = `${run}-owner`;
const customer = `${run}-customer`;
const stranger = `${run}-stranger`;
const artistUser = `${run}-artist`;
const artistId = `${run}-dj`;
const noLogin = `${run}-nologin`;
const disabledUser = `${run}-disabled`;
const disabledArtist = `${run}-disabled-dj`;
const removedUser = `${run}-removed`;
const removedArtist = `${run}-removed-dj`;
const setupUser = `${run}-setup`;
const setupArtist = `${run}-setup-dj`;
const sharedUser = `${run}-shared`;
const sharedArtist = `${run}-shared-dj`;
const mixedUser = `${run}-mixed`;
const mixedArtist = `${run}-mixed-dj`;

const future = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
const prefs = { preferredGenre: "House", dos: ["First dance at 21:00"], donts: ["No schlager"], playlistUrl: "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M", musicRequests: "More disco", specialRequests: "Quiet until the speeches end" };
const details = (over: Partial<Record<string, string | number | null>> = {}) => ({ eventType: "wedding", eventDate: future(100), startTime: "20:00", endTime: "23:00", venueName: "Tivoli", venueAddress: null, venueCity: "Utrecht", guestCount: 100, ...over });
const line = { description: "DJ", quantityHundredths: 100, unitPriceCents: 100_000, vatBps: 2100 };

async function newBooking(eventDate: string | null = future(100), customerId: string | null = customer) {
  return createBooking(orgA, { customerId, eventType: "wedding", eventDate, startTime: "20:00", endTime: "23:00", venueName: "Tivoli", venueCity: "Utrecht", guestCount: 100 }, owner);
}

/** A booking at "booked": a quote was accepted, so an artist can be asked. */
async function bookedBooking(eventDate: string | null = future(100), customerId: string | null = customer, org = orgA) {
  const booking = await createBooking(org, { customerId, eventType: "wedding", eventDate, startTime: "20:00", endTime: "23:00", venueName: "Tivoli", venueCity: "Utrecht", guestCount: 100 }, owner);
  const quote = await sendQuote(org, booking.id, { lines: [line], depositBps: 0, expiresInDays: 14 }, owner);
  await acceptQuote(org, quote.id, { actor: "customer", actorId: customerId, name: "Klant" });
  return booking;
}

const notifications = (userId: string, type: string) => prisma.notification.count({ where: { userId, type } });

beforeAll(async () => {
  const users = [owner, customer, stranger, artistUser, disabledUser, removedUser, setupUser, sharedUser, mixedUser];
  await prisma.user.createMany({
    data: users.map((id) => ({ id, name: id, email: `${id}@test.local`, emailVerified: true, disabledAt: id === disabledUser ? new Date() : null })),
  });
  // Everyone but the account made for someone (setupUser) has a way to sign in.
  await prisma.account.createMany({ data: users.filter((id) => id !== setupUser).map((id) => ({ id: `${id}-acc`, accountId: id, providerId: "credential", userId: id, password: "x" })) });
  await prisma.organization.createMany({
    data: [
      { id: orgA, name: "A", slug: `${run}-a` },
      { id: orgB, name: "B", slug: `${run}-b` },
    ],
  });
  await prisma.member.createMany({
    data: [
      { id: `${run}-m1`, organizationId: orgA, userId: owner, role: "agency_owner" },
      { id: `${run}-m2`, organizationId: orgA, userId: customer, role: "customer" },
      { id: `${run}-m3`, organizationId: orgB, userId: stranger, role: "customer" },
      { id: `${run}-m4`, organizationId: orgA, userId: artistUser, role: "artist" },
      { id: `${run}-m5`, organizationId: orgA, userId: disabledUser, role: "artist" },
      { id: `${run}-m6`, organizationId: orgA, userId: setupUser, role: "artist" },
      { id: `${run}-m7`, organizationId: orgB, userId: sharedUser, role: "artist" },
      // An artist at B who is also a customer at A: active agency A must not hide their gigs at B.
      { id: `${run}-m8`, organizationId: orgB, userId: mixedUser, role: "artist" },
      { id: `${run}-m9`, organizationId: orgA, userId: mixedUser, role: "customer" },
      { id: `${run}-m10`, organizationId: orgB, userId: owner, role: "agency_owner" },
    ],
  });
  await prisma.artist.createMany({
    data: [
      { id: artistId, organizationId: orgA, userId: artistUser, stageName: "DJ Linked", genres: [], defaultShareBps: 4000 },
      { id: noLogin, organizationId: orgA, stageName: "DJ Profile Only", genres: [], defaultShareBps: 4000 },
      { id: disabledArtist, organizationId: orgA, userId: disabledUser, stageName: "DJ Disabled", genres: [], defaultShareBps: 4000 },
      { id: removedArtist, organizationId: orgA, userId: removedUser, stageName: "DJ Removed", genres: [], defaultShareBps: 4000 },
      { id: setupArtist, organizationId: orgA, userId: setupUser, stageName: "DJ New", genres: [], defaultShareBps: 4000 },
      { id: sharedArtist, organizationId: orgB, userId: sharedUser, stageName: "DJ Shared", genres: [], defaultShareBps: 4000 },
      { id: mixedArtist, organizationId: orgB, userId: mixedUser, stageName: "DJ Both", genres: [], defaultShareBps: 4000 },
    ],
  });
  await prisma.artistShare.createMany({
    data: [
      { id: `${run}-s1`, organizationId: orgB, artistId: sharedArtist, partnerOrganizationId: orgA, status: "accepted" },
      { id: `${run}-s2`, organizationId: orgB, artistId: mixedArtist, partnerOrganizationId: orgA, status: "accepted" },
    ],
  });
});

afterAll(async () => {
  const orgs = [orgA, orgB];
  const bookings = await prisma.booking.findMany({ where: { organizationId: { in: orgs } }, select: { id: true } });
  const ids = bookings.map((b) => b.id);
  await prisma.bookingAssignment.deleteMany({ where: { bookingId: { in: ids } } });
  await prisma.bookingChangeRequest.deleteMany({ where: { bookingId: { in: ids } } });
  await prisma.bookingEvent.deleteMany({ where: { bookingId: { in: ids } } });
  await prisma.quoteItem.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.quote.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.booking.deleteMany({ where: { id: { in: ids } } });
  await prisma.artistShare.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.artist.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.member.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.auditEvent.deleteMany({ where: { agencyId: { in: orgs } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgs } } });
  const users = { startsWith: run };
  await prisma.notification.deleteMany({ where: { userId: users } });
  await prisma.account.deleteMany({ where: { userId: users } });
  await prisma.user.deleteMany({ where: { id: users } });
});

describe("customer preferences", () => {
  it("saves wishes on the customer's own booking and records who did it", async () => {
    const booking = await newBooking();
    const { changed } = await updateCustomerPreferences(orgA, booking.id, customer, prefs);
    expect(changed.sort()).toEqual(["donts", "dos", "musicRequests", "playlistUrl", "preferredGenre", "specialRequests"]);

    const saved = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(saved.dos).toEqual(prefs.dos);
    expect(saved.donts).toEqual(prefs.donts);
    expect(saved.playlistUrl).toBe(prefs.playlistUrl);
    expect(saved.musicRequests).toBe("More disco");
    expect(saved.specialRequests).toBe("Quiet until the speeches end");

    const event = await prisma.bookingEvent.findFirstOrThrow({ where: { bookingId: booking.id, type: "preferences_updated" } });
    expect(event.actorId).toBe(customer);
    expect(await prisma.auditEvent.count({ where: { action: "booking.customer_preferences", targetId: booking.id, actorId: customer } })).toBe(1);
  });

  it("does not change the quote, price or artist pay, and doesn't outdate an open quote", async () => {
    const booking = await newBooking();
    const quote = await sendQuote(orgA, booking.id, { lines: [line], depositBps: 0, expiresInDays: 14 }, owner);
    await updateCustomerPreferences(orgA, booking.id, customer, prefs);
    // Still acceptable: wishes aren't part of what was offered.
    await acceptQuote(orgA, quote.id, { actor: "customer", actorId: customer, name: "Klant" });
    const saved = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(saved.status).toBe("booked");
    expect(saved.totalCents).toBe(121_000);
  });

  it("tells the agency and the assigned artist once; a repeated save records and tells nothing", async () => {
    const booking = await bookedBooking(future(110));
    await assignArtist(orgA, booking.id, artistId, owner);
    const desk = await notifications(owner, "preferences_updated");
    const artist = await notifications(artistUser, "preferences_updated");
    await updateCustomerPreferences(orgA, booking.id, customer, prefs);
    expect(await notifications(owner, "preferences_updated")).toBe(desk + 1);
    expect(await notifications(artistUser, "preferences_updated")).toBe(artist + 1);

    const retry = await updateCustomerPreferences(orgA, booking.id, customer, prefs);
    expect(retry.changed).toEqual([]);
    expect(await notifications(owner, "preferences_updated")).toBe(desk + 1);
    expect(await notifications(artistUser, "preferences_updated")).toBe(artist + 1);
    expect(await prisma.bookingEvent.count({ where: { bookingId: booking.id, type: "preferences_updated" } })).toBe(1);
  });

  it("refuses someone else's booking, even in the same agency, and a booking at another agency", async () => {
    const booking = await newBooking();
    await expect(updateCustomerPreferences(orgA, booking.id, stranger, prefs)).rejects.toMatchObject({ code: "not_found" });
    await expect(updateCustomerPreferences(orgB, booking.id, customer, prefs)).rejects.toMatchObject({ code: "not_found" });
  });

  it("refuses an address that isn't a music service", async () => {
    const booking = await newBooking();
    for (const playlistUrl of ["https://evil.example/playlist", "javascript:alert(1)", "http://open.spotify.com/playlist/abc"]) {
      await expect(updateCustomerPreferences(orgA, booking.id, customer, { ...prefs, playlistUrl })).rejects.toMatchObject({ code: "invalid_playlist" });
    }
  });

  it("is closed on cancelled and finished bookings, and when the event has passed", async () => {
    const cancelled = await newBooking();
    await changeBookingStatus(orgA, cancelled.id, "cancel", { actor: "agency", actorId: owner });
    await expect(updateCustomerPreferences(orgA, cancelled.id, customer, prefs)).rejects.toMatchObject({ code: "closed" });

    const passed = await newBooking();
    await prisma.booking.update({ where: { id: passed.id }, data: { status: "booked", eventDate: new Date("2020-01-01T00:00:00Z") } });
    await expect(updateCustomerPreferences(orgA, passed.id, customer, prefs)).rejects.toMatchObject({ code: "closed" });
  });

  it("follows the agency's setting", async () => {
    const booking = await newBooking();
    await prisma.organization.update({ where: { id: orgA }, data: { customerPreferencesEditable: false } });
    await expect(updateCustomerPreferences(orgA, booking.id, customer, prefs)).rejects.toMatchObject({ code: "locked_by_agency" });
    await prisma.organization.update({ where: { id: orgA }, data: { customerPreferencesEditable: true } });
  });
});

describe("customer changes to contract details", () => {
  it("applies straight away while there's only an inquiry", async () => {
    const booking = await newBooking();
    const result = await submitEventChange(orgA, booking.id, customer, details({ venueCity: "Amersfoort", eventDate: booking.eventDate!.toISOString().slice(0, 10) }), null);
    expect(result.mode).toBe("direct");
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).venueCity).toBe("Amersfoort");
    expect(await prisma.bookingChangeRequest.count({ where: { bookingId: booking.id } })).toBe(0);
    expect(await prisma.auditEvent.count({ where: { action: "booking.customer_details", targetId: booking.id } })).toBe(1);
  });

  it("never changes an accepted booking until the agency approves", async () => {
    const date = future(120);
    const booking = await bookedBooking(date);
    const moved = future(121);
    const desk = await notifications(owner, "change_requested");
    const { mode, requestId } = await submitEventChange(orgA, booking.id, customer, details({ eventDate: moved }), "Venue moved us");
    expect(mode).toBe("request");
    const before = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(before.eventDate?.toISOString().slice(0, 10)).toBe(date);
    expect(await notifications(owner, "change_requested")).toBe(desk + 1);

    await decideChangeRequest(orgA, requestId!, owner, { approve: true });
    const after = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(after.eventDate?.toISOString().slice(0, 10)).toBe(moved);
    expect(after.totalCents).toBe(before.totalCents);
    const request = await prisma.bookingChangeRequest.findUniqueOrThrow({ where: { id: requestId! } });
    expect(request.status).toBe("approved");
    expect(request.decidedById).toBe(owner);
    expect(await notifications(customer, "change_approved")).toBeGreaterThan(0);
    await expect(decideChangeRequest(orgA, requestId!, owner, { approve: false })).rejects.toMatchObject({ code: "not_pending" });
  });

  it("leaves the booking alone when refused, and tells the customer why", async () => {
    const date = future(122);
    const booking = await bookedBooking(date);
    const { requestId } = await submitEventChange(orgA, booking.id, customer, details({ eventDate: future(123) }), null);
    await decideChangeRequest(orgA, requestId!, owner, { approve: false, note: "We're full that day" });
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).eventDate?.toISOString().slice(0, 10)).toBe(date);
    expect((await prisma.bookingChangeRequest.findUniqueOrThrow({ where: { id: requestId! } })).decisionNote).toBe("We're full that day");
  });

  it("refuses to approve a date the assigned artist can't make, and keeps the request open", async () => {
    const date = future(124);
    const taken = future(125);
    const booking = await bookedBooking(date);
    await assignArtist(orgA, booking.id, artistId, owner);
    await prisma.artistUnavailability.create({ data: { id: `${run}-busy`, organizationId: orgA, artistId, date: new Date(`${taken}T00:00:00Z`) } });
    const { requestId } = await submitEventChange(orgA, booking.id, customer, details({ eventDate: taken }), null);
    await expect(decideChangeRequest(orgA, requestId!, owner, { approve: true })).rejects.toThrow("artist_unavailable");
    expect((await prisma.bookingChangeRequest.findUniqueOrThrow({ where: { id: requestId! } })).status).toBe("pending");
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).eventDate?.toISOString().slice(0, 10)).toBe(date);
    await prisma.artistUnavailability.delete({ where: { id: `${run}-busy` } });
  });

  it("asks once for the same thing, replaces with a new ask, and can be withdrawn", async () => {
    const date = future(126);
    const booking = await bookedBooking(date);
    const first = await submitEventChange(orgA, booking.id, customer, details({ eventDate: date, venueCity: "Zeist" }), null);
    const desk = await notifications(owner, "change_requested");
    const again = await submitEventChange(orgA, booking.id, customer, details({ eventDate: date, venueCity: "Zeist" }), null);
    expect(again.requestId).toBe(first.requestId);
    expect(await notifications(owner, "change_requested")).toBe(desk);

    const other = await submitEventChange(orgA, booking.id, customer, details({ eventDate: date, venueCity: "Bunnik" }), null);
    expect(other.requestId).not.toBe(first.requestId);
    expect((await prisma.bookingChangeRequest.findUniqueOrThrow({ where: { id: first.requestId! } })).status).toBe("superseded");

    await expect(withdrawChangeRequest(orgA, other.requestId!, stranger)).rejects.toMatchObject({ code: "not_pending" });
    await withdrawChangeRequest(orgA, other.requestId!, customer);
    expect((await prisma.bookingChangeRequest.findUniqueOrThrow({ where: { id: other.requestId! } })).status).toBe("withdrawn");
  });

  it("refuses bad input, someone else's booking and finished bookings", async () => {
    const date = future(127);
    const booking = await bookedBooking(date);
    await expect(submitEventChange(orgA, booking.id, stranger, details(), null)).rejects.toMatchObject({ code: "not_found" });
    await expect(submitEventChange(orgA, booking.id, customer, details({ eventDate: "2020-01-01" }), null)).rejects.toMatchObject({ code: "invalid_date" });
    await expect(submitEventChange(orgA, booking.id, customer, details({ eventDate: null }), null)).rejects.toMatchObject({ code: "date_required" });
    await expect(submitEventChange(orgA, booking.id, customer, details({ eventDate: date, startTime: "99:99" }), null)).rejects.toMatchObject({ code: "invalid_details" });
    await expect(submitEventChange(orgA, booking.id, customer, details({ eventDate: date }), null)).rejects.toMatchObject({ code: "no_changes" });
    await changeBookingStatus(orgA, booking.id, "cancel", { actor: "agency", actorId: owner });
    await expect(submitEventChange(orgA, booking.id, customer, details({ eventDate: date, venueCity: "Elders" }), null)).rejects.toBeInstanceOf(CustomerEventError);
  });
});

describe("customer booking requests", () => {
  const request = (key: string, over: Partial<Parameters<typeof submitCustomerRequest>[2]> = {}) => ({
    clientRequestId: `${run}-${key}`,
    eventType: "party" as const,
    eventDate: future(200),
    startTime: "20:00",
    venueName: null,
    venueCity: `Stad ${key}`,
    guestCount: 50,
    budgetRange: "750_1500",
    preferredArtistId: null,
    preferredGenre: "Disco",
    partnerName: null,
    ceremony: null,
    message: "Graag!",
    ...over,
  });

  it("opens an inquiry linked to the customer, at their agency, without making an account", async () => {
    const users = await prisma.user.count();
    const { booking, duplicate } = await submitCustomerRequest(orgA, customer, request("one"));
    expect(duplicate).toBe(false);
    expect(booking).toMatchObject({ organizationId: orgA, customerId: customer, status: "inquiry", source: "customer_portal", preferredGenre: "Disco" });
    expect(await prisma.user.count()).toBe(users);
  });

  it("makes one booking from a repeated or simultaneous submit", async () => {
    const results = await Promise.all([submitCustomerRequest(orgA, customer, request("dup")), submitCustomerRequest(orgA, customer, request("dup")), submitCustomerRequest(orgA, customer, request("dup"))]);
    expect(new Set(results.map((r) => r.booking.id)).size).toBe(1);
    expect(await prisma.booking.count({ where: { organizationId: orgA, clientRequestId: `${run}-dup` } })).toBe(1);
    expect((await submitCustomerRequest(orgA, customer, request("dup"))).duplicate).toBe(true);
  });

  it("treats an identical form sent again moments later as the same request, but allows a second event", async () => {
    const first = await submitCustomerRequest(orgA, customer, request("same", { venueCity: "Baarn" }));
    const reload = await submitCustomerRequest(orgA, customer, request("same-reloaded", { venueCity: "Baarn" }));
    expect(reload.duplicate).toBe(true);
    expect(reload.booking.id).toBe(first.booking.id);
    const second = await submitCustomerRequest(orgA, customer, request("second", { venueCity: "Baarn", eventDate: future(210) }));
    expect(second.duplicate).toBe(false);
  });

  it("refuses an agency the person isn't a customer of", async () => {
    await expect(submitCustomerRequest(orgB, customer, request("other"))).rejects.toBeInstanceOf(CustomerRequestError);
    await expect(submitCustomerRequest(orgA, owner, request("staff"))).rejects.toMatchObject({ code: "not_customer" });
  });

  it("respects the agency's booking page switch and suspension", async () => {
    await prisma.organization.update({ where: { id: orgA }, data: { bookingPageEnabled: false } });
    await expect(submitCustomerRequest(orgA, customer, request("off"))).rejects.toMatchObject({ code: "closed" });
    await prisma.organization.update({ where: { id: orgA }, data: { bookingPageEnabled: true, suspendedAt: new Date() } });
    await expect(submitCustomerRequest(orgA, customer, request("susp"))).rejects.toMatchObject({ code: "closed" });
    await prisma.organization.update({ where: { id: orgA }, data: { suspendedAt: null } });
  });
});

describe("assigning artists", () => {
  it("knows who can be reached", async () => {
    expect(await artistAccountState(artistId)).toBe("active");
    expect(await artistAccountState(noLogin)).toBe("no_account");
    expect(await artistAccountState(disabledArtist)).toBe("disabled");
    expect(await artistAccountState(removedArtist)).toBe("not_member");
    expect(await artistAccountState(setupArtist)).toBe("setup_pending");
    expect(artistCanBeAssigned("setup_pending")).toBe(true);
    expect(artistCanBeAssigned("no_account")).toBe(false);
  });

  it("refuses a profile nobody can answer for, and saves nothing", async () => {
    const booking = await bookedBooking(future(130));
    await expect(assignArtist(orgA, booking.id, noLogin, owner)).rejects.toThrow("artist_no_account");
    await expect(assignArtist(orgA, booking.id, removedArtist, owner)).rejects.toThrow("artist_no_account");
    await expect(assignArtist(orgA, booking.id, disabledArtist, owner)).rejects.toThrow("artist_account_disabled");
    expect(await prisma.bookingAssignment.count({ where: { bookingId: booking.id } })).toBe(0);
  });

  it("assigns an artist who still has to choose a password; the request is waiting for them", async () => {
    const booking = await bookedBooking(future(131));
    const { notified } = await assignArtist(orgA, booking.id, setupArtist, owner);
    expect(notified).toBe(true);
    const { requests } = await artistGigs(setupUser);
    expect(requests.map((g) => g.booking.trackingCode)).toContain(booking.trackingCode);
  });
});

describe("what an artist sees", () => {
  it("shows a new request with a notification and a count", async () => {
    const booking = await bookedBooking(future(140));
    const before = await pendingGigCount(artistUser);
    const { notified } = await assignArtist(orgA, booking.id, artistId, owner);
    expect(notified).toBe(true);
    expect(await pendingGigCount(artistUser)).toBe(before + 1);
    const { requests } = await artistGigs(artistUser);
    const gig = requests.find((g) => g.booking.trackingCode === booking.trackingCode);
    expect(gig?.state).toBe("new_request");
    expect(await prisma.notification.count({ where: { userId: artistUser, type: "gig_request", url: `/app/gigs/${booking.trackingCode}` } })).toBe(1);
  });

  it("shows requests and accepted gigs without a date, and never files them as past", async () => {
    const booking = await bookedBooking(null);
    const { assignmentId } = await assignArtist(orgA, booking.id, artistId, owner);
    expect((await artistGigs(artistUser)).requests.map((g) => g.id)).toContain(assignmentId);
    await respondToAssignment(assignmentId, artistUser, { accept: true });
    const after = await artistGigs(artistUser);
    expect(after.upcoming.find((g) => g.id === assignmentId)?.state).toBe("date_pending");
    expect(after.past.map((g) => g.id)).not.toContain(assignmentId);
  });

  it("keeps every open request in view when the artist has many gigs", async () => {
    const created = [];
    for (let i = 0; i < 22; i++) {
      const b = await bookedBooking(future(300 + i));
      created.push((await assignArtist(orgA, b.id, artistId, owner)).assignmentId);
    }
    await prisma.bookingAssignment.updateMany({ where: { id: { in: created } }, data: { status: "accepted" } });
    const late = await bookedBooking(future(900));
    const { assignmentId } = await assignArtist(orgA, late.id, artistId, owner);
    const { requests, upcoming } = await artistGigs(artistUser);
    expect(upcoming.length).toBeGreaterThanOrEqual(22);
    expect(requests.map((g) => g.id)).toContain(assignmentId);
  }, 180_000);

  it("shows a shared artist's gig at the agency that borrowed them", async () => {
    const booking = await bookedBooking(future(150));
    await assignArtist(orgA, booking.id, sharedArtist, owner);
    const { requests } = await artistGigs(sharedUser);
    const gig = requests.find((g) => g.booking.trackingCode === booking.trackingCode);
    expect(gig?.booking.organization.name).toBe("A");
  });

  it("finds the gigs of someone who's a customer at the agency they have active", async () => {
    // Their artist membership is at B; the viewer grants the gigs permission from this.
    expect(await hasArtistProfileAt(mixedUser, [orgB])).toBe(true);
    expect(await hasArtistProfileAt(customer, [orgA])).toBe(false);
    const booking = await bookedBooking(future(151));
    await assignArtist(orgA, booking.id, mixedArtist, owner);
    expect((await artistGigs(mixedUser)).requests.map((g) => g.booking.trackingCode)).toContain(booking.trackingCode);
  });

  it("never shows one artist another artist's assignment", async () => {
    const booking = await bookedBooking(future(152));
    await assignArtist(orgA, booking.id, artistId, owner);
    const other = await artistGigs(setupUser);
    expect([...other.requests, ...other.upcoming, ...other.past, ...other.closed].map((g) => g.booking.trackingCode)).not.toContain(booking.trackingCode);
    await expect(respondToAssignment((await prisma.bookingAssignment.findFirstOrThrow({ where: { bookingId: booking.id } })).id, setupUser, { accept: true })).rejects.toThrow("no_open_assignment");
  });

  it("ends the view of an agency's gigs when the person is removed from its team", async () => {
    const booking = await bookedBooking(future(153));
    await prisma.bookingAssignment.create({ data: { id: `${run}-old`, organizationId: orgA, bookingId: booking.id, artistId: removedArtist, status: "pending", shareBps: 0 } });
    const { requests } = await artistGigs(removedUser);
    expect(requests).toEqual([]);
    expect(await pendingGigCount(removedUser)).toBe(0);
  });

  it("files a reassigned request as withdrawn and tells the first artist", async () => {
    const booking = await bookedBooking(future(154));
    const first = await assignArtist(orgA, booking.id, artistId, owner);
    await assignArtist(orgA, booking.id, setupArtist, owner);
    const { requests, closed } = await artistGigs(artistUser);
    expect(requests.map((g) => g.id)).not.toContain(first.assignmentId);
    expect(closed.find((g) => g.id === first.assignmentId)?.state).toBe("withdrawn");
  });

  it("files a cancelled booking as cancelled, and a declined request as declined", async () => {
    const cancelled = await bookedBooking(future(155));
    const a = await assignArtist(orgA, cancelled.id, artistId, owner);
    await changeBookingStatus(orgA, cancelled.id, "cancel", { actor: "agency", actorId: owner });
    expect((await artistGigs(artistUser)).closed.find((g) => g.id === a.assignmentId)?.state).toBe("cancelled");

    const declined = await bookedBooking(future(156));
    const b = await assignArtist(orgA, declined.id, artistId, owner);
    await respondToAssignment(b.assignmentId, artistUser, { accept: false, reason: "Elsewhere" });
    expect((await artistGigs(artistUser)).closed.find((g) => g.id === b.assignmentId)?.state).toBe("declined");
    // The agency hears the answer.
    expect(await prisma.notification.count({ where: { userId: owner, type: "gig_response", url: `/app/bookings/${declined.trackingCode}` } })).toBe(1);
  });

  it("confirms the booking when the artist accepts", async () => {
    const booking = await bookedBooking(future(157));
    const { assignmentId } = await assignArtist(orgA, booking.id, artistId, owner);
    await respondToAssignment(assignmentId, artistUser, { accept: true });
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe("confirmed");
  });
});

describe("agency edits reach the people on the booking", () => {
  it("tells the artist and customer when the event changes, and nobody when nothing did", async () => {
    const date = new Date(`${future(160)}T00:00:00Z`);
    const booking = await bookedBooking(future(160));
    await assignArtist(orgA, booking.id, artistId, owner);
    const artist = await notifications(artistUser, "gig_updated");
    const client = await notifications(customer, "booking_updated");
    await updateBookingDetails(orgA, booking.id, { eventDate: date, venueCity: "Utrecht" }, owner);
    expect(await notifications(artistUser, "gig_updated")).toBe(artist);
    await updateBookingDetails(orgA, booking.id, { eventDate: date, venueCity: "Nieuwegein" }, owner);
    expect(await notifications(artistUser, "gig_updated")).toBe(artist + 1);
    expect(await notifications(customer, "booking_updated")).toBe(client + 1);
  });
});
