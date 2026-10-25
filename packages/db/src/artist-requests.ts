import { randomUUID } from "node:crypto";
import { normalizePlace } from "@stagedesk/core";
import { assignLentArtist, isArtistFree } from "./bookings";
import { prisma } from "./client";

/**
 * Agencies lending artists to each other for one booking. The booking agency
 * (borrower) asks with a fee; the artist's agency (lender) accepts, declines
 * or counters, and so on in turns. Accepting puts the artist on the booking;
 * at payout the fee goes to the lender (packages/payments payouts).
 */

export class ArtistRequestError extends Error {
  constructor(readonly code: "not_found" | "not_your_turn" | "closed" | "invalid_status" | "not_lendable" | "unavailable" | "duplicate" | "invalid_fee") {
    super(`Artist request: ${code}`);
    this.name = "ArtistRequestError";
  }
}

const bookable = ["booked", "confirmed"];

/** Artists other agencies lend out who are free on the booking's date, matching the search. */
export async function lendableArtists(borrowerId: string, bookingId: string, q = "") {
  const booking = await prisma.booking.findFirst({ where: { id: bookingId, organizationId: borrowerId }, select: { eventDate: true, venueCity: true } });
  if (!booking) throw new ArtistRequestError("not_found");
  const artists = await prisma.artist.findMany({
    where: { lendable: true, active: true, organizationId: { not: borrowerId }, organization: { suspendedAt: null } },
    select: {
      id: true,
      stageName: true,
      genres: true,
      photoUrl: true,
      priceFromCents: true,
      organization: { select: { id: true, name: true, city: true } },
    },
    orderBy: { stageName: "asc" },
    take: 300,
  });
  const needle = normalizePlace(q);
  const matching = artists.filter((a) => !needle || normalizePlace([a.stageName, a.organization.name, a.organization.city ?? "", ...(Array.isArray(a.genres) ? (a.genres as string[]) : [])].join(" ")).includes(needle));
  const free = [];
  for (const a of matching) {
    if (booking.eventDate && !(await isArtistFree(a.id, booking.eventDate))) continue;
    free.push({ ...a, genres: Array.isArray(a.genres) ? (a.genres as string[]) : [], nearby: Boolean(booking.venueCity && a.organization.city && normalizePlace(a.organization.city) === normalizePlace(booking.venueCity)) });
    if (free.length >= 30) break;
  }
  // Agencies in the event's city first.
  return free.sort((a, b) => Number(b.nearby) - Number(a.nearby));
}

export async function createArtistRequest(borrowerId: string, input: { bookingId: string; artistId: string; feeCents: number; message: string | null }, userId: string) {
  if (!Number.isSafeInteger(input.feeCents) || input.feeCents <= 0) throw new ArtistRequestError("invalid_fee");
  const [booking, artist] = await Promise.all([
    prisma.booking.findFirst({ where: { id: input.bookingId, organizationId: borrowerId }, select: { id: true, status: true, eventDate: true, currency: true } }),
    prisma.artist.findUnique({ where: { id: input.artistId }, select: { id: true, lendable: true, active: true, organizationId: true } }),
  ]);
  if (!booking) throw new ArtistRequestError("not_found");
  if (!bookable.includes(booking.status)) throw new ArtistRequestError("invalid_status");
  if (!artist || !artist.lendable || !artist.active || artist.organizationId === borrowerId) throw new ArtistRequestError("not_lendable");
  if (booking.eventDate && !(await isArtistFree(artist.id, booking.eventDate))) throw new ArtistRequestError("unavailable");
  const open = await prisma.artistRequest.count({ where: { bookingId: booking.id, artistId: artist.id, status: "pending" } });
  if (open) throw new ArtistRequestError("duplicate");
  return prisma.artistRequest.create({
    data: {
      id: randomUUID(),
      bookingId: booking.id,
      borrowerId,
      lenderId: artist.organizationId,
      artistId: artist.id,
      feeCents: input.feeCents,
      currency: booking.currency,
      message: input.message?.slice(0, 2000) || null,
      createdById: userId,
    },
  });
}

export type ArtistRequestAnswer = { action: "accept" } | { action: "decline" } | { action: "counter"; feeCents: number; message: string | null } | { action: "withdraw" };

/**
 * One side answers the current offer: the side that didn't make it may
 * accept, decline or counter; the side that made it may withdraw it.
 * Returns the request and who should be told (the other agency).
 */
export async function answerArtistRequest(requestId: string, organizationId: string, answer: ArtistRequestAnswer, userId: string, now = new Date()) {
  const request = await prisma.artistRequest.findUnique({ where: { id: requestId } });
  if (!request || (request.borrowerId !== organizationId && request.lenderId !== organizationId)) throw new ArtistRequestError("not_found");
  if (request.status !== "pending") throw new ArtistRequestError("closed");
  const side = request.borrowerId === organizationId ? "borrower" : "lender";
  const theirTurn = request.offeredBy !== side;
  if (answer.action === "withdraw" ? theirTurn : !theirTurn) throw new ArtistRequestError("not_your_turn");

  switch (answer.action) {
    case "accept":
      // The artist goes on the booking first; if that fails (date taken, booking changed) nothing is agreed.
      await assignLentArtist(request.borrowerId, request.bookingId, request.artistId, userId, now).catch((error) => {
        throw error?.code === "artist_unavailable" ? new ArtistRequestError("unavailable") : error?.code === "invalid_status" ? new ArtistRequestError("invalid_status") : error;
      });
      await prisma.$transaction([
        prisma.artistRequest.update({ where: { id: request.id }, data: { status: "accepted", respondedAt: now } }),
        // Other open asks for this booking are no longer needed.
        prisma.artistRequest.updateMany({ where: { bookingId: request.bookingId, id: { not: request.id }, status: "pending" }, data: { status: "cancelled", respondedAt: now } }),
      ]);
      break;
    case "decline":
      await prisma.artistRequest.update({ where: { id: request.id }, data: { status: "declined", respondedAt: now } });
      break;
    case "withdraw":
      await prisma.artistRequest.update({ where: { id: request.id }, data: { status: "withdrawn", respondedAt: now } });
      break;
    case "counter":
      if (!Number.isSafeInteger(answer.feeCents) || answer.feeCents <= 0) throw new ArtistRequestError("invalid_fee");
      await prisma.artistRequest.update({ where: { id: request.id }, data: { feeCents: answer.feeCents, offeredBy: side, message: answer.message?.slice(0, 2000) || null, respondedAt: now } });
      break;
  }
  const fresh = await prisma.artistRequest.findUniqueOrThrow({ where: { id: request.id }, include: { artist: { select: { stageName: true } }, booking: { select: { trackingCode: true } } } });
  return { request: fresh, side, notifyOrganizationId: side === "borrower" ? request.lenderId : request.borrowerId };
}

/** Both directions for one agency: what it asked others for, and what others ask of it. */
export async function artistRequestsFor(organizationId: string) {
  const rows = await prisma.artistRequest.findMany({
    where: { OR: [{ borrowerId: organizationId }, { lenderId: organizationId }] },
    orderBy: [{ updatedAt: "desc" }],
    take: 200,
    include: {
      artist: { select: { stageName: true, photoUrl: true } },
      borrower: { select: { name: true, city: true } },
      lender: { select: { name: true, city: true } },
      // The lender sees the gig, not the customer.
      booking: { select: { trackingCode: true, eventType: true, eventDate: true, startTime: true, venueName: true, venueCity: true, guestCount: true } },
    },
  });
  return rows.map((r) => {
    const side = r.borrowerId === organizationId ? ("borrower" as const) : ("lender" as const);
    return { ...r, side, myTurn: r.status === "pending" && r.offeredBy !== side, booking: { ...r.booking, trackingCode: side === "borrower" ? r.booking.trackingCode : null } };
  });
}

/** The fee owed to a lending agency for a booking (an accepted request), for payouts. */
export async function lenderFee(bookingId: string) {
  return prisma.artistRequest.findFirst({ where: { bookingId, status: "accepted" }, select: { id: true, lenderId: true, feeCents: true, currency: true } });
}
