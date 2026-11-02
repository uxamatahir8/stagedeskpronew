import { createHash, randomBytes, randomUUID } from "node:crypto";
import { type EventType, eventTypes } from "@stagedesk/core";
import { fromDateOnly, toDateOnly } from "./bookings";
import { prisma } from "./client";
import { Prisma } from "./generated/prisma/client";
import { agencyDeskUserIds, notify } from "./notifications";
import { tenantDb } from "./tenant";

/**
 * Booking details a customer fills in through a private link (after a phone
 * call, say). Only the hash of the link's secret is stored; a link expires,
 * can be revoked, works once, and a new link revokes the old one. It only
 * works while the booking has no accepted quote (inquiry, quoted, expired),
 * so it can never change what was agreed or paid. A field the agency changed
 * after sending the link keeps the agency's value.
 */

export class DetailRequestError extends Error {
  constructor(readonly code: "not_found" | "invalid_status" | "no_customer") {
    super(`Detail request: ${code}`);
    this.name = "DetailRequestError";
  }
}

/** Statuses in which the customer may still fill in event details. */
export const detailRequestStatuses = ["inquiry", "quoted", "expired"] as const;

export const detailFields = ["eventType", "eventDate", "startTime", "endTime", "venueName", "venueAddress", "venueCity", "guestCount", "partnerName", "preferredGenre", "playlistUrl"] as const;
export type DetailField = (typeof detailFields)[number];

export interface DetailInput {
  eventType: EventType;
  eventDate: string | null;
  startTime: string | null;
  endTime: string | null;
  venueName: string | null;
  venueAddress: string | null;
  venueCity: string | null;
  guestCount: number | null;
  partnerName: string | null;
  preferredGenre: string | null;
  playlistUrl: string | null;
  /** Wishes and instructions, added to the booking's message. */
  notes: string | null;
  /** Only stored when the customer has no phone number yet. */
  phone: string | null;
}

const hash = (token: string) => createHash("sha256").update(token).digest("base64url");

type BookingFields = Record<DetailField, string | number | null>;

function fieldsOf(b: { eventType: string; eventDate: Date | null; startTime: string | null; endTime: string | null; venueName: string | null; venueAddress: string | null; venueCity: string | null; guestCount: number | null; partnerName: string | null; preferredGenre: string | null; playlistUrl: string | null }): BookingFields {
  return {
    eventType: b.eventType,
    eventDate: fromDateOnly(b.eventDate),
    startTime: b.startTime,
    endTime: b.endTime,
    venueName: b.venueName,
    venueAddress: b.venueAddress,
    venueCity: b.venueCity,
    guestCount: b.guestCount,
    partnerName: b.partnerName,
    preferredGenre: b.preferredGenre,
    playlistUrl: b.playlistUrl,
  };
}

/** Makes a new link for a booking (the previous open one stops working). Returns the secret once; only its hash is kept. */
export async function createDetailRequest(organizationId: string, bookingId: string, actorId: string, opts: { locale: "nl" | "en"; days?: number; emailedTo?: string | null }, now = new Date()) {
  const db = tenantDb(organizationId);
  const token = randomBytes(32).toString("base64url");
  const days = Math.max(1, Math.min(30, Math.trunc(opts.days ?? 7)));
  const expiresAt = new Date(now.getTime() + days * 86_400_000);
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${bookingId} FOR UPDATE`;
    const booking = await tx.booking.findFirst({ where: { id: bookingId } });
    if (!booking) throw new DetailRequestError("not_found");
    if (!(detailRequestStatuses as readonly string[]).includes(booking.status)) throw new DetailRequestError("invalid_status");
    if (!booking.customerId) throw new DetailRequestError("no_customer");
    await tx.bookingDetailRequest.updateMany({ where: { bookingId, revokedAt: null, submittedAt: null }, data: { revokedAt: now } });
    await tx.bookingDetailRequest.create({
      data: {
        id: randomUUID(),
        organizationId,
        bookingId,
        tokenHash: hash(token),
        locale: opts.locale,
        bookingVersion: booking.updatedAt,
        snapshot: fieldsOf(booking) as Prisma.InputJsonValue,
        expiresAt,
        createdById: actorId,
        emailedTo: opts.emailedTo ?? null,
      },
    });
    await tx.bookingEvent.create({ data: { bookingId, type: "details_requested", actorId, data: { expiresAt: expiresAt.toISOString() }, organizationId: "" } });
  });
  return { token, expiresAt };
}

export async function revokeDetailRequests(organizationId: string, bookingId: string, actorId: string, now = new Date()) {
  const db = tenantDb(organizationId);
  const { count } = await db.bookingDetailRequest.updateMany({ where: { bookingId, revokedAt: null, submittedAt: null }, data: { revokedAt: now } });
  if (count > 0) await db.bookingEvent.create({ data: { bookingId, type: "details_link_revoked", actorId, data: Prisma.JsonNull, organizationId: "" } });
  return count;
}

/** The open link of a booking, for the booking page. */
export function openDetailRequest(organizationId: string, bookingId: string, now = new Date()) {
  return tenantDb(organizationId).bookingDetailRequest.findFirst({
    where: { bookingId, revokedAt: null, submittedAt: null, expiresAt: { gt: now } },
    orderBy: { createdAt: "desc" },
    select: { id: true, expiresAt: true, emailedTo: true, createdAt: true, locale: true },
  });
}

/**
 * What the customer's link page shows. Null for any link that doesn't work
 * (unknown, revoked, used, expired, or the booking moved on) so the page
 * can't be used to tell those apart.
 */
export async function detailRequestByToken(token: string, now = new Date()) {
  if (!/^[\w-]{20,100}$/.test(token)) return null;
  const request = await prisma.bookingDetailRequest.findUnique({
    where: { tokenHash: hash(token) },
    include: {
      booking: { include: { customer: { select: { name: true, phone: true } }, organization: { select: { name: true, logo: true, contactEmail: true, phone: true, suspendedAt: true } } } },
    },
  });
  if (!request || request.revokedAt || request.submittedAt || request.expiresAt <= now) return null;
  const b = request.booking;
  if (!(detailRequestStatuses as readonly string[]).includes(b.status) || b.organization.suspendedAt) return null;
  return {
    locale: request.locale === "en" ? ("en" as const) : ("nl" as const),
    expiresAt: request.expiresAt,
    agency: { name: b.organization.name, logo: b.organization.logo, contactEmail: b.organization.contactEmail, phone: b.organization.phone },
    customer: { name: b.customer?.name ?? "", hasPhone: Boolean(b.customer?.phone) },
    trackingCode: b.trackingCode,
    fields: fieldsOf(b),
  };
}

/**
 * Saves what the customer filled in, once. Fields the agency changed after
 * sending the link keep the agency's value and are returned in `kept`.
 * Returns null when the link no longer works.
 */
export async function submitDetailRequest(token: string, input: DetailInput, now = new Date()) {
  if (!/^[\w-]{20,100}$/.test(token)) return null;
  if (!(eventTypes as readonly string[]).includes(input.eventType)) return null;
  const found = await prisma.bookingDetailRequest.findUnique({ where: { tokenHash: hash(token) }, select: { id: true, organizationId: true, bookingId: true } });
  if (!found) return null;
  const db = tenantDb(found.organizationId);
  const result = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${found.bookingId} FOR UPDATE`;
    // Read again under the lock: a second submit or a revoke may just have committed.
    const request = await tx.bookingDetailRequest.findFirst({ where: { id: found.id } });
    const booking = await tx.booking.findFirst({ where: { id: found.bookingId } });
    if (!request || !booking || request.revokedAt || request.submittedAt || request.expiresAt <= now) return null;
    if (!(detailRequestStatuses as readonly string[]).includes(booking.status)) return null;

    const before = request.snapshot as unknown as BookingFields;
    const current = fieldsOf(booking);
    const wanted: BookingFields = {
      eventType: input.eventType,
      eventDate: input.eventDate,
      startTime: input.startTime,
      endTime: input.endTime,
      venueName: input.venueName,
      venueAddress: input.venueAddress,
      venueCity: input.venueCity,
      guestCount: input.guestCount,
      partnerName: input.partnerName,
      preferredGenre: input.preferredGenre,
      playlistUrl: input.playlistUrl,
    };
    const kept: DetailField[] = [];
    const data: Prisma.BookingUpdateManyMutationInput = {};
    for (const field of detailFields) {
      if (String(current[field] ?? "") !== String(before[field] ?? "")) {
        if (String(wanted[field] ?? "") !== String(current[field] ?? "")) kept.push(field);
        continue;
      }
      if (String(wanted[field] ?? "") === String(current[field] ?? "")) continue;
      const value = wanted[field];
      if (field === "eventDate") data.eventDate = value ? toDateOnly(String(value)) : null;
      else if (field === "guestCount") data.guestCount = value === null ? null : Number(value);
      else (data as Record<string, unknown>)[field] = value;
    }
    if (input.notes?.trim()) {
      const note = input.notes.trim().slice(0, 4000);
      data.message = booking.message ? `${booking.message}\n\n— ${note}` : note;
    }
    if (Object.keys(data).length > 0) await tx.booking.updateMany({ where: { id: booking.id }, data });
    if (input.phone?.trim() && booking.customerId) {
      await tx.user.updateMany({ where: { id: booking.customerId, OR: [{ phone: null }, { phone: "" }] }, data: { phone: input.phone.trim().slice(0, 32) } });
    }
    await tx.bookingDetailRequest.updateMany({ where: { id: request.id }, data: { submittedAt: now } });
    await tx.bookingEvent.create({ data: { bookingId: booking.id, type: "details_submitted", actorId: booking.customerId, data: { fields: Object.keys(data), kept }, organizationId: "" } });
    return { code: booking.trackingCode, customer: booking.customerId, kept };
  });
  if (!result) return null;
  const customer = result.customer ? await prisma.user.findUnique({ where: { id: result.customer }, select: { name: true } }) : null;
  await notify(await agencyDeskUserIds(found.organizationId), { type: "details_submitted", data: { name: customer?.name ?? "", code: result.code }, url: `/app/bookings/${result.code}` });
  return { kept: result.kept };
}
