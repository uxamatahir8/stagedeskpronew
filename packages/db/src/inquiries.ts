import { randomUUID } from "node:crypto";
import { type EventType, fullyBookedDates, isBudgetRange } from "@stagedesk/core";
import { bookableArtists, createBooking, toDateOnly } from "./bookings";
import { prisma } from "./client";
import { tenantDb } from "./tenant";

/**
 * Public booking page operations. These run without a signed-in user, so
 * every lookup starts from the agency's public slug.
 */

export async function publicAgency(slug: string) {
  return prisma.organization.findFirst({
    where: { slug, bookingPageEnabled: true },
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
export async function submitInquiry(slug: string, input: InquiryInput) {
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
      source: "booking_page",
    },
    null,
  );
  return { agency, booking, customerId: user.id, newAccount: !existing };
}
