import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { acceptQuote, assignArtist, createBooking, respondToAssignment, sendQuote } from "./bookings";
import { prisma } from "./client";
import { conversations, postMessage, threadParticipants } from "./messages";
import { latestNotifications, markNotificationsRead } from "./notifications";
import { claimReminder, eventsInDays } from "./reminders";
import { openTicket, replyToTicket } from "./support";

const run = `m${Date.now().toString(36)}`;
const org = `${run}-org`;
const otherOrg = `${run}-other`;
const owner = `${run}-owner`;
const staff = `${run}-staff`;
const customer = `${run}-cust`;
const artistUser = `${run}-artist`;
const admin = `${run}-admin`;
const artistId = `${run}-a`;
const lines = [{ description: "DJ", quantityHundredths: 100, unitPriceCents: 100_000, vatBps: 2_100 }];
let bookingId = "";
let code = "";

beforeAll(async () => {
  await prisma.organization.createMany({ data: [{ id: org, name: "Talk Agency", slug: org }, { id: otherOrg, name: "Other", slug: otherOrg }] });
  await prisma.user.createMany({
    data: [
      { id: owner, name: "Olga Owner", email: `${run}-o@test.local` },
      { id: staff, name: "Sam Staff", email: `${run}-s@test.local` },
      { id: customer, name: "Cora Customer", email: `${run}-c@test.local` },
      { id: artistUser, name: "Arno Artist", email: `${run}-a@test.local` },
      { id: admin, name: "Ada Admin", email: `${run}-adm@test.local`, platformRole: "platform_admin" },
    ],
  });
  await prisma.member.createMany({
    data: [
      { id: randomUUID(), organizationId: org, userId: owner, role: "agency_owner" },
      { id: randomUUID(), organizationId: org, userId: staff, role: "agency_staff" },
      { id: randomUUID(), organizationId: org, userId: customer, role: "customer" },
      { id: randomUUID(), organizationId: org, userId: artistUser, role: "artist" },
    ],
  });
  await prisma.artist.create({ data: { id: artistId, organizationId: org, userId: artistUser, stageName: "DJ Arno", genres: [], defaultShareBps: 4_000 } });

  // A booking a week from "now", accepted and with the artist asked.
  const now = new Date("2027-06-05T10:00:00Z");
  const booking = await createBooking(org, { customerId: customer, eventType: "wedding", eventDate: "2027-06-12" }, owner);
  const quote = await sendQuote(org, booking.id, { lines, depositBps: 3_000, expiresInDays: 14 }, owner, now);
  await acceptQuote(org, quote.id, { actor: "customer", actorId: customer, name: "Cora Customer" }, now);
  await assignArtist(org, booking.id, artistId, owner, now);
  bookingId = booking.id;
  code = booking.trackingCode;
});

afterAll(async () => {
  const users = [owner, staff, customer, artistUser, admin];
  await prisma.notification.deleteMany({ where: { userId: { in: users } } });
  await prisma.messageRead.deleteMany({ where: { userId: { in: users } } });
  await prisma.supportTicket.deleteMany({ where: { userId: { in: users } } });
  await prisma.reminderLog.deleteMany({ where: { key: { contains: bookingId } } });
  await prisma.bookingMessage.deleteMany({ where: { organizationId: org } });
  await prisma.bookingAssignment.deleteMany({ where: { organizationId: org } });
  await prisma.bookingEvent.deleteMany({ where: { organizationId: org } });
  await prisma.quoteItem.deleteMany({ where: { organizationId: org } });
  await prisma.quote.deleteMany({ where: { organizationId: org } });
  await prisma.booking.deleteMany({ where: { organizationId: org } });
  await prisma.artist.deleteMany({ where: { organizationId: org } });
  await prisma.member.deleteMany({ where: { organizationId: org } });
  await prisma.organization.deleteMany({ where: { id: { in: [org, otherOrg] } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
});

describe("notifications from booking events", () => {
  it("tells the desk about the accepted quote and the artist about the request", async () => {
    const desk = await latestNotifications(owner);
    expect(desk.items.map((n) => n.type)).toContain("quote_accepted");
    // The customer accepted, so they aren't notified about their own action.
    expect((await latestNotifications(customer)).items.map((n) => n.type)).not.toContain("quote_accepted");
    const artist = await latestNotifications(artistUser);
    expect(artist.items[0]).toMatchObject({ type: "gig_request", url: `/app/gigs/${code}` });
  });

  it("tells the desk when the artist answers, and marks read", async () => {
    const assignment = await prisma.bookingAssignment.findFirstOrThrow({ where: { bookingId, status: "pending" } });
    await respondToAssignment(assignment.id, artistUser, { accept: true }, new Date("2027-06-05T12:00:00Z"));
    const staffView = await latestNotifications(staff);
    expect(staffView.items[0]).toMatchObject({ type: "gig_response", data: { accepted: "yes", name: "DJ Arno" } });
    await markNotificationsRead(staff, "all");
    expect((await latestNotifications(staff)).unread).toBe(0);
  });
});

describe("booking conversations", () => {
  it("has the desk plus the customer, or the desk plus the assigned artist", async () => {
    expect(await threadParticipants(bookingId, "customer")).toEqual({ desk: expect.arrayContaining([owner, staff]), other: customer });
    expect((await threadParticipants(bookingId, "artist")).other).toBe(artistUser);
  });

  it("notifies the other side and asks for an email to the customer only when the desk writes", async () => {
    const fromDesk = await postMessage({ bookingId, channel: "customer", authorId: owner, body: "  Welke openingsdans?  " });
    expect(fromDesk?.message.body).toBe("Welke openingsdans?");
    expect(fromDesk?.emailTo?.id).toBe(customer);
    expect((await latestNotifications(customer)).items[0]).toMatchObject({ type: "message", url: `/app/messages/${code}?channel=customer` });

    const fromCustomer = await postMessage({ bookingId, channel: "customer", authorId: customer, body: "Perfect - Can't Help Falling in Love" });
    expect(fromCustomer?.emailTo).toBeNull();
    expect((await latestNotifications(staff)).items[0]?.type).toBe("message");
    expect(await postMessage({ bookingId, channel: "customer", authorId: customer, body: "   " })).toBeNull();
  });

  it("lists conversations per role with unread counts, and keeps the artist out of the customer thread", async () => {
    await postMessage({ bookingId, channel: "artist", authorId: staff, body: "Soundcheck om 17:00" });
    const desk = await conversations({ userId: owner, agencyId: org });
    expect(desk.map((c) => c.channel).sort()).toEqual(["artist", "customer"]);
    expect(desk.find((c) => c.channel === "customer")?.unread).toBe(1);

    const artist = await conversations({ userId: artistUser, artistUserId: artistUser });
    expect(artist.map((c) => c.channel)).toEqual(["artist"]);
    expect(artist[0]?.unread).toBe(1);

    const cust = await conversations({ userId: customer, customerId: customer });
    expect(cust.map((c) => c.channel)).toEqual(["customer"]);
    expect(cust[0]?.unread).toBe(0);
    expect(await conversations({ userId: owner, agencyId: otherOrg })).toEqual([]);
  });
});

describe("support tickets", () => {
  it("tells the admins about a new ticket and the requester about a reply", async () => {
    const ticket = await openTicket({ userId: customer, agencyId: org, subject: "Factuur klopt niet", category: "billing", body: "Het btw-bedrag lijkt verkeerd." });
    expect(ticket.reference).toMatch(/^T-[A-Z2-9]{6}$/);
    expect((await latestNotifications(admin)).items[0]).toMatchObject({ type: "ticket_new", url: `/app/support/${ticket.reference}` });

    await replyToTicket({ reference: ticket.reference, authorId: admin, fromStaff: true, body: "We kijken ernaar." });
    expect((await prisma.supportTicket.findUniqueOrThrow({ where: { id: ticket.id } })).status).toBe("answered");
    expect((await latestNotifications(customer)).items[0]?.type).toBe("ticket_reply");

    await replyToTicket({ reference: ticket.reference, authorId: customer, fromStaff: false, body: "Dank je!" });
    expect((await prisma.supportTicket.findUniqueOrThrow({ where: { id: ticket.id } })).status).toBe("open");
    expect(await prisma.ticketMessage.count({ where: { ticketId: ticket.id } })).toBe(3);
  });
});

describe("reminders", () => {
  it("finds the event a week ahead and sends each reminder only once", async () => {
    const due = await eventsInDays(7, new Date("2027-06-05T08:00:00Z"));
    const ours = due.find((b) => b.id === bookingId);
    expect(ours?.customer?.id).toBe(customer);
    expect(ours?.assignments[0]?.artist.user?.id).toBe(artistUser);
    expect(await claimReminder(`event-7:${bookingId}`)).toBe(true);
    expect(await claimReminder(`event-7:${bookingId}`)).toBe(false);
  });
});
