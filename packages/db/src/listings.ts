import { randomUUID } from "node:crypto";
import { type EventType, normalizePlace, subscriptionAccess } from "@stagedesk/core";
import { createBooking, isArtistFree, resolveBookingCustomer, sendQuote, toDateOnly } from "./bookings";
import { prisma } from "./client";
import { Prisma } from "./generated/prisma/client";
import { getSetting } from "./settings";

/**
 * Independent artists' gigs at a set price, their public profile, and the
 * directory of artists with the Artist plan. An order is a booking with the
 * gig's price already sent as a quote, so paying works as for any booking.
 */

export class ListingError extends Error {
  constructor(readonly code: "not_found" | "not_listed" | "unavailable" | "customer_on_team") {
    super(`Listing: ${code}`);
    this.name = "ListingError";
  }
}

export interface ListingInput {
  title: string;
  description: string | null;
  priceCents: number;
  vatBps: number;
  depositBps: number;
  durationMinutes: number | null;
  eventTypes: EventType[] | null;
  active: boolean;
}

export async function saveListing(organizationId: string, id: string | null, input: ListingInput) {
  const artist = await prisma.artist.findFirst({ where: { organizationId, organization: { kind: "solo" }, userId: { not: null } }, select: { id: true } });
  if (!artist) throw new ListingError("not_found");
  const data = { ...input, eventTypes: input.eventTypes ?? Prisma.DbNull };
  if (id) {
    const done = await prisma.gigListing.updateMany({ where: { id, organizationId }, data });
    if (done.count === 0) throw new ListingError("not_found");
    return id;
  }
  const position = await prisma.gigListing.count({ where: { organizationId } });
  const created = await prisma.gigListing.create({ data: { ...data, id: randomUUID(), organizationId, artistId: artist.id, position } });
  return created.id;
}

export async function deleteListing(organizationId: string, id: string) {
  // Orders keep their booking; the link to the gig is cleared.
  await prisma.gigListing.deleteMany({ where: { id, organizationId } });
}

const directoryInclude = {
  organization: {
    select: {
      id: true,
      slug: true,
      city: true,
      currency: true,
      serviceRegions: true,
      serviceEventTypes: true,
      suspendedAt: true,
      subscription: { include: { plan: { select: { audience: true } } } },
      reviews: { where: { status: "approved" }, select: { rating: true } },
    },
  },
  listings: { where: { active: true }, orderBy: { position: "asc" } },
} satisfies Prisma.ArtistInclude;

type DirectoryRow = Prisma.ArtistGetPayload<{ include: typeof directoryInclude }>;

/** Listed when the business is an independent artist's, not suspended, and has a working Artist plan. */
function listed(a: DirectoryRow, now: Date, graceDays: number) {
  const sub = a.organization.subscription;
  return !a.organization.suspendedAt && sub?.plan.audience === "artist" && subscriptionAccess(sub, now, graceDays).level === "full";
}

function card(a: DirectoryRow) {
  const ratings = a.organization.reviews;
  const prices = [a.priceFromCents, ...a.listings.map((l) => l.priceCents)].filter((p): p is number => typeof p === "number" && p > 0);
  return {
    id: a.id,
    slug: a.organization.slug,
    stageName: a.stageName,
    headline: a.headline,
    photoUrl: a.photoUrl,
    city: a.organization.city,
    genres: Array.isArray(a.genres) ? (a.genres as string[]) : [],
    currency: a.organization.currency,
    priceFromCents: prices.length ? Math.min(...prices) : null,
    rating: ratings.length ? { average: ratings.reduce((s, r) => s + r.rating, 0) / ratings.length, count: ratings.length } : null,
    regions: Array.isArray(a.organization.serviceRegions) ? (a.organization.serviceRegions as string[]) : [],
    eventTypes: Array.isArray(a.organization.serviceEventTypes) ? (a.organization.serviceEventTypes as string[]) : null,
  };
}

export type DirectoryArtist = ReturnType<typeof card>;

/** The public artist directory: independent artists with the Artist plan, filtered by text, place and event type. */
export async function directoryArtists(filters: { q?: string; place?: string; eventType?: string } = {}, now = new Date()) {
  const [rows, { graceDays }] = await Promise.all([
    prisma.artist.findMany({ where: { active: true, userId: { not: null }, organization: { kind: "solo" } }, include: directoryInclude }),
    getSetting("billing.defaults"),
  ]);
  const q = filters.q ? normalizePlace(filters.q) : "";
  const place = filters.place ? normalizePlace(filters.place) : "";
  return rows
    .filter((a) => listed(a, now, graceDays))
    .map(card)
    .filter((a) => !q || normalizePlace([a.stageName, a.headline ?? "", ...a.genres].join(" ")).includes(q))
    .filter((a) => !place || [a.city ?? "", ...a.regions].some((r) => normalizePlace(r) === place))
    .filter((a) => !filters.eventType || !a.eventTypes || a.eventTypes.includes(filters.eventType))
    .sort((a, b) => (b.rating?.average ?? 0) - (a.rating?.average ?? 0) || a.stageName.localeCompare(b.stageName));
}

/** One artist's public profile by their business slug, or null when they're not in the directory. */
export async function artistProfile(slug: string, now = new Date()) {
  const [artist, { graceDays }] = await Promise.all([
    prisma.artist.findFirst({ where: { active: true, userId: { not: null }, organization: { slug, kind: "solo" } }, include: directoryInclude }),
    getSetting("billing.defaults"),
  ]);
  if (!artist || !listed(artist, now, graceDays)) return null;
  const reviews = await prisma.review.findMany({
    where: { organizationId: artist.organizationId, status: "approved" },
    orderBy: { createdAt: "desc" },
    take: 6,
    select: { id: true, rating: true, comment: true, createdAt: true, customer: { select: { name: true } } },
  });
  return {
    ...card(artist),
    organizationId: artist.organizationId,
    bio: artist.bio,
    mediaLinks: Array.isArray(artist.mediaLinks) ? (artist.mediaLinks as string[]) : [],
    listings: artist.listings.map((l) => ({
      id: l.id,
      title: l.title,
      description: l.description,
      priceCents: l.priceCents,
      vatBps: l.vatBps,
      depositBps: l.depositBps,
      durationMinutes: l.durationMinutes,
      eventTypes: Array.isArray(l.eventTypes) ? (l.eventTypes as string[]) : null,
    })),
    reviews,
  };
}

export interface GigOrder {
  name: string;
  email: string;
  phone: string | null;
  eventType: EventType;
  eventDate: string;
  startTime: string | null;
  venueName: string | null;
  venueCity: string;
  guestCount: number | null;
  message: string | null;
}

/**
 * A customer orders a gig from an artist's profile: a booking with the gig's
 * price sent as a quote the customer accepts (and pays) from their email.
 */
export async function orderListing(slug: string, listingId: string, order: GigOrder, now = new Date()) {
  const profile = await artistProfile(slug, now);
  if (!profile) throw new ListingError("not_listed");
  const listing = await prisma.gigListing.findFirst({ where: { id: listingId, organizationId: profile.organizationId, active: true } });
  if (!listing) throw new ListingError("not_found");
  const artist = await prisma.artist.findUniqueOrThrow({ where: { id: listing.artistId }, select: { id: true, userId: true } });
  if (!(await isArtistFree(artist.id, toDateOnly(order.eventDate)))) throw new ListingError("unavailable");

  const customerId = await resolveBookingCustomer(profile.organizationId, { mode: "new", name: order.name, email: order.email, phone: order.phone });
  if (!customerId) throw new ListingError("customer_on_team");
  const booking = await createBooking(
    profile.organizationId,
    {
      customerId,
      eventType: order.eventType,
      eventDate: order.eventDate,
      startTime: order.startTime,
      venueName: order.venueName,
      venueCity: order.venueCity,
      guestCount: order.guestCount,
      message: order.message,
      source: "gig",
    },
    null,
  );
  await prisma.booking.update({ where: { id: booking.id }, data: { listingId: listing.id } });
  const { quoteExpiryDays } = await getSetting("bookings.defaults");
  const quote = await sendQuote(
    profile.organizationId,
    booking.id,
    { lines: [{ description: listing.title, quantityHundredths: 100, unitPriceCents: listing.priceCents, vatBps: listing.vatBps }], depositBps: listing.depositBps, expiresInDays: quoteExpiryDays, notes: listing.description },
    artist.userId!,
    now,
  );
  return { booking, quote, organizationId: profile.organizationId, artistUserId: artist.userId!, stageName: profile.stageName };
}
