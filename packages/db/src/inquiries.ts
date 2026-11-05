import { randomUUID } from "node:crypto";
import { type EventType, fullyBookedDates, isBudgetRange } from "@stagedesk/core";
import { agencyBilling } from "./billing";
import { bookableArtists, createBooking, toDateOnly } from "./bookings";
import { prisma } from "./client";
import { tenantDb } from "./tenant";

/**
 * Public booking page operations. These run without a signed-in user, so
 * every lookup starts from the agency's public slug.
 */

export async function publicAgency(slug: string) {
  return prisma.organization.findFirst({
    where: { slug, bookingPageEnabled: true, suspendedAt: null },
    select: {
      id: true,
      slug: true,
      name: true,
      logo: true,
      coverUrl: true,
      brandColor: true,
      bookingIntro: true,
      faq: true,
      showReviews: true,
      bookingTheme: true,
      city: true,
      addressLine: true,
      postalCode: true,
      phone: true,
      contactEmail: true,
      website: true,
    },
  });
}

/** Artists shown on the booking page: the agency's own and accepted shares that opt in. */
export async function publicArtists(organizationId: string) {
  return (await bookableArtists(organizationId)).filter((a) => a.showOnBookingPage);
}

export async function approvedReviews(organizationId: string, take = 6) {
  const [reviews, stats] = await Promise.all([
    prisma.review.findMany({
      where: { organizationId, status: "approved" },
      orderBy: { createdAt: "desc" },
      take,
      include: { customer: { select: { name: true } }, artist: { select: { stageName: true } } },
    }),
    prisma.review.aggregate({ where: { organizationId, status: "approved" }, _avg: { rating: true }, _count: true }),
  ]);
  return { reviews, average: stats._avg.rating, count: stats._count };
}

/** Dates in [from, to] on which no artist this agency can book is free. */
export async function agencyFullyBookedDates(organizationId: string, from: string, to: string) {
  const ids = (await bookableArtists(organizationId)).map((a) => a.id);
  if (ids.length === 0) return [];
  const range = { gte: toDateOnly(from), lte: toDateOnly(to) };
  const [blocked, playing] = await Promise.all([
    prisma.artistUnavailability.findMany({ where: { artistId: { in: ids }, date: range }, select: { artistId: true, date: true } }),
    prisma.bookingAssignment.findMany({
      where: { artistId: { in: ids }, status: { in: ["pending", "accepted"] }, booking: { eventDate: range, status: { in: ["booked", "confirmed"] } } },
      select: { artistId: true, booking: { select: { eventDate: true } } },
    }),
  ]);
  const busy = new Map<string, Set<string>>();
  const mark = (date: Date | null, artistId: string) => {
    if (!date) return;
    const key = date.toISOString().slice(0, 10);
    if (!busy.has(key)) busy.set(key, new Set());
    busy.get(key)!.add(artistId);
  };
  for (const b of blocked) mark(b.date, b.artistId);
  for (const p of playing) mark(p.booking.eventDate, p.artistId);
  return fullyBookedDates(ids, busy);
}

export interface InquiryInput {
  name: string;
  email: string;
  phone: string | null;
  locale: "nl" | "en";
  eventType: EventType;
  eventDate: string;
  startTime: string | null;
  venueName: string | null;
  venueCity: string | null;
  guestCount: number | null;
  budgetRange: string | null;
  preferredArtistId: string | null;
  preferredGenre: string | null;
  partnerName: string | null;
  ceremony: boolean | null;
  message: string | null;
}

/**
 * Records an inquiry from the public booking page: finds or creates the
 * person's account, links them to the agency as a customer and opens a
 * booking in "inquiry". Existing accounts keep their own name and phone.
 */
export async function submitInquiry(slug: string, input: InquiryInput, source: "booking_page" | "profile" = "booking_page") {
  const agency = await publicAgency(slug);
  if (!agency) return null;

  const email = input.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  const user =
    existing ??
    (await prisma.user.create({
      data: { id: randomUUID(), email, name: input.name, phone: input.phone, locale: input.locale },
      select: { id: true },
    }));

  const db = tenantDb(agency.id);
  const membership = await db.member.findFirst({ where: { userId: user.id }, select: { id: true } });
  if (!membership) {
    await db.member.create({ data: { id: randomUUID(), userId: user.id, role: "customer", organizationId: agency.id } });
  }

  // Only artists actually offered on this page can be asked for.
  const preferred = input.preferredArtistId
    ? (await publicArtists(agency.id)).find((a) => a.id === input.preferredArtistId)?.id ?? null
    : null;

  const booking = await createBooking(
    agency.id,
    {
      customerId: user.id,
      eventType: input.eventType,
      eventDate: input.eventDate,
      startTime: input.startTime,
      venueName: input.venueName,
      venueCity: input.venueCity,
      guestCount: input.guestCount,
      message: input.message,
      partnerName: input.eventType === "wedding" ? input.partnerName : null,
      ceremony: input.eventType === "wedding" ? input.ceremony : null,
      preferredArtistId: preferred,
      preferredGenre: input.preferredGenre,
      budgetRange: isBudgetRange(input.budgetRange) ? input.budgetRange : null,
      source,
    },
    null,
  );
  return { agency, booking, customerId: user.id, newAccount: !existing };
}

export class CustomerRequestError extends Error {
  constructor(readonly code: "not_customer" | "closed") {
    super(`Customer request: ${code}`);
    this.name = "CustomerRequestError";
  }
}

export interface CustomerRequestInput {
  /** A key from the form; a repeat with the same one returns the first booking. */
  clientRequestId: string;
  eventType: EventType;
  eventDate: string;
  startTime: string | null;
  venueName: string | null;
  venueCity: string;
  guestCount: number | null;
  budgetRange: string | null;
  preferredArtistId: string | null;
  preferredGenre: string | null;
  partnerName: string | null;
  ceremony: boolean | null;
  message: string | null;
}

/**
 * Whether an agency takes requests from its customers' portals: the same
 * switches and plan feature as its public page, so turning that off, being
 * suspended or having a plan without it stops both. The monthly booking limit
 * plays no part: it counts bookings the agency enters itself, and an inquiry is
 * a lead the agency shouldn't lose (see agencyUsage).
 */
export async function agencyTakesRequests(organizationId: string) {
  const agency = await prisma.organization.findFirst({ where: { id: organizationId, bookingPageEnabled: true, suspendedAt: null }, select: { id: true } });
  if (!agency) return false;
  return (await agencyBilling(organizationId)).limits.bookingPage;
}

/**
 * A signed-in customer asks their agency for a booking. They must already be a
 * customer of exactly this agency, so no account is made and no other agency can
 * be reached. `duplicate` says the booking already existed: nobody should be told again.
 * Only the form's key decides that. Two inquiries for the same day and city are
 * legitimate (two DJs for two rooms), so details never make a request a duplicate.
 */
export async function submitCustomerRequest(organizationId: string, customerId: string, input: CustomerRequestInput) {
  const db = tenantDb(organizationId);
  const member = await db.member.findFirst({ where: { userId: customerId, role: "customer" }, select: { id: true } });
  if (!member) throw new CustomerRequestError("not_customer");
  if (!(await agencyTakesRequests(organizationId))) throw new CustomerRequestError("closed");

  const repeat = await db.booking.findFirst({ where: { customerId, clientRequestId: input.clientRequestId } });
  if (repeat) return { booking: repeat, duplicate: true };

  const preferred = input.preferredArtistId ? ((await publicArtists(organizationId)).find((a) => a.id === input.preferredArtistId)?.id ?? null) : null;
  try {
    const booking = await createBooking(
      organizationId,
      {
        customerId,
        eventType: input.eventType,
        eventDate: input.eventDate,
        startTime: input.startTime,
        venueName: input.venueName,
        venueCity: input.venueCity,
        guestCount: input.guestCount,
        message: input.message,
        partnerName: input.eventType === "wedding" ? input.partnerName : null,
        ceremony: input.eventType === "wedding" ? input.ceremony : null,
        preferredArtistId: preferred,
        preferredGenre: input.preferredGenre,
        budgetRange: isBudgetRange(input.budgetRange) ? input.budgetRange : null,
        source: "customer_portal",
        clientRequestId: input.clientRequestId,
      },
      customerId,
    );
    return { booking, duplicate: false };
  } catch (error) {
    // Two submits at once: the unique index let one through, and that one is the answer.
    const winner = await db.booking.findFirst({ where: { customerId, clientRequestId: input.clientRequestId } });
    if (winner) return { booking: winner, duplicate: true };
    throw error;
  }
}
