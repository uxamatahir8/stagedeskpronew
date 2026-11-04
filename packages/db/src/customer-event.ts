import { randomUUID } from "node:crypto";
import {
  customerChangeMode,
  customerPreferencesOpen,
  eventTypes,
  playlistLink,
  type QuoteEventField,
  quoteEventFields,
  quoteEventSnapshot,
  todayInNetherlands,
} from "@stagedesk/core";
import { auditTx } from "./audit";
import { applyBookingDetails, type BookingTx as Tx, fromDateOnly, notifyBriefChanged, toDateOnly } from "./bookings";
import { equipmentTx } from "./booking-equipment";
import { prisma } from "./client";
import { Prisma } from "./generated/prisma/client";
import { agencyDeskUserIds, notify } from "./notifications";
import { tenantDb } from "./tenant";

/**
 * What customers do to their own event from their portal: edit their wishes,
 * and change or ask to change the contract details. Every operation starts from
 * the booking and the customer's id together, so someone else's booking simply
 * isn't found, and only the fields named here can ever be written: no totals,
 * artist pay or equipment.
 */

export type CustomerEventErrorCode = "not_found" | "closed" | "locked_by_agency" | "invalid_playlist" | "invalid_date" | "invalid_details" | "no_changes" | "not_pending" | "date_required";

export class CustomerEventError extends Error {
  constructor(readonly code: CustomerEventErrorCode) {
    super(`Customer event: ${code}`);
    this.name = "CustomerEventError";
  }
}

export interface CustomerPreferencesInput {
  preferredGenre: string | null;
  dos: string[];
  donts: string[];
  playlistUrl: string | null;
  musicRequests: string | null;
  specialRequests: string | null;
}

const clean = (value: string | null | undefined, max: number) => value?.trim().slice(0, max) || null;
const cleanList = (list: string[]) => list.map((l) => l.trim().slice(0, 200)).filter(Boolean).slice(0, 30);
const listOf = (value: unknown) => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []);

/** Locks the booking, then finds it only if it belongs to this customer. */
async function ownBooking(tx: Tx, bookingId: string, customerId: string) {
  await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${bookingId} FOR UPDATE`;
  const booking = await tx.booking.findFirst({ where: { id: bookingId, customerId }, include: { customer: { select: { name: true } } } });
  if (!booking) throw new CustomerEventError("not_found");
  return booking;
}

/**
 * Saves the customer's wishes. A save that changes nothing (a retry, a double
 * click) records nothing and tells nobody, so people never get duplicates.
 */
export async function updateCustomerPreferences(organizationId: string, bookingId: string, customerId: string, input: CustomerPreferencesInput, now = new Date()) {
  const next = {
    preferredGenre: clean(input.preferredGenre, 96),
    dos: cleanList(input.dos),
    donts: cleanList(input.donts),
    musicRequests: clean(input.musicRequests, 4000),
    specialRequests: clean(input.specialRequests, 4000),
    playlistUrl: null as string | null,
  };
  if (clean(input.playlistUrl, 500)) {
    const link = playlistLink(input.playlistUrl);
    if (!link) throw new CustomerEventError("invalid_playlist");
    next.playlistUrl = link.url;
  }

  const result = await tenantDb(organizationId).$transaction(async (tx) => {
    const booking = await ownBooking(tx, bookingId, customerId);
    const org = await tx.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { customerPreferencesEditable: true } });
    if (!org.customerPreferencesEditable) throw new CustomerEventError("locked_by_agency");
    if (!customerPreferencesOpen(booking.status, fromDateOnly(booking.eventDate), todayInNetherlands(now))) throw new CustomerEventError("closed");

    const before: Record<string, unknown> = {
      preferredGenre: booking.preferredGenre,
      dos: listOf(booking.dos),
      donts: listOf(booking.donts),
      playlistUrl: booking.playlistUrl,
      musicRequests: booking.musicRequests,
      specialRequests: booking.specialRequests,
    };
    const changed = Object.entries(next).filter(([field, value]) => JSON.stringify(before[field]) !== JSON.stringify(value)).map(([field]) => field);
    if (changed.length > 0) {
      await tx.booking.updateMany({ where: { id: booking.id }, data: next });
      await tx.bookingEvent.create({ data: { bookingId: booking.id, type: "preferences_updated", actorId: customerId, data: { fields: changed }, organizationId: "" } });
      await auditTx(tx, { actorId: customerId, action: "booking.customer_preferences", agencyId: organizationId, targetType: "booking", targetId: booking.id, data: { fields: changed } });
    }
    return { changed, booking };
  });
  if (result.changed.length > 0) {
    const b = result.booking;
    await safeNotify(async () => {
      await notify(await agencyDeskUserIds(organizationId), { type: "preferences_updated", data: { name: b.customer?.name ?? "", code: b.trackingCode }, url: `/app/bookings/${b.trackingCode}` }, customerId);
      const active = await prisma.bookingAssignment.findMany({ where: { bookingId: b.id, status: { in: ["pending", "accepted"] } }, select: { artist: { select: { userId: true } } } });
      await notify(active.map((a) => a.artist.userId), { type: "preferences_updated", data: { name: b.customer?.name ?? "", code: b.trackingCode }, url: `/app/gigs/${b.trackingCode}` }, customerId);
    });
  }
  return { changed: result.changed };
}

async function safeNotify(task: () => Promise<unknown>) {
  try {
    await task();
  } catch (error) {
    // The change itself stands; a failed notification must not report it as failed.
    console.error("[customer-event] notification failed", error);
  }
}

export type EventChanges = Partial<Record<QuoteEventField, string | number | null>>;
export type EventDetailsInput = Record<QuoteEventField, string | number | null>;

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

function checkDetails(input: EventDetailsInput, today: string, hadDate: boolean) {
  if (!(eventTypes as readonly string[]).includes(String(input.eventType))) throw new CustomerEventError("invalid_details");
  const date = input.eventDate === null ? null : String(input.eventDate);
  if (date !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`)))) throw new CustomerEventError("invalid_details");
  if (date !== null && date < today) throw new CustomerEventError("invalid_date");
  if (date === null && hadDate) throw new CustomerEventError("date_required");
  for (const time of [input.startTime, input.endTime]) if (time !== null && !timePattern.test(String(time))) throw new CustomerEventError("invalid_details");
  const guests = input.guestCount;
  if (guests !== null && (!Number.isInteger(guests) || Number(guests) < 1 || Number(guests) > 100_000)) throw new CustomerEventError("invalid_details");
}

/** The fields that would really change; text compared without case or surrounding space, like a quote's snapshot. */
function diffDetails(current: Record<QuoteEventField, string | number | null>, wanted: EventDetailsInput): EventChanges {
  const norm = (v: unknown) => (v === null || v === undefined || v === "" ? "" : String(v).trim().toLowerCase());
  const changes: EventChanges = {};
  for (const field of quoteEventFields) if (norm(current[field]) !== norm(wanted[field])) changes[field] = wanted[field];
  return changes;
}

/** Turns stored changes into what the booking's update takes, keeping the date when it isn't one of them. */
function changesToData(changes: EventChanges, currentDate: Date | null) {
  const { eventDate, ...rest } = changes;
  return { ...(rest as Prisma.BookingUpdateManyMutationInput), eventDate: eventDate === undefined ? currentDate : eventDate === null ? null : toDateOnly(String(eventDate)) };
}

/**
 * A customer changes the contract details. Before a quote is out it goes straight
 * through; after that it becomes a request for the agency, and the booking itself
 * doesn't change until they approve. A new request replaces an open one; asking
 * for the same thing again changes nothing and tells nobody.
 */
export async function submitEventChange(organizationId: string, bookingId: string, customerId: string, input: EventDetailsInput, note: string | null, now = new Date()) {
  const today = todayInNetherlands(now);
  const result = await tenantDb(organizationId).$transaction(async (tx) => {
    const booking = await ownBooking(tx, bookingId, customerId);
    const date = fromDateOnly(booking.eventDate);
    const mode = customerChangeMode(booking.status, date, today);
    if (mode === "closed") throw new CustomerEventError("closed");
    const wanted: EventDetailsInput = {
      eventType: input.eventType,
      eventDate: input.eventDate,
      startTime: clean(input.startTime as string | null, 5),
      endTime: clean(input.endTime as string | null, 5),
      venueName: clean(input.venueName as string | null, 191),
      venueAddress: clean(input.venueAddress as string | null, 191),
      venueCity: clean(input.venueCity as string | null, 96),
      guestCount: input.guestCount,
    };
    checkDetails(wanted, today, date !== null);
    const current = quoteEventSnapshot(booking);
    const changes = diffDetails(current as Record<QuoteEventField, string | number | null>, wanted);
    if (Object.keys(changes).length === 0) throw new CustomerEventError("no_changes");

    if (mode === "direct") {
      await applyBookingDetails(tx, organizationId, booking, changesToData(changes, booking.eventDate), customerId, { type: "customer_event_updated", data: { fields: Object.keys(changes) } });
      await auditTx(tx, { actorId: customerId, action: "booking.customer_details", agencyId: organizationId, targetType: "booking", targetId: booking.id, data: { fields: Object.keys(changes) } });
      return { mode, booking, isNew: true, requestId: null as string | null };
    }

    const open = await tx.bookingChangeRequest.findFirst({ where: { bookingId, status: "pending" }, orderBy: { createdAt: "desc" } });
    const trimmedNote = clean(note, 2000);
    if (open && JSON.stringify(open.changes) === JSON.stringify(changes) && (open.note ?? null) === trimmedNote) {
      return { mode, booking, isNew: false, requestId: open.id };
    }
    await tx.bookingChangeRequest.updateMany({ where: { bookingId, status: "pending" }, data: { status: "superseded", decidedAt: now } });
    const id = randomUUID();
    const baseline = Object.fromEntries(Object.keys(changes).map((f) => [f, current[f as QuoteEventField]]));
    await tx.bookingChangeRequest.create({
      data: { id, organizationId, bookingId, status: "pending", changes: changes as Prisma.InputJsonValue, baseline: baseline as Prisma.InputJsonValue, note: trimmedNote, requestedById: customerId },
    });
    await tx.bookingEvent.create({ data: { bookingId, type: "change_requested", actorId: customerId, data: { fields: Object.keys(changes) }, organizationId: "" } });
    await auditTx(tx, { actorId: customerId, action: "booking.change_requested", agencyId: organizationId, targetType: "booking", targetId: bookingId, data: { requestId: id, fields: Object.keys(changes) } });
    return { mode, booking, isNew: true, requestId: id };
  }, equipmentTx);
  if (result.isNew) {
    const b = result.booking;
    await safeNotify(async () => {
      await notify(await agencyDeskUserIds(organizationId), { type: result.mode === "direct" ? "details_submitted" : "change_requested", data: { name: b.customer?.name ?? "", code: b.trackingCode }, url: `/app/bookings/${b.trackingCode}` }, customerId);
    });
  }
  return { mode: result.mode as "direct" | "request", requestId: result.requestId };
}

/** The customer takes their open request back. */
export async function withdrawChangeRequest(organizationId: string, requestId: string, customerId: string, now = new Date()) {
  const db = tenantDb(organizationId);
  await db.$transaction(async (tx) => {
    const { count } = await tx.bookingChangeRequest.updateMany({ where: { id: requestId, requestedById: customerId, status: "pending" }, data: { status: "withdrawn", decidedAt: now } });
    if (count !== 1) throw new CustomerEventError("not_pending");
    const row = await tx.bookingChangeRequest.findFirstOrThrow({ where: { id: requestId }, select: { bookingId: true } });
    await tx.bookingEvent.create({ data: { bookingId: row.bookingId, type: "change_withdrawn", actorId: customerId, data: Prisma.JsonNull, organizationId: "" } });
  });
}

/**
 * The agency answers. Approving applies the changes in one transaction, through
 * the same checks as an agency edit: a date the artist or the reserved equipment
 * can't follow is refused and the request stays open.
 */
export async function decideChangeRequest(organizationId: string, requestId: string, actorId: string, decision: { approve: boolean; note?: string | null }, now = new Date()) {
  const result = await tenantDb(organizationId).$transaction(async (tx) => {
    const found = await tx.bookingChangeRequest.findFirst({ where: { id: requestId }, select: { bookingId: true } });
    if (!found) throw new CustomerEventError("not_found");
    await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${found.bookingId} FOR UPDATE`;
    const booking = await tx.booking.findFirstOrThrow({ where: { id: found.bookingId } });
    // Read again under the lock: someone else may just have answered it.
    const request = await tx.bookingChangeRequest.findFirstOrThrow({ where: { id: requestId } });
    if (request.status !== "pending") throw new CustomerEventError("not_pending");
    const changes = request.changes as EventChanges;
    const note = clean(decision.note, 2000);
    if (decision.approve) {
      await applyBookingDetails(tx, organizationId, booking, changesToData(changes, booking.eventDate), actorId, { type: "change_approved", data: { fields: Object.keys(changes) } });
    } else {
      await tx.bookingEvent.create({ data: { bookingId: booking.id, type: "change_rejected", actorId, data: { reason: note ?? "" }, organizationId: "" } });
    }
    await tx.bookingChangeRequest.updateMany({ where: { id: requestId }, data: { status: decision.approve ? "approved" : "rejected", decidedById: actorId, decidedAt: now, decisionNote: note } });
    await auditTx(tx, { actorId, action: decision.approve ? "booking.change_approved" : "booking.change_rejected", agencyId: organizationId, targetType: "booking", targetId: booking.id, data: { requestId, fields: Object.keys(changes), note } });
    return { booking, requestedById: request.requestedById };
  }, equipmentTx);
  const b = result.booking;
  await safeNotify(async () => {
    const agency = await prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true } });
    await notify([result.requestedById], { type: decision.approve ? "change_approved" : "change_rejected", data: { name: agency?.name ?? "", code: b.trackingCode }, url: `/app/event?booking=${b.trackingCode}` }, actorId);
  });
  if (decision.approve) await notifyBriefChanged(b, { artist: true, customer: false }, actorId);
}
