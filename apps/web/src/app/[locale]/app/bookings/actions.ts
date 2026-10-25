"use server";

import { randomUUID } from "node:crypto";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import { parseEuros } from "@stagedesk/core";
import {
  acceptQuote,
  assignArtist,
  BookingError,
  changeBookingStatus,
  createBooking,
  resolveBookingCustomer,
  getSetting,
  issueInvoice,
  prisma,
  recordPayment,
  sendQuote,
  toDateOnly,
} from "@stagedesk/db";
import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { emailQuote } from "@/lib/quote-email";
import { parseQuoteLines, type QuoteDraft, quoteDraftSchema } from "@/lib/quote-input";
import { type ActionResult, runAction } from "@/lib/actions";
import { type FormState } from "@/lib/validation";
import { limitBlocked, writeBlocked } from "@/lib/billing";
import { sendReceipt } from "@/lib/payment-claims";
import { requireAgency } from "@/lib/viewer";
import { eventFields, lines, newBookingSchema, translateErrors } from "@/lib/booking-form";

export async function createBookingAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { viewer, organization } = await requireAgency("agency.bookings.create");
  const blocked = await limitBlocked(organization.id, "maxBookingsPerMonth");
  if (blocked) return { message: blocked };
  const parsed = newBookingSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { fieldErrors: await translateErrors(parsed.error) };
  const d = parsed.data;

  const customerId = await resolveBookingCustomer(
    organization.id,
    d.customerMode === "existing" ? { mode: "existing", id: d.customerId } : { mode: "new", name: d.customerName, email: d.customerEmail, phone: d.customerPhone },
  );
  if (!customerId) return { message: (await getTranslations("newBooking"))("customerRequired") };

  const booking = await createBooking(
    organization.id,
    {
      customerId,
      eventType: d.eventType,
      eventDate: d.eventDate,
      startTime: d.startTime,
      endTime: d.endTime,
      venueName: d.venueName,
      venueAddress: d.venueAddress,
      venueCity: d.venueCity,
      guestCount: d.guestCount,
      budgetCents: d.budget,
      partnerName: d.partnerName,
      message: d.message,
    },
    viewer.user.id,
  );
  redirect({ href: `/app/bookings/${booking.trackingCode}`, locale: (await getLocale()) as Locale });
  return { ok: true };
}

const detailsSchema = z.object({
  ...eventFields,
  dos: lines,
  donts: lines,
  playlistUrl: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.url({ protocol: /^https?$/, error: "invalidUrl" }).max(500).nullable(),
  ),
});

export async function updateDetailsAction(bookingId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const { viewer, db } = await requireAgency("agency.bookings.edit");
  const parsed = detailsSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { fieldErrors: await translateErrors(parsed.error) };
  const { eventDate, budget, ...rest } = parsed.data;

  const updated = await db.booking.updateMany({
    where: { id: bookingId, status: { in: ["inquiry", "quoted", "booked", "confirmed", "expired"] } },
    data: { ...rest, budgetCents: budget, eventDate: eventDate ? toDateOnly(eventDate) : null },
  });
  if (updated.count === 0) return { message: (await getTranslations("bookingErrors"))("invalid_status") };
  await db.bookingEvent.create({
    data: { bookingId, type: "details_updated", actorId: viewer.user.id, organizationId: "" },
  });
  return { ok: true, message: (await getTranslations("booking"))("saved") };
}

export async function sendQuoteAction(bookingId: string, input: QuoteDraft): Promise<ActionResult> {
  const { viewer, organization } = await requireAgency("agency.quotes.send");
  const blocked = await writeBlocked(organization.id);
  if (blocked) return { ok: false, message: blocked };
  const t = await getTranslations("booking");
  const parsed = quoteDraftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: (await getTranslations("auth"))("generic") };

  const { vatRatesBps } = await getSetting("bookings.defaults");
  const parsedLines = parseQuoteLines(parsed.data.lines, vatRatesBps);
  if ("badLine" in parsedLines) return { ok: false, message: t("invalidLine", { n: parsedLines.badLine }) };
  const quoteLines = parsedLines.lines;

  return runAction(async () => {
    const quote = await sendQuote(
      organization.id,
      bookingId,
      {
        lines: quoteLines,
        depositBps: Math.round(parsed.data.depositPct * 100),
        expiresInDays: parsed.data.expiresInDays,
        notes: parsed.data.notes?.trim() || null,
      },
      viewer.user.id,
    );
    await emailQuote(quote.id, organization.name);
    return t("sent", { n: quote.version });
  });
}

/** Emails the customer their quote link, in their own language. */
export async function acceptOnBehalfAction(quoteId: string, name: string): Promise<ActionResult> {
  const { viewer, organization } = await requireAgency("agency.quotes.accept");
  const t = await getTranslations("booking");
  return runAction(
    () => acceptQuote(organization.id, quoteId, { actor: "agency", actorId: viewer.user.id, name: name.trim().slice(0, 191) || viewer.user.name }),
    t("statusChanged"),
  );
}

export async function assignArtistAction(bookingId: string, artistId: string): Promise<ActionResult> {
  const { viewer, organization } = await requireAgency("agency.bookings.edit");
  const blocked = await writeBlocked(organization.id);
  if (blocked) return { ok: false, message: blocked };
  const t = await getTranslations("booking");
  return runAction(async () => {
    await assignArtist(organization.id, bookingId, artistId, viewer.user.id);
    const artist = await prisma.artist.findUnique({ where: { id: artistId }, select: { stageName: true } });
    return t("assigned", { artist: artist?.stageName ?? "" });
  });
}

export async function changeStatusAction(
  bookingId: string,
  action: "decline" | "cancel" | "complete" | "settle",
  reason: string | null,
): Promise<ActionResult> {
  const { viewer, organization } = await requireAgency("agency.bookings.status");
  const t = await getTranslations("booking");
  return runAction(
    () => changeBookingStatus(organization.id, bookingId, action, { actor: "agency", actorId: viewer.user.id, reason: reason?.trim() || null }).then(() => {}),
    t("statusChanged"),
  );
}

const paymentSchema = z.object({
  amount: z.string(),
  kind: z.enum(["deposit", "balance", "other"]),
  method: z.enum(["bank_transfer", "cash", "card", "other"]),
  receivedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reference: z.string().max(191).optional(),
});

export async function recordPaymentAction(bookingId: string, input: z.input<typeof paymentSchema>): Promise<ActionResult> {
  const { viewer, organization } = await requireAgency("agency.payments.record");
  const t = await getTranslations("booking");
  const parsed = paymentSchema.safeParse(input);
  const amountCents = parsed.success ? parseEuros(parsed.data.amount) : null;
  if (!parsed.success || !amountCents || amountCents <= 0) {
    return { ok: false, message: (await getTranslations("bookingErrors"))("invalid_amount") };
  }
  return runAction(
    async () => {
      const payment = await recordPayment(
        organization.id,
        bookingId,
        {
          amountCents,
          kind: parsed.data.kind,
          method: parsed.data.method,
          receivedAt: new Date(`${parsed.data.receivedAt}T12:00:00Z`),
          reference: parsed.data.reference?.trim() || null,
        },
        viewer.user.id,
      );
      // Offline refunds are negative amounts; only money in gets a receipt.
      if (payment.amountCents > 0) await sendReceipt(payment);
    },
    t("paymentRecorded"),
  );
}

export async function issueInvoiceAction(bookingId: string): Promise<ActionResult> {
  const { viewer, organization } = await requireAgency("agency.invoices");
  const t = await getTranslations("booking");
  return runAction(async () => {
    const invoice = await issueInvoice(organization.id, bookingId, viewer.user.id);
    return t("invoiceIssued", { number: invoice.number });
  });
}

export async function addNoteAction(bookingId: string, body: string): Promise<ActionResult> {
  const { viewer, db } = await requireAgency("agency.bookings");
  const text = body.trim().slice(0, 5000);
  if (!text) return { ok: false };
  const booking = await db.booking.findFirst({ where: { id: bookingId }, select: { id: true } });
  if (!booking) throw new BookingError("not_found");
  await db.bookingNote.create({ data: { id: randomUUID(), bookingId, authorId: viewer.user.id, body: text, organizationId: "" } });
  return { ok: true };
}
