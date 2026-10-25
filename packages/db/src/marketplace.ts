import { randomBytes, randomUUID } from "node:crypto";
import { computeQuote, type QuoteLineInput, type ServiceArea, servesRequest, subscriptionAccess } from "@stagedesk/core";
import { acceptQuote, sendQuote } from "./bookings";
import { prisma } from "./client";
import type { Prisma } from "./generated/prisma/client";
import { geocode } from "./geo";
import { assignLead, LeadError } from "./leads";
import { getSetting } from "./settings";

/**
 * The marketplace side of leads: a customer's request goes out to every
 * provider serving its area, each may send a price, and the customer
 * accepts one, which becomes a booking with that provider.
 */

export class MarketError extends Error {
  constructor(readonly code: "not_found" | "closed" | "not_offered" | "invalid_quote" | "expired") {
    super(`Marketplace: ${code}`);
    this.name = "MarketError";
  }
}


const asStrings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/** A provider's area as stored on its organization. Without regions or a radius, its own city counts. */
export function areaOf(o: {
  serviceRegions: unknown;
  serviceRadiusKm: number | null;
  serviceEventTypes: unknown;
  latitude: number | null;
  longitude: number | null;
  city: string | null;
}): ServiceArea {
  const regions = asStrings(o.serviceRegions);
  const types = o.serviceEventTypes === null || o.serviceEventTypes === undefined ? null : asStrings(o.serviceEventTypes);
  return {
    regions: regions.length === 0 && !o.serviceRadiusKm && o.city ? [o.city] : regions,
    radiusKm: o.serviceRadiusKm,
    location: o.latitude !== null && o.longitude !== null ? { latitude: o.latitude, longitude: o.longitude } : null,
    eventTypes: types,
  };
}

const openStatuses = ["new", "offered"];

/**
 * Sends a lead to every provider that serves it: not suspended, taking
 * requests, with a working subscription, and covering the city (by region or
 * radius) and event type. Returns the organizations newly offered.
 */
export async function broadcastLead(leadId: string, now = new Date()) {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead || !openStatuses.includes(lead.status)) return [];

  let location = lead.latitude !== null && lead.longitude !== null ? { latitude: lead.latitude, longitude: lead.longitude } : null;
  let region = lead.region;
  let city: string | null = null;
  if (!location && lead.venueCity) {
    const hit = await geocode(lead.venueCity);
    if (hit) {
      location = { latitude: hit.latitude, longitude: hit.longitude };
      region = hit.region;
      city = hit.city;
      await prisma.lead.update({ where: { id: leadId }, data: { latitude: hit.latitude, longitude: hit.longitude, region: hit.region } });
    }
  }

  const [orgs, { graceDays }] = await Promise.all([
    prisma.organization.findMany({
      where: { suspendedAt: null, acceptsLeads: true },
      select: {
        id: true,
        city: true,
        serviceRegions: true,
        serviceRadiusKm: true,
        serviceEventTypes: true,
        latitude: true,
        longitude: true,
        subscription: true,
      },
    }),
    getSetting("billing.defaults"),
  ]);
  const request = { places: [lead.venueCity, ...(city ?? "").split("|"), ...(region ?? "").split("|")].filter((p): p is string => Boolean(p)), location, eventType: lead.eventType };
  const matching = orgs.filter((o) => subscriptionAccess(o.subscription, now, graceDays).level === "full" && servesRequest(areaOf(o), request)).map((o) => o.id);

  const existing = await prisma.leadOffer.findMany({ where: { leadId, agencyId: { in: matching } }, select: { agencyId: true } });
  const fresh = matching.filter((id) => !existing.some((e) => e.agencyId === id));
  await prisma.$transaction([
    prisma.leadOffer.createMany({ data: fresh.map((agencyId) => ({ id: randomUUID(), leadId, agencyId, source: "broadcast" })) }),
    prisma.lead.update({ where: { id: leadId }, data: { broadcastAt: now, ...(fresh.length > 0 && lead.status === "new" ? { status: "offered" } : {}) } }),
  ]);
  return fresh;
}

export interface LeadQuoteInput {
  lines: QuoteLineInput[];
  depositBps: number;
  validDays: number;
  message: string | null;
}

/** A provider's price for an offered lead; sending again replaces it. The customer is told by the caller. */
export async function quoteLeadOffer(leadId: string, organizationId: string, input: LeadQuoteInput, userId: string, now = new Date()) {
  const offer = await prisma.leadOffer.findUnique({
    where: { leadId_agencyId: { leadId, agencyId: organizationId } },
    include: { lead: { select: { status: true } }, agency: { select: { currency: true } } },
  });
  if (!offer || !["pending", "quoted"].includes(offer.status)) throw new MarketError("not_offered");
  if (!openStatuses.includes(offer.lead.status)) throw new MarketError("closed");
  if (input.lines.length === 0 || input.lines.length > 10 || input.validDays < 1 || input.validDays > 60) throw new MarketError("invalid_quote");
  let totals;
  try {
    totals = computeQuote(input.lines, input.depositBps);
  } catch {
    throw new MarketError("invalid_quote");
  }
  if (totals.totalCents <= 0) throw new MarketError("invalid_quote");
  return prisma.leadOffer.update({
    where: { id: offer.id },
    data: {
      status: "quoted",
      quoteLines: input.lines as unknown as Prisma.InputJsonValue,
      depositBps: input.depositBps,
      totalCents: totals.totalCents,
      depositCents: totals.depositCents,
      currency: offer.agency.currency,
      quoteMessage: input.message?.slice(0, 2000) || null,
      quotedAt: now,
      quotedById: userId,
      respondedById: userId,
      respondedAt: now,
      validUntil: new Date(now.getTime() + input.validDays * 86_400_000),
    },
  });
}

/** The provider passes, or takes back its price. */
export async function declineLeadOffer(leadId: string, organizationId: string, userId: string) {
  const done = await prisma.leadOffer.updateMany({
    where: { leadId, agencyId: organizationId, status: { in: ["pending", "quoted"] } },
    data: { status: "declined", respondedById: userId, respondedAt: new Date() },
  });
  if (done.count === 0) throw new MarketError("not_offered");
}

/** What the customer sees on their request page: the request and the prices so far, best rated first on ties. */
export async function leadForCustomer(reference: string, token: string, now = new Date()) {
  const lead = await prisma.lead.findUnique({
    where: { reference },
    include: {
      offers: {
        where: { status: { in: ["quoted", "accepted"] } },
        orderBy: { quotedAt: "asc" },
        include: { agency: { select: { id: true, name: true, city: true, logo: true, slug: true, reviews: { where: { status: "approved" }, select: { rating: true } } } } },
      },
    },
  });
  if (!lead || !lead.accessToken || lead.accessToken !== token) return null;
  const booking = lead.bookingId ? await prisma.booking.findUnique({ where: { id: lead.bookingId }, select: { trackingCode: true } }) : null;
  return {
    lead,
    booking,
    offers: lead.offers.map((o) => ({
      id: o.id,
      status: o.status,
      provider: { name: o.agency.name, city: o.agency.city, logo: o.agency.logo, slug: o.agency.slug },
      rating: o.agency.reviews.length ? { average: o.agency.reviews.reduce((s, r) => s + r.rating, 0) / o.agency.reviews.length, count: o.agency.reviews.length } : null,
      lines: (o.quoteLines ?? []) as unknown as QuoteLineInput[],
      totalCents: o.totalCents ?? 0,
      depositCents: o.depositCents ?? 0,
      currency: o.currency ?? "EUR",
      message: o.quoteMessage,
      validUntil: o.validUntil,
      expired: o.status === "quoted" && o.validUntil !== null && o.validUntil < now,
    })),
  };
}

/**
 * The customer accepts one price: the lead becomes a booking with that
 * provider, the price becomes its accepted quote, and every other offer is
 * marked lost. Returns what the caller needs for emails.
 */
export async function acceptLeadOffer(reference: string, token: string, offerId: string, now = new Date()) {
  const lead = await prisma.lead.findUnique({ where: { reference } });
  if (!lead || lead.accessToken !== token) throw new MarketError("not_found");
  if (!openStatuses.includes(lead.status)) throw new MarketError("closed");
  const offer = await prisma.leadOffer.findFirst({ where: { id: offerId, leadId: lead.id, status: "quoted" } });
  if (!offer || !offer.quotedById) throw new MarketError("not_offered");
  if (offer.validUntil && offer.validUntil < now) throw new MarketError("expired");

  let assigned;
  try {
    assigned = await assignLead(lead.id, offer.agencyId, null);
  } catch (error) {
    if (error instanceof LeadError) throw new MarketError(error.code === "not_found" ? "not_found" : "closed");
    throw error;
  }
  const { booking, agency } = assigned;
  const quote = await sendQuote(
    offer.agencyId,
    booking.id,
    { lines: (offer.quoteLines ?? []) as unknown as QuoteLineInput[], depositBps: offer.depositBps ?? 0, expiresInDays: 14, notes: offer.quoteMessage },
    offer.quotedById,
    now,
  );
  await acceptQuote(offer.agencyId, quote.id, { actor: "customer", actorId: null, name: lead.name }, now);

  const others = await prisma.leadOffer.findMany({ where: { leadId: lead.id, id: { not: offer.id }, status: { in: ["pending", "quoted", "withdrawn"] } }, select: { agencyId: true } });
  await prisma.$transaction([
    prisma.leadOffer.update({ where: { id: offer.id }, data: { status: "accepted" } }),
    prisma.leadOffer.updateMany({ where: { leadId: lead.id, id: { not: offer.id }, status: { in: ["pending", "quoted", "withdrawn"] } }, data: { status: "lost" } }),
  ]);
  return { lead, booking, agency, lostTo: others.map((o) => o.agencyId) };
}
