import { randomBytes, randomUUID } from "node:crypto";
import {
  type BookingAction,
  type BookingActor,
  type BookingContext,
  type BookingStatus,
  computeQuote,
  type EventType,
  formatInvoiceNumber,
  generateTrackingCode,
  type QuoteLineInput,
  todayInNetherlands,
  transition,
  type TransitionError,
} from "@stagedesk/core";
import { effectiveFeeSnapshot } from "./billing";
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
  | "invalid_amount";

export class BookingError extends Error {
  constructor(readonly code: BookingErrorCode) {
    super(`Booking operation failed: ${code}`);
    this.name = "BookingError";
  }
}

type Tx = Parameters<Parameters<TenantDb["$transaction"]>[0]>[0];

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

async function loadBooking(tx: Tx, bookingId: string) {
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
  await tx.booking.updateMany({
    where: { id: booking.id, status: booking.status },
    data: { ...extra, status: result.to, ...(stamp ? { [stamp]: now } : {}) },
  });
  await logEvent(tx, booking.id, action, actorId, { from: booking.status, to: result.to, ...(eventData as object) });
  return result.to;
}

async function logEvent(tx: Tx, bookingId: string, type: string, actorId: string | null, data?: Prisma.InputJsonValue) {
  // organizationId is filled in by the tenant-scoped client (see tenant.test.ts).
  await tx.bookingEvent.create({
    data: { bookingId, type, actorId, data: data ?? Prisma.JsonNull, organizationId: "" },
  });
}

/** How a booking came in. */
export const bookingSources = ["manual", "booking_page", "platform_admin", "lead"] as const;
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
  /** manual: the agency; booking_page: the public form; platform_admin: created by a platform admin; lead: a platform lead an agency accepted. */
  source?: BookingSource;
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
  const db = tenantDb(organizationId);
  if (input.mode === "existing") {
    if (!input.id) return null;
    const member = await db.member.findFirst({ where: { userId: input.id, role: "customer" }, select: { userId: true } });
    return member?.userId ?? null;
  }
  if (!input.name || !input.email) return null;
  const email = input.email.trim().toLowerCase();
  const user =
    (await prisma.user.findUnique({ where: { email }, select: { id: true } })) ??
    (await prisma.user.create({ data: { id: randomUUID(), email, name: input.name.trim(), phone: input.phone }, select: { id: true } }));
  const existing = await db.member.findFirst({ where: { userId: user.id }, select: { role: true } });
  if (existing && existing.role !== "customer") return null;
  if (!existing) await db.member.create({ data: { id: randomUUID(), userId: user.id, role: "customer", organizationId } });
  return user.id;
}

export async function createBooking(organizationId: string, input: NewBooking, actorId: string | null) {
  const db = tenantDb(organizationId);
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await db.$transaction(async (tx) => {
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
      });
    } catch (error) {
      // A tracking code collision is astronomically rare; try a new one.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue;
      throw error;
    }
  }
  throw new Error("Couldn't generate a unique tracking code");
}

export interface QuoteInput {
  lines: QuoteLineInput[];
  depositBps: number;
  expiresInDays: number;
  notes?: string | null;
}

export async function sendQuote(organizationId: string, bookingId: string, input: QuoteInput, actorId: string, now = new Date()) {
  if (input.lines.length === 0) throw new BookingError("no_lines");
  const totals = computeQuote(input.lines, input.depositBps);
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
        depositBps: input.depositBps,
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
    const quote = await tx.quote.findFirst({ where: { id: quoteId } });
    if (!quote) throw new BookingError("not_found");
    if (quote.status !== "sent") throw new BookingError("quote_not_current");
    const booking = await loadBooking(tx, quote.bookingId);

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
  });
  await notify(
    await agencyDeskUserIds(organizationId),
    { type: "quote_accepted", data: { name: by.name, code: booking.trackingCode }, url: `/app/bookings/${booking.trackingCode}` },
    by.actorId,
  );
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
    include: { organization: { select: { id: true, name: true } } },
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

export async function assignArtist(organizationId: string, bookingId: string, artistId: string, actorId: string, now = new Date()) {
  const allowed = (await bookableArtists(organizationId)).find((a) => a.id === artistId);
  if (!allowed) throw new BookingError("artist_not_available_to_agency");

  const booking = await tenantDb(organizationId).$transaction(async (tx) => {
    const booking = await loadBooking(tx, bookingId);
    if (booking.status !== "booked" && booking.status !== "confirmed") throw new BookingError("invalid_status");
    if (booking.eventDate && !(await isArtistFree(artistId, booking.eventDate, booking.id))) {
      throw new BookingError("artist_unavailable");
    }
    // Replacing a confirmed artist sends the booking back to "booked" until the new one accepts.
    if (booking.status === "confirmed") await applyTransition(tx, booking, "release_artist", "agency", actorId, now);
    await tx.bookingAssignment.updateMany({
      where: { bookingId, status: { in: ["pending", "accepted"] } },
      data: { status: "withdrawn", respondedAt: now },
    });
    await tx.bookingAssignment.create({
      data: { id: randomUUID(), organizationId, bookingId, artistId, status: "pending", shareBps: allowed.defaultShareBps },
    });
    await logEvent(tx, bookingId, "artist_assigned", actorId, { artistId, stageName: allowed.stageName });
    return booking;
  });
  const artistUser = await prisma.artist.findUnique({ where: { id: artistId }, select: { userId: true, organization: { select: { name: true } } } });
  const agency = await prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true } });
  await notify([artistUser?.userId], {
    type: "gig_request",
    data: { name: agency?.name ?? "", code: booking.trackingCode },
    url: `/app/gigs/${booking.trackingCode}`,
  });
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
    if (answer.accept) {
      await applyTransition(tx, booking, "artist_accepted", "artist", artistUserId, now);
      await tx.bookingAssignment.updateMany({ where: { id: assignment.id }, data: { status: "accepted", respondedAt: now } });
    } else {
      await tx.bookingAssignment.updateMany({
        where: { id: assignment.id },
        data: { status: "declined", respondedAt: now, declineReason: answer.reason },
      });
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
  return tenantDb(organizationId).$transaction(async (tx) => {
    const booking = await loadBooking(tx, bookingId);
    const extra = action === "cancel" || action === "decline" ? { cancelReason: by.reason ?? null } : {};
    const to = await applyTransition(tx, booking, action, by.actor, by.actorId, now, extra, by.reason ? { reason: by.reason } : undefined);
    if (to === "cancelled" || to === "declined") {
      await tx.quote.updateMany({ where: { bookingId, status: "sent" }, data: { status: "declined" } });
      await tx.bookingAssignment.updateMany({ where: { bookingId, status: { in: ["pending", "accepted"] } }, data: { status: "withdrawn" } });
    }
    return to;
  });
}

export interface PaymentInput {
  amountCents: number;
  kind: "deposit" | "balance" | "other";
  method: "bank_transfer" | "cash" | "card" | "other";
  receivedAt: Date;
  reference?: string | null;
}

export async function recordPayment(organizationId: string, bookingId: string, input: PaymentInput, actorId: string) {
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents === 0) throw new BookingError("invalid_amount");
  return tenantDb(organizationId).$transaction(async (tx) => {
    const booking = await loadBooking(tx, bookingId);
    if (booking.status === "inquiry" || booking.status === "declined") throw new BookingError("invalid_status");
    const payment = await tx.payment.create({
      data: { ...input, id: randomUUID(), organizationId, bookingId, recordedById: actorId },
    });
    await tx.booking.updateMany({ where: { id: bookingId }, data: { paidCents: { increment: input.amountCents } } });
    await logEvent(tx, bookingId, "payment_recorded", actorId, { amountCents: input.amountCents, method: input.method });
    return payment;
  });
}

/** Next value of a per-agency sequence; rows are locked so two invoices can't share a number. */
async function nextCounter(tx: Tx, organizationId: string, key: string) {
  await tx.$executeRaw`INSERT INTO organization_counters (organizationId, \`key\`, value) VALUES (${organizationId}, ${key}, 0) ON DUPLICATE KEY UPDATE value = value`;
  const rows = await tx.$queryRaw<{ value: number }[]>`SELECT value FROM organization_counters WHERE organizationId = ${organizationId} AND \`key\` = ${key} FOR UPDATE`;
  const next = Number(rows[0]?.value ?? 0) + 1;
  await tx.$executeRaw`UPDATE organization_counters SET value = ${next} WHERE organizationId = ${organizationId} AND \`key\` = ${key}`;
  return next;
}

/** Issues an invoice from the accepted quote. Returns the existing one if already issued. */
export async function issueInvoice(organizationId: string, bookingId: string, actorId: string, now = new Date()) {
  return tenantDb(organizationId).$transaction(async (tx) => {
    const existing = await tx.invoice.findFirst({ where: { bookingId } });
    if (existing) return existing;
    const booking = await loadBooking(tx, bookingId);
    if (!["booked", "confirmed", "completed", "settled"].includes(booking.status)) throw new BookingError("invalid_status");
    const quote = await tx.quote.findFirst({ where: { bookingId, status: "accepted" }, include: { items: { orderBy: { position: "asc" } } } });
    if (!quote) throw new BookingError("quote_not_current");

    const [agency, customer] = await Promise.all([
      prisma.organization.findUniqueOrThrow({ where: { id: organizationId } }),
      booking.customerId ? prisma.user.findUnique({ where: { id: booking.customerId }, select: { name: true, email: true } }) : null,
    ]);
    const year = Number(todayInNetherlands(now).slice(0, 4));
    const number = formatInvoiceNumber(year, await nextCounter(tx, organizationId, `invoice:${year}`));

    const id = randomUUID();
    await tx.invoice.create({
      data: {
        id,
        organizationId,
        bookingId,
        number,
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
            logo: agency.logo,
          },
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
    await logEvent(tx, bookingId, "invoice_issued", actorId, { number });
    return tx.invoice.findFirstOrThrow({ where: { id } });
  });
}

/** Expires quotes past their deadline. Called by the worker. */
export async function expireQuotes(now = new Date()) {
  const due = await prisma.booking.findMany({
    where: { status: "quoted", quoteExpiresAt: { lte: now } },
    select: { id: true, organizationId: true },
  });
  for (const b of due) {
    await tenantDb(b.organizationId).$transaction(async (tx) => {
      const booking = await loadBooking(tx, b.id);
      await applyTransition(tx, booking, "expire", "system", null, now);
    });
  }
  return due.length;
}
