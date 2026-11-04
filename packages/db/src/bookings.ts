import { randomBytes, randomUUID } from "node:crypto";
import {
  assertCompensation,
  type BookingAction,
  type BookingActor,
  type BookingContext,
  type BookingStatus,
  type Compensation,
  compensationOf,
  computeQuote,
  depositColumns,
  type DepositRule,
  type EventType,
  formatAgencyInvoiceNumber,
  generateTrackingCode,
  invoiceCounterKey,
  type InvoiceNumbering,
  invoiceNumberPattern,
  normalizeInvoiceNumber,
  quoteChangedFields,
  quoteEventSnapshot,
  type QuoteLineInput,
  todayInNetherlands,
  toDepositRule,
  transition,
  type TransitionError,
} from "@stagedesk/core";
import { artistAccountState, artistCanBeAssigned } from "./artist-accounts";
import { auditTx } from "./audit";
import { effectiveFeeSnapshot } from "./billing";
import { checkEquipmentReschedule, equipmentAfterTransition, equipmentTx, notifyUnreservedEquipment } from "./booking-equipment";
import { prisma } from "./client";
import { agencyDeskUserIds, notify } from "./notifications";
import { Prisma } from "./generated/prisma/client";
import { tenantDb, type TenantDb } from "./tenant";

/**
 * Booking operations. Each runs in one transaction on the agency's
 * tenant-scoped client and changes status only through core's transition().
 */

export type BookingErrorCode =
  | TransitionError
  | "not_found"
  | "no_lines"
  | "artist_unavailable"
  | "artist_not_available_to_agency"
  | "no_open_assignment"
  | "quote_not_current"
  | "invalid_amount"
  | "invalid_compensation"
  | "compensation_currency"
  | "artist_no_account"
  | "artist_account_disabled"
  | "invoice_number_invalid"
  | "invoice_number_taken"
  | "manual_numbers_off"
  | "quote_outdated";

export class BookingError extends Error {
  constructor(readonly code: BookingErrorCode) {
    super(`Booking operation failed: ${code}`);
    this.name = "BookingError";
  }
}

type Tx = Parameters<Parameters<TenantDb["$transaction"]>[0]>[0];
export type BookingTx = Tx;

export const toDateOnly = (d: string) => new Date(`${d}T00:00:00Z`);
export const fromDateOnly = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

function context(booking: { eventDate: Date | null; quoteExpiresAt: Date | null; paidCents: number; totalCents: number }, now: Date): BookingContext {
  return {
    today: todayInNetherlands(now),
    eventDate: fromDateOnly(booking.eventDate),
    now,
    quoteExpiresAt: booking.quoteExpiresAt,
    paidCents: booking.paidCents,
    totalCents: booking.totalCents,
  };
}

const statusTimestamps: Partial<Record<BookingStatus, string>> = {
  quoted: "quotedAt",
  booked: "bookedAt",
  confirmed: "confirmedAt",
  completed: "completedAt",
  settled: "settledAt",
  cancelled: "cancelledAt",
};

/**
 * Locks the booking row, then reads it. Every status change starts here, so
 * concurrent operations on one booking queue up instead of each acting on a
 * stale read (and deadlocking when their shared locks upgrade). Lock order is
 * always booking, then artist, then equipment items.
 */
async function loadBooking(tx: Tx, bookingId: string) {
  await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${bookingId} FOR UPDATE`;
  const booking = await tx.booking.findFirst({ where: { id: bookingId } });
  if (!booking) throw new BookingError("not_found");
  return booking;
}

/** Applies a status change if the rules allow it; returns the new status. */
async function applyTransition(
  tx: Tx,
  booking: Awaited<ReturnType<typeof loadBooking>>,
  action: BookingAction,
  actor: BookingActor,
  actorId: string | null,
  now: Date,
  extra: Prisma.BookingUpdateManyMutationInput = {},
  eventData?: Prisma.InputJsonValue,
) {
  const result = transition(booking.status as BookingStatus, action, actor, context(booking, now));
  if (!result.ok) throw new BookingError(result.error);
  const stamp = statusTimestamps[result.to];
  const updated = await tx.booking.updateMany({
    where: { id: booking.id, status: booking.status },
    data: { ...extra, status: result.to, ...(stamp ? { [stamp]: now } : {}) },
  });
  // The row is locked, so this only happens when the caller passed a stale booking; never act on it.
  if (updated.count !== 1) throw new BookingError("invalid_status");
  await logEvent(tx, booking.id, action, actorId, { from: booking.status, to: result.to, ...(eventData as object) });
  // Entering booked or confirmed reserves the packing list (never fails for a shortage).
  await equipmentAfterTransition(tx, booking.organizationId, booking.id, booking.status, result.to, now);
  return result.to;
}

async function logEvent(tx: Tx, bookingId: string, type: string, actorId: string | null, data?: Prisma.InputJsonValue) {
  // organizationId is filled in by the tenant-scoped client (see tenant.test.ts).
  await tx.bookingEvent.create({
    data: { bookingId, type, actorId, data: data ?? Prisma.JsonNull, organizationId: "" },
  });
}

/** How a booking came in. */
export const bookingSources = ["manual", "booking_page", "platform_admin", "lead", "gig", "profile", "customer_portal"] as const;
export type BookingSource = (typeof bookingSources)[number];

export interface NewBooking {
  customerId: string | null;
  eventType: EventType;
  eventDate: string | null;
  startTime?: string | null;
  endTime?: string | null;
  venueName?: string | null;
  venueAddress?: string | null;
  venueCity?: string | null;
  guestCount?: number | null;
  budgetCents?: number | null;
  message?: string | null;
  partnerName?: string | null;
  preferredArtistId?: string | null;
  preferredGenre?: string | null;
  budgetRange?: string | null;
  ceremony?: boolean | null;
  /** manual: the agency; booking_page: the public form; platform_admin: created by a platform admin; lead: a platform lead an agency accepted; customer_portal: a signed-in customer. */
  source?: BookingSource;
  /** The form's key: a second submit with the same one is refused by a unique index. */
  clientRequestId?: string | null;
}

export type CustomerChoice =
  | { mode: "existing"; id: string | null }
  | { mode: "new"; name: string | null; email: string | null; phone: string | null };

/**
 * The customer for a new booking: an existing customer of the agency, or a
 * (new or existing) account that becomes one. Returns null when the person
 * can't be the agency's customer (e.g. they're on its team).
 */
export async function resolveBookingCustomer(organizationId: string, input: CustomerChoice) {
  return resolveBookingCustomerTx(tenantDb(organizationId), organizationId, input);
}

/** resolveBookingCustomer inside a caller's transaction on the agency's tenant client. */
export async function resolveBookingCustomerTx(db: Tx | TenantDb, organizationId: string, input: CustomerChoice) {
  if (input.mode === "existing") {
    if (!input.id) return null;
    const member = await db.member.findFirst({ where: { userId: input.id, role: "customer" }, select: { userId: true } });
    return member?.userId ?? null;
  }
  if (!input.name || !input.email) return null;
  const email = input.email.trim().toLowerCase();
  // Someone the agency enters gets the agency's correspondence language, not the column default (English).
  const agency = await db.organization.findUnique({ where: { id: organizationId }, select: { correspondenceLocale: true } });
  const user =
    (await db.user.findUnique({ where: { email }, select: { id: true } })) ??
    (await db.user.create({ data: { id: randomUUID(), email, name: input.name.trim(), phone: input.phone, locale: agency?.correspondenceLocale ?? "nl" }, select: { id: true } }));
  const existing = await db.member.findFirst({ where: { userId: user.id }, select: { role: true } });
  if (existing && existing.role !== "customer") return null;
  if (!existing) await db.member.create({ data: { id: randomUUID(), userId: user.id, role: "customer", organizationId } });
  return user.id;
}

export async function createBooking(organizationId: string, input: NewBooking, actorId: string | null) {
  const db = tenantDb(organizationId);
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await db.$transaction((tx) => insertBooking(tx, organizationId, input, actorId));
    } catch (error) {
      // A tracking code collision is astronomically rare; try a new one.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue;
      throw error;
    }
  }
  throw new Error("Couldn't generate a unique tracking code");
}

/** Creates a booking inside a caller's transaction on the agency's tenant client (a tracking-code clash throws P2002). */
export async function insertBooking(tx: Tx, organizationId: string, input: NewBooking, actorId: string | null) {
  const id = randomUUID();
  const { eventDate, ...rest } = input;
  // The booking keeps the currency the agency works in today.
  const org = await tx.organization.findUnique({ where: { id: organizationId }, select: { currency: true } });
  await tx.booking.create({
    data: {
      ...rest,
      id,
      organizationId,
      currency: org?.currency ?? "EUR",
      trackingCode: generateTrackingCode(),
      eventDate: eventDate ? toDateOnly(eventDate) : null,
      createdById: actorId,
    },
  });
  await logEvent(tx, id, "created", actorId, { source: input.source ?? "manual" });
  return tx.booking.findFirstOrThrow({ where: { id } });
}

export interface QuoteInput {
  lines: QuoteLineInput[];
  /** A percentage upfront payment in basis points (0 = none); `deposit` replaces it when given. */
  depositBps?: number;
  /** No upfront payment, a percentage or a fixed amount. */
  deposit?: DepositRule;
  expiresInDays: number;
  notes?: string | null;
  /** Language the customer gets the quote in (emails, PDF, reminders). */
  locale?: "nl" | "en" | null;
}

export async function sendQuote(organizationId: string, bookingId: string, input: QuoteInput, actorId: string, now = new Date()) {
  if (input.lines.length === 0) throw new BookingError("no_lines");
  const deposit = input.deposit ?? toDepositRule(input.depositBps ?? 0);
  let totals: ReturnType<typeof computeQuote>;
  try {
    totals = computeQuote(input.lines, deposit);
  } catch (error) {
    if (error instanceof RangeError) throw new BookingError("invalid_amount");
    throw error;
  }
  const expiresAt = new Date(now.getTime() + input.expiresInDays * 86_400_000);

  return tenantDb(organizationId).$transaction(async (tx) => {
    const booking = await loadBooking(tx, bookingId);
    const latest = await tx.quote.findFirst({ where: { bookingId }, orderBy: { version: "desc" }, select: { version: true } });
    const version = (latest?.version ?? 0) + 1;

    await applyTransition(tx, booking, "send_quote", "agency", actorId, now, { quoteExpiresAt: expiresAt }, { version });
    await tx.quote.updateMany({ where: { bookingId, status: "sent" }, data: { status: "superseded" } });

    const quoteId = randomUUID();
    await tx.quote.create({
      data: {
        id: quoteId,
        organizationId,
        bookingId,
        version,
        status: "sent",
        token: randomBytes(24).toString("base64url"),
        notes: input.notes ?? null,
        ...depositColumns(deposit),
        locale: input.locale ?? null,
        // What the customer is offered: the event as it is now. Read under the booking lock.
        eventSnapshot: quoteEventSnapshot(booking) as unknown as Prisma.InputJsonValue,
        subtotalCents: totals.subtotalCents,
        vatCents: totals.vatCents,
        totalCents: totals.totalCents,
        depositCents: totals.depositCents,
        vatGroups: totals.vatGroups as unknown as Prisma.InputJsonValue,
        expiresAt,
        sentAt: now,
        createdById: actorId,
      },
    });
    await tx.quoteItem.createMany({
      data: totals.lines.map((line, position) => ({
        id: randomUUID(),
        organizationId,
        quoteId,
        position,
        description: line.description,
        quantityHundredths: line.quantityHundredths,
        unitPriceCents: line.unitPriceCents,
        vatBps: line.vatBps,
        subtotalCents: line.subtotalCents,
      })),
    });
    return tx.quote.findFirstOrThrow({ where: { id: quoteId } });
  });
}

/** Accepts the current quote, by the customer (via their link) or the agency on their behalf. */
export async function acceptQuote(
  organizationId: string,
  quoteId: string,
  by: { actor: "customer" | "agency"; actorId: string | null; name: string },
  now = new Date(),
) {
  // The platform fee in force now is frozen onto the booking, so later
  // changes to fee settings only affect new bookings.
  const feeSnapshot = await effectiveFeeSnapshot(organizationId);
  const booking = await tenantDb(organizationId).$transaction(async (tx) => {
    const found = await tx.quote.findFirst({ where: { id: quoteId }, select: { bookingId: true } });
    if (!found) throw new BookingError("not_found");
    const booking = await loadBooking(tx, found.bookingId);
    // Read again under the booking lock (READ COMMITTED): a revision or another acceptance may have just committed.
    const quote = await tx.quote.findFirstOrThrow({ where: { id: quoteId } });
    if (quote.status !== "sent") throw new BookingError("quote_not_current");
    // The event changed after this quote went out (date, times, venue, guests…): what would be
    // accepted isn't what was offered, and equipment and the artist are checked for the new date.
    if (quoteChangedFields(quote.eventSnapshot, quoteEventSnapshot(booking)).length > 0) throw new BookingError("quote_outdated");

    await applyTransition(
      tx,
      booking,
      "accept_quote",
      by.actor,
      by.actorId,
      now,
      { totalCents: quote.totalCents, depositCents: quote.depositCents, feeSnapshot: feeSnapshot as unknown as Prisma.InputJsonValue },
      { version: quote.version, name: by.name },
    );
    await tx.quote.updateMany({ where: { id: quote.id }, data: { status: "accepted", acceptedAt: now, acceptedByName: by.name } });
    return booking;
    // READ COMMITTED: the equipment reservation runs in here and must see other bookings' committed reservations.
  }, equipmentTx);
  await notify(
    await agencyDeskUserIds(organizationId),
    { type: "quote_accepted", data: { name: by.name, code: booking.trackingCode }, url: `/app/bookings/${booking.trackingCode}` },
    by.actorId,
  );
  await notifyUnreservedEquipment(organizationId, booking.id, by.actorId);
  await confirmSoloBooking(organizationId, booking.id, now);
}

/**
 * An independent artist plays their own gigs: once a quote is accepted the
 * booking is confirmed with them as the artist, unless they've marked that
 * day unavailable (then it stays "booked" for them to sort out). Their share
 * is 0: the business they own already receives the payments.
 */
export async function confirmSoloBooking(organizationId: string, bookingId: string, now = new Date()) {
  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { kind: true } });
  if (org?.kind !== "solo") return;
  const artist = await prisma.artist.findFirst({ where: { organizationId, userId: { not: null } }, select: { id: true, userId: true, stageName: true } });
  if (!artist) return;
  await tenantDb(organizationId).$transaction(async (tx) => {
    const booking = await loadBooking(tx, bookingId);
    if (booking.status !== "booked") return;
    await lockArtist(tx, artist.id);
    if (booking.eventDate && !(await isArtistFree(artist.id, booking.eventDate, booking.id))) return;
    await tx.bookingAssignment.create({ data: { id: randomUUID(), organizationId, bookingId, artistId: artist.id, status: "accepted", shareBps: 0, respondedAt: now } });
    await logEvent(tx, bookingId, "artist_assigned", artist.userId, { artistId: artist.id, stageName: artist.stageName });
    await applyTransition(tx, booking, "artist_accepted", "artist", artist.userId, now);
  });
}

/** Artists the agency can book: its own, plus accepted shares from partner agencies. */
export async function bookableArtists(organizationId: string) {
  return prisma.artist.findMany({
    where: {
      active: true,
      OR: [
        { organizationId },
        { shares: { some: { partnerOrganizationId: organizationId, status: "accepted" } } },
      ],
    },
    include: { organization: { select: { id: true, name: true, currency: true } } },
    orderBy: { stageName: "asc" },
  });
}

/** Whether the artist is free on a date: no blocked day and no other live gig. */
export async function isArtistFree(artistId: string, date: Date, exceptBookingId?: string) {
  const [blocked, busy] = await Promise.all([
    prisma.artistUnavailability.count({ where: { artistId, date } }),
    prisma.bookingAssignment.count({
      where: {
        artistId,
        status: { in: ["pending", "accepted"] },
        booking: { eventDate: date, status: { in: ["booked", "confirmed"] }, ...(exceptBookingId ? { id: { not: exceptBookingId } } : {}) },
      },
    }),
  ]);
  return blocked === 0 && busy === 0;
}

/** Locks the artist row so two bookings can't both take the same artist for one date. Call after loadBooking. */
async function lockArtist(tx: Tx, artistId: string) {
  await tx.$queryRaw`SELECT id FROM artists WHERE id = ${artistId} FOR UPDATE`;
}

/**
 * What an assignment copies: the override for this booking, or the artist's
 * default. A default fixed fee is in the artist's agency's currency, so it can
 * only be copied onto a booking in that currency; otherwise the agency must
 * enter the amount for this booking.
 */
function assignmentCompensation(
  artist: { compensationType: string; defaultShareBps: number; defaultFixedFeeCents: number | null; organization: { currency: string } },
  bookingCurrency: string,
  override: Compensation | null | undefined,
) {
  const c = override ?? compensationOf(artist);
  try {
    assertCompensation(c);
  } catch {
    throw new BookingError("invalid_compensation");
  }
  if (!override && c.type === "fixed" && artist.organization.currency !== bookingCurrency) throw new BookingError("compensation_currency");
  return { shareBps: c.type === "percentage" ? c.shareBps : 0, compensationType: c.type, fixedFeeCents: c.type === "fixed" ? c.fixedCents : null };
}

export async function assignArtist(
  organizationId: string,
  bookingId: string,
  artistId: string,
  actorId: string,
  now = new Date(),
  /** Pay for this booking only; null takes the artist's default. */
  compensation?: Compensation | null,
) {
  const allowed = (await bookableArtists(organizationId)).find((a) => a.id === artistId);
  if (!allowed) throw new BookingError("artist_not_available_to_agency");
  // A request needs someone who can read and answer it; without a login it would sit there unseen.
  const account = await artistAccountState(artistId);
  if (account === "disabled") throw new BookingError("artist_account_disabled");
  if (!artistCanBeAssigned(account)) throw new BookingError("artist_no_account");

  const booking = await tenantDb(organizationId).$transaction(async (tx) => {
    const booking = await loadBooking(tx, bookingId);
    if (booking.status !== "booked" && booking.status !== "confirmed") throw new BookingError("invalid_status");
    const pay = assignmentCompensation(allowed, booking.currency, compensation);
    await lockArtist(tx, artistId);
    if (booking.eventDate && !(await isArtistFree(artistId, booking.eventDate, booking.id))) {
      throw new BookingError("artist_unavailable");
    }
    // Replacing a confirmed artist sends the booking back to "booked" until the new one accepts.
    if (booking.status === "confirmed") await applyTransition(tx, booking, "release_artist", "agency", actorId, now);
    const replaced = await tx.bookingAssignment.findMany({ where: { bookingId, status: { in: ["pending", "accepted"] } }, select: { id: true } });
    await tx.bookingAssignment.updateMany({
      where: { bookingId, status: { in: ["pending", "accepted"] } },
      data: { status: "withdrawn", respondedAt: now },
    });
    const assignmentId = randomUUID();
    await tx.bookingAssignment.create({
      data: { id: assignmentId, organizationId, bookingId, artistId, status: "pending", ...pay },
    });
    await logEvent(tx, bookingId, "artist_assigned", actorId, { artistId, stageName: allowed.stageName, ...pay });
    return { ...booking, assignmentId, withdrawnIds: replaced.map((r) => r.id) };
  });
  const artistUser = await prisma.artist.findUnique({ where: { id: artistId }, select: { userId: true, organization: { select: { name: true } } } });
  const agency = await prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true } });
  // The assignment stands from here on; the caller says plainly if the artist couldn't be told.
  let notified = false;
  try {
    notified =
      (await notify([artistUser?.userId], {
        type: "gig_request",
        data: { name: agency?.name ?? "", code: booking.trackingCode },
        url: `/app/gigs/${booking.trackingCode}`,
      })) > 0;
    await notifyArtistsOff(booking.withdrawnIds, "gig_withdrawn", agency?.name ?? "", booking.trackingCode, artistId);
  } catch (error) {
    console.error("[bookings] assignment notification failed", booking.assignmentId, error);
  }
  return { assignmentId: booking.assignmentId, withdrawnIds: booking.withdrawnIds, notified };
}

/**
 * Applies details under the booking lock, after checking that the assigned
 * artist and the reserved equipment can follow a new date. The event type names
 * who did it on the timeline.
 */
export async function applyBookingDetails(
  tx: Tx,
  organizationId: string,
  booking: Awaited<ReturnType<typeof loadBooking>>,
  data: Omit<Prisma.BookingUpdateManyMutationInput, "eventDate" | "status"> & { eventDate: Date | null },
  actorId: string | null,
  event: { type: string; data?: Prisma.InputJsonValue } = { type: "details_updated" },
) {
  // A new date must suit the artist on the booking too, not only the equipment.
  if (data.eventDate && fromDateOnly(booking.eventDate) !== fromDateOnly(data.eventDate)) {
    const assigned = await tx.bookingAssignment.findFirst({ where: { bookingId: booking.id, status: { in: ["pending", "accepted"] } }, select: { artistId: true } });
    if (assigned) {
      await lockArtist(tx, assigned.artistId);
      if (!(await isArtistFree(assigned.artistId, data.eventDate, booking.id))) throw new BookingError("artist_unavailable");
    }
  }
  await checkEquipmentReschedule(tx, organizationId, booking.id, data.eventDate ? data.eventDate.toISOString().slice(0, 10) : null);
  const updated = await tx.booking.updateMany({ where: { id: booking.id, status: { in: ["inquiry", "quoted", "booked", "confirmed", "expired"] } }, data });
  if (updated.count === 0) throw new BookingError("invalid_status");
  await logEvent(tx, booking.id, event.type, actorId, event.data);
}

/** People who should hear that a booking's brief changed: the artist on it, and optionally the customer. Never throws. */
export async function notifyBriefChanged(
  booking: { id: string; organizationId: string; trackingCode: string; customerId: string | null },
  changed: { artist: boolean; customer: boolean },
  actorId: string | null,
) {
  try {
    const agency = await prisma.organization.findUnique({ where: { id: booking.organizationId }, select: { name: true } });
    const data = { name: agency?.name ?? "", code: booking.trackingCode };
    if (changed.artist) {
      const active = await prisma.bookingAssignment.findMany({ where: { bookingId: booking.id, status: { in: ["pending", "accepted"] } }, select: { artist: { select: { userId: true } } } });
      await notify(active.map((a) => a.artist.userId), { type: "gig_updated", data, url: `/app/gigs/${booking.trackingCode}` }, actorId);
    }
    if (changed.customer) await notify([booking.customerId], { type: "booking_updated", data, url: `/app/event?booking=${booking.trackingCode}` }, actorId);
  } catch (error) {
    console.error("[bookings] brief-change notification failed", booking.trackingCode, error);
  }
}

/**
 * Tells artists their request or gig is off (taken off the booking, or the
 * booking was cancelled), so their dashboard never shows it as theirs any more.
 * The artist who just got the booking again isn't told it was withdrawn.
 */
async function notifyArtistsOff(assignmentIds: string[], type: "gig_withdrawn" | "gig_cancelled", agency: string, code: string, exceptArtistId?: string) {
  if (assignmentIds.length === 0) return;
  const rows = await prisma.bookingAssignment.findMany({
    where: { id: { in: assignmentIds }, ...(exceptArtistId ? { artistId: { not: exceptArtistId } } : {}) },
    select: { artist: { select: { userId: true } } },
  });
  await notify(rows.map((r) => r.artist.userId), { type, data: { name: agency, code }, url: "/app/gigs" });
}

/**
 * The artist answers a request. Runs on the booking's agency, which may differ
 * from the artist's own agency when the artist is shared.
 */
export async function respondToAssignment(
  assignmentId: string,
  artistUserId: string,
  answer: { accept: true } | { accept: false; reason: string },
  now = new Date(),
) {
  const assignment = await prisma.bookingAssignment.findFirst({
    where: { id: assignmentId, status: "pending", artist: { userId: artistUserId } },
    select: { organizationId: true, bookingId: true, id: true },
  });
  if (!assignment) throw new BookingError("no_open_assignment");

  const booking = await tenantDb(assignment.organizationId).$transaction(async (tx) => {
    const booking = await loadBooking(tx, assignment.bookingId);
    // Re-checked under the booking lock: the request may have been withdrawn or answered meanwhile.
    const answered = await tx.bookingAssignment.updateMany({
      where: { id: assignment.id, status: "pending" },
      data: answer.accept ? { status: "accepted", respondedAt: now } : { status: "declined", respondedAt: now, declineReason: answer.reason },
    });
    if (answered.count !== 1) throw new BookingError("no_open_assignment");
    if (answer.accept) {
      await applyTransition(tx, booking, "artist_accepted", "artist", artistUserId, now);
    } else {
      await logEvent(tx, booking.id, "artist_declined", artistUserId, { reason: answer.reason });
    }
    return booking;
  });
  const artist = await prisma.bookingAssignment.findUnique({ where: { id: assignment.id }, select: { artist: { select: { stageName: true } } } });
  await notify(await agencyDeskUserIds(assignment.organizationId), {
    type: "gig_response",
    data: { name: artist?.artist.stageName ?? "", code: booking.trackingCode, accepted: answer.accept ? "yes" : "no" },
    url: `/app/bookings/${booking.trackingCode}`,
  });
}

/** decline, complete, settle or cancel. */
export async function changeBookingStatus(
  organizationId: string,
  bookingId: string,
  action: Extract<BookingAction, "decline" | "complete" | "settle" | "cancel">,
  by: { actor: BookingActor; actorId: string | null; reason?: string | null },
  now = new Date(),
) {
  const result = await tenantDb(organizationId).$transaction(async (tx) => {
    const booking = await loadBooking(tx, bookingId);
    const extra = action === "cancel" || action === "decline" ? { cancelReason: by.reason ?? null } : {};
    const to = await applyTransition(tx, booking, action, by.actor, by.actorId, now, extra, by.reason ? { reason: by.reason } : undefined);
    let withdrawn: string[] = [];
    if (to === "cancelled" || to === "declined") {
      await tx.quote.updateMany({ where: { bookingId, status: "sent" }, data: { status: "declined" } });
      withdrawn = (await tx.bookingAssignment.findMany({ where: { bookingId, status: { in: ["pending", "accepted"] } }, select: { id: true } })).map((a) => a.id);
      await tx.bookingAssignment.updateMany({ where: { bookingId, status: { in: ["pending", "accepted"] } }, data: { status: "withdrawn", respondedAt: now } });
    }
    return { to, withdrawn, code: booking.trackingCode };
  });
  if (result.withdrawn.length > 0) {
    const agency = await prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true } });
    await notifyArtistsOff(result.withdrawn, "gig_cancelled", agency?.name ?? "", result.code);
  }
  return result.to;
}

/**
 * Saves edited event details on an open booking. Moving a booked or confirmed
 * booking to another date is refused (EquipmentError "reschedule_conflict")
 * when its reserved equipment doesn't fit on the new date.
 */
export async function updateBookingDetails(
  organizationId: string,
  bookingId: string,
  data: Omit<Prisma.BookingUpdateManyMutationInput, "eventDate" | "status"> & { eventDate: Date | null },
  actorId: string,
) {
  const result = await tenantDb(organizationId).$transaction(async (tx) => {
    const booking = await loadBooking(tx, bookingId);
    await applyBookingDetails(tx, organizationId, booking, data, actorId);
    const after = await tx.booking.findFirstOrThrow({ where: { id: bookingId } });
    return {
      booking: after,
      // Compared on the values that matter to each of them; a save without changes tells nobody.
      contract: quoteChangedFields(quoteEventSnapshot(booking), quoteEventSnapshot(after)).length > 0,
      brief: JSON.stringify([booking.dos, booking.donts, booking.playlistUrl, booking.preferredGenre, booking.musicRequests, booking.specialRequests]) !== JSON.stringify([after.dos, after.donts, after.playlistUrl, after.preferredGenre, after.musicRequests, after.specialRequests]),
    };
  }, equipmentTx);
  await notifyBriefChanged(result.booking, { artist: result.contract || result.brief, customer: result.contract }, actorId);
}

export interface PaymentInput {
  amountCents: number;
  kind: "deposit" | "balance" | "other";
  method: "bank_transfer" | "cash" | "card" | "other";
  receivedAt: Date;
  reference?: string | null;
}

export async function recordPayment(organizationId: string, bookingId: string, input: PaymentInput, actorId: string) {
  return tenantDb(organizationId).$transaction((tx) => recordPaymentTx(tx, organizationId, bookingId, input, actorId));
}

/** recordPayment inside a caller's transaction on the agency's tenant client (locks the booking first). */
export async function recordPaymentTx(tx: Tx, organizationId: string, bookingId: string, input: PaymentInput, actorId: string) {
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents === 0) throw new BookingError("invalid_amount");
  const booking = await loadBooking(tx, bookingId);
  if (booking.status === "inquiry" || booking.status === "declined") throw new BookingError("invalid_status");
  const payment = await tx.payment.create({
    data: { ...input, id: randomUUID(), organizationId, bookingId, recordedById: actorId },
  });
  await tx.booking.updateMany({ where: { id: bookingId }, data: { paidCents: { increment: input.amountCents } } });
  await logEvent(tx, bookingId, "payment_recorded", actorId, { amountCents: input.amountCents, method: input.method });
  return payment;
}

/** Next value of a per-agency sequence; rows are locked so two invoices can't share a number. */
async function nextCounter(tx: Tx, organizationId: string, key: string) {
  await tx.$executeRaw`INSERT INTO organization_counters (organizationId, \`key\`, value) VALUES (${organizationId}, ${key}, 0) ON DUPLICATE KEY UPDATE value = value`;
  const rows = await tx.$queryRaw<{ value: number }[]>`SELECT value FROM organization_counters WHERE organizationId = ${organizationId} AND \`key\` = ${key} FOR UPDATE`;
  const next = Number(rows[0]?.value ?? 0) + 1;
  await tx.$executeRaw`UPDATE organization_counters SET value = ${next} WHERE organizationId = ${organizationId} AND \`key\` = ${key}`;
  return next;
}

/** The number the next invoice would get, without taking it (for the preview in the issue dialog). */
export async function nextInvoiceNumber(organizationId: string, now = new Date()) {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { invoiceNumbering: true, invoicePrefix: true } });
  const numbering = org.invoiceNumbering as InvoiceNumbering;
  const year = Number(todayInNetherlands(now).slice(0, 4));
  const counter = await prisma.organizationCounter.findUnique({ where: { organizationId_key: { organizationId, key: invoiceCounterKey(numbering, year) } } });
  return formatAgencyInvoiceNumber({ numbering, prefix: org.invoicePrefix, year, sequence: (counter?.value ?? 0) + 1 });
}

/**
 * Issues an invoice from the accepted quote. Returns the existing one if
 * already issued. The number is the agency's next one (its scheme and
 * prefix), or, when the agency allows it, one typed by hand: it must be
 * unused (the unique index refuses a reuse even under a race) and is audited.
 * Issued invoices are never renumbered.
 */
export async function issueInvoice(
  organizationId: string,
  bookingId: string,
  actorId: string,
  now = new Date(),
  opts: { manualNumber?: string | null } = {},
) {
  const manual = opts.manualNumber ? normalizeInvoiceNumber(opts.manualNumber) : null;
  if (manual !== null && !invoiceNumberPattern.test(manual)) throw new BookingError("invoice_number_invalid");
  try {
    return await issueInvoiceTx(organizationId, bookingId, actorId, now, manual);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new BookingError("invoice_number_taken");
    throw error;
  }
}

async function issueInvoiceTx(organizationId: string, bookingId: string, actorId: string, now: Date, manual: string | null) {
  return tenantDb(organizationId).$transaction(async (tx) => {
    // Lock first: under REPEATABLE READ an earlier plain read would fix the snapshot before the lock,
    // and two simultaneous calls would both miss each other's invoice.
    const booking = await loadBooking(tx, bookingId);
    const existing = await tx.invoice.findFirst({ where: { bookingId } });
    if (existing) return existing;
    if (!["booked", "confirmed", "completed", "settled"].includes(booking.status)) throw new BookingError("invalid_status");
    const quote = await tx.quote.findFirst({ where: { bookingId, status: "accepted" }, include: { items: { orderBy: { position: "asc" } } } });
    if (!quote) throw new BookingError("quote_not_current");

    const [agency, customer] = await Promise.all([
      prisma.organization.findUniqueOrThrow({ where: { id: organizationId } }),
      booking.customerId ? prisma.user.findUnique({ where: { id: booking.customerId }, select: { name: true, email: true } }) : null,
    ]);
    const year = Number(todayInNetherlands(now).slice(0, 4));
    let number = manual ?? "";
    if (manual) {
      if (!agency.allowManualInvoiceNumbers) throw new BookingError("manual_numbers_off");
      if (await tx.invoice.findFirst({ where: { number: manual }, select: { id: true } })) throw new BookingError("invoice_number_taken");
    } else {
      const numbering = agency.invoiceNumbering as InvoiceNumbering;
      // A typed number may already hold what the counter gives next: skip past it rather than fail.
      for (let attempt = 0; ; attempt++) {
        const sequence = await nextCounter(tx, organizationId, invoiceCounterKey(numbering, year));
        number = formatAgencyInvoiceNumber({ numbering, prefix: agency.invoicePrefix, year, sequence });
        if (!(await tx.invoice.findFirst({ where: { number }, select: { id: true } }))) break;
        if (attempt > 50) throw new BookingError("invoice_number_taken");
      }
    }

    const id = randomUUID();
    await tx.invoice.create({
      data: {
        id,
        organizationId,
        bookingId,
        number,
        manualNumber: manual !== null,
        issuedAt: now,
        dueAt: new Date(now.getTime() + 14 * 86_400_000),
        subtotalCents: quote.subtotalCents,
        vatCents: quote.vatCents,
        totalCents: quote.totalCents,
        data: {
          agency: {
            name: agency.name,
            kvkNumber: agency.kvkNumber,
            vatNumber: agency.vatNumber,
            addressLine: agency.addressLine,
            postalCode: agency.postalCode,
            city: agency.city,
            contactEmail: agency.contactEmail,
            phone: agency.phone,
            iban: agency.iban,
            bankAccountName: agency.bankAccountName,
            paymentInstructions: agency.paymentInstructions,
            logo: agency.logo,
          },
          // The look at the time of issue, so later template edits never change an issued invoice.
          template: (agency.invoiceTemplate ?? null) as Prisma.InputJsonValue,
          locale: quote.locale,
          depositCents: quote.depositCents,
          customer,
          trackingCode: booking.trackingCode,
          eventDate: fromDateOnly(booking.eventDate),
          lines: quote.items.map((i) => ({
            description: i.description,
            quantityHundredths: i.quantityHundredths,
            unitPriceCents: i.unitPriceCents,
            vatBps: i.vatBps,
            subtotalCents: i.subtotalCents,
          })),
          vatGroups: quote.vatGroups,
          paidCents: booking.paidCents,
        },
      },
    });
    await logEvent(tx, bookingId, "invoice_issued", actorId, { number, manual: manual !== null });
    if (manual) await auditTx(tx, { actorId, action: "invoice.manual_number", agencyId: organizationId, targetType: "invoice", targetId: id, data: { number, bookingId } });
    return tx.invoice.findFirstOrThrow({ where: { id } });
  });
}

/** Expires quotes past their deadline. Called by the worker. */
export async function expireQuotes(now = new Date()) {
  const due = await prisma.booking.findMany({
    where: { status: "quoted", quoteExpiresAt: { lte: now } },
    select: { id: true, organizationId: true },
  });
  let expired = 0;
  for (const b of due) {
    expired += await tenantDb(b.organizationId).$transaction(async (tx) => {
      const booking = await loadBooking(tx, b.id);
      // Accepted or re-sent since the scan: leave it.
      if (booking.status !== "quoted" || !booking.quoteExpiresAt || booking.quoteExpiresAt > now) return 0;
      await applyTransition(tx, booking, "expire", "system", null, now);
      return 1;
    });
  }
  return expired;
}

/**
 * Puts an artist lent by another agency on a booking once both agencies
 * agreed (see artist-requests). The lending agency answers for its artist,
 * so the gig is confirmed straight away; the artist's own share is 0 here,
 * because their agency pays them out of the agreed fee.
 */
export async function assignLentArtist(organizationId: string, bookingId: string, artistId: string, actorId: string | null, now = new Date()) {
  const artist = await prisma.artist.findUnique({ where: { id: artistId }, select: { userId: true, stageName: true } });
  const booking = await tenantDb(organizationId).$transaction(async (tx) => {
    const booking = await loadBooking(tx, bookingId);
    if (booking.status !== "booked" && booking.status !== "confirmed") throw new BookingError("invalid_status");
    await lockArtist(tx, artistId);
    if (booking.eventDate && !(await isArtistFree(artistId, booking.eventDate, booking.id))) throw new BookingError("artist_unavailable");
    if (booking.status === "confirmed") await applyTransition(tx, booking, "release_artist", "agency", actorId, now);
    await tx.bookingAssignment.updateMany({ where: { bookingId, status: { in: ["pending", "accepted"] } }, data: { status: "withdrawn", respondedAt: now } });
    await tx.bookingAssignment.create({ data: { id: randomUUID(), organizationId, bookingId, artistId, status: "accepted", shareBps: 0, respondedAt: now } });
    await logEvent(tx, bookingId, "artist_assigned", actorId, { artistId, stageName: artist?.stageName ?? "", lent: true });
    // Their agency accepted for them, so it counts as the artist accepting.
    await applyTransition(tx, await loadBooking(tx, bookingId), "artist_accepted", "artist", artist?.userId ?? actorId, now);
    return booking;
  });
  const agency = await prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true } });
  await notify([artist?.userId], { type: "gig_request", data: { name: agency?.name ?? "", code: booking.trackingCode }, url: `/app/gigs/${booking.trackingCode}` });
}

/**
 * Takes the artist off a booking without putting anyone else on it (support
 * removing an artist, or an agency withdrawing a request). A confirmed
 * booking goes back to "booked" through release_artist, so the booking's
 * status always matches who is on it. Returns the withdrawn assignment ids.
 */
export async function withdrawArtist(organizationId: string, bookingId: string, artistId: string, actorId: string | null, reason: string | null, now = new Date()) {
  const result = await tenantDb(organizationId).$transaction(async (tx) => {
    const booking = await loadBooking(tx, bookingId);
    const active = await tx.bookingAssignment.findMany({ where: { bookingId, artistId, status: { in: ["pending", "accepted"] } }, select: { id: true, status: true } });
    if (active.length === 0) return { ids: [] as string[], code: booking.trackingCode };
    if (booking.status === "confirmed" && active.some((a) => a.status === "accepted")) await applyTransition(tx, booking, "release_artist", "agency", actorId, now);
    await tx.bookingAssignment.updateMany({ where: { id: { in: active.map((a) => a.id) } }, data: { status: "withdrawn", respondedAt: now } });
    await logEvent(tx, bookingId, "artist_withdrawn", actorId, { artistId, reason });
    return { ids: active.map((a) => a.id), code: booking.trackingCode };
  });
  if (result.ids.length > 0) {
    const agency = await prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true } });
    await notifyArtistsOff(result.ids, "gig_withdrawn", agency?.name ?? "", result.code);
    // The agency must find another artist.
    const artist = await prisma.artist.findUnique({ where: { id: artistId }, select: { stageName: true } });
    await notify(await agencyDeskUserIds(organizationId), { type: "artist_removed", data: { name: artist?.stageName ?? "", code: result.code }, url: `/app/bookings/${result.code}` }, actorId);
  }
  return result.ids;
}
