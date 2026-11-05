"use server";

import { randomUUID } from "node:crypto";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import { type Compensation, parseEuros, playlistLink } from "@stagedesk/core";
import {
  acceptQuote,
  assignArtist,
  BookingError,
  changeBookingStatus,
  createBooking,
  createDetailRequest,
  decideChangeRequest,
  DetailRequestError,
  resolveBookingCustomer,
  retryEmail,
  revokeDetailRequests,
  getSetting,
  issueInvoice,
  prisma,
  recordPayment,
  sendQuote,
  toDateOnly,
  updateBookingDetails,
} from "@stagedesk/db";
import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { emailQuote } from "@/lib/quote-email";
import { emailArtists } from "@/lib/artist-mail";
import { emailChangeDecision } from "@/lib/change-requests";
import { absoluteUrl, accepted, deliver } from "@/lib/mail";
import { sendStored } from "@/lib/deliver";
import { agencySender, agencySenderSelect } from "@/lib/correspondence";
import { draftDeposit, parseQuoteLines, type QuoteDraft, quoteDraftSchema } from "@/lib/quote-input";
import { type ActionResult, runAction } from "@/lib/actions";
import { type FormState, optionalText } from "@/lib/validation";
import { limitBlocked, suspendedBlocked, writeBlocked } from "@/lib/billing";
import { sendReceipt } from "@/lib/payment-claims";
import { requireAgency, viewerCan } from "@/lib/viewer";
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
  preferredGenre: optionalText(96),
  musicRequests: optionalText(4000),
  specialRequests: optionalText(4000),
  // The same music services a customer may link; the artist opens whatever is stored here.
  playlistUrl: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z
      .string()
      .max(500)
      .refine((v) => playlistLink(v) !== null, "invalidUrl")
      .transform((v) => playlistLink(v)!.url)
      .nullable(),
  ),
});

export async function updateDetailsAction(bookingId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const { viewer, organization } = await requireAgency("agency.bookings.edit");
  const blocked = await writeBlocked(organization.id);
  if (blocked) return { message: blocked };
  const parsed = detailsSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { fieldErrors: await translateErrors(parsed.error) };
  const { eventDate, budget, ...rest } = parsed.data;

  // A new date is refused when the booking's reserved equipment doesn't fit on it.
  const result = await runAction(() =>
    updateBookingDetails(organization.id, bookingId, { ...rest, budgetCents: budget, eventDate: eventDate ? toDateOnly(eventDate) : null }, viewer.user.id),
  );
  if (!result.ok) return { message: result.message };
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

  const deposit = draftDeposit(parsed.data);
  if (!deposit) return { ok: false, message: (await getTranslations("bookingErrors"))("invalid_amount") };

  return runAction(async () => {
    const quote = await sendQuote(
      organization.id,
      bookingId,
      {
        lines: quoteLines,
        deposit,
        expiresInDays: parsed.data.expiresInDays,
        notes: parsed.data.notes?.trim() || null,
        locale: parsed.data.locale ?? null,
      },
      viewer.user.id,
    );
    const receipt = await emailQuote(quote.id);
    // The quote is saved either way; say so plainly when its email couldn't be handed on.
    if (receipt && !accepted(receipt)) return `${t("sent", { n: quote.version })} ${t("emailNotQueued")}`;
    return t("sent", { n: quote.version });
  });
}

/** Emails the customer their quote link, in their own language. */
export async function acceptOnBehalfAction(quoteId: string, name: string): Promise<ActionResult> {
  const { viewer, organization } = await requireAgency("agency.quotes.accept");
  const blocked = await writeBlocked(organization.id);
  if (blocked) return { ok: false, message: blocked };
  const t = await getTranslations("booking");
  return runAction(
    () => acceptQuote(organization.id, quoteId, { actor: "agency", actorId: viewer.user.id, name: name.trim().slice(0, 191) || viewer.user.name }),
    t("statusChanged"),
  );
}

/** Pay for this booking only, as typed: a percentage ("40") or an amount ("250,00"). */
const payOverride = z.object({ type: z.enum(["percentage", "fixed"]), value: z.string().max(32) }).nullable();

export async function assignArtistAction(bookingId: string, artistId: string, pay: z.input<typeof payOverride> = null): Promise<ActionResult> {
  const { viewer, organization } = await requireAgency("agency.bookings.edit");
  const blocked = await writeBlocked(organization.id);
  if (blocked) return { ok: false, message: blocked };
  const t = await getTranslations("booking");
  const parsedPay = payOverride.safeParse(pay);
  if (!parsedPay.success) return { ok: false, message: (await getTranslations("bookingErrors"))("invalid_compensation") };
  let compensation: Compensation | null = null;
  if (parsedPay.data) {
    const { type, value } = parsedPay.data;
    const pct = Number(value.trim().replace(",", "."));
    const cents = parseEuros(value);
    compensation =
      type === "percentage"
        ? { type, shareBps: Number.isFinite(pct) ? Math.round(pct * 100) : -1, fixedCents: null }
        : { type, shareBps: 0, fixedCents: cents ?? -1 };
  }
  return runAction(async () => {
    const { assignmentId, withdrawnIds, notified } = await assignArtist(organization.id, bookingId, artistId, viewer.user.id, undefined, compensation);
    const mailed = await emailArtists([assignmentId], "new");
    await emailArtists(withdrawnIds, "withdrawn");
    const artist = await prisma.artist.findUnique({ where: { id: artistId }, select: { stageName: true } });
    const name = artist?.stageName ?? "";
    // Says what really happened: the request is saved either way, reaching the artist may not have worked.
    if (notified && mailed) return t("assigned", { artist: name });
    return [t("assignedSavedOnly", { artist: name }), !notified && t("notifyFailed"), !mailed && t("emailNotQueued")].filter(Boolean).join(" ");
  });
}

/** The agency approves or refuses a customer's requested change. Approving runs the same checks as an edit. */
export async function decideChangeRequestAction(requestId: string, approve: boolean, note: string | null, acknowledge: string | null = null): Promise<ActionResult> {
  const { viewer, organization } = await requireAgency("agency.bookings.edit");
  const blocked = await writeBlocked(organization.id);
  if (blocked) return { ok: false, message: blocked };
  const t = await getTranslations("booking");
  return runAction(async () => {
    const decision = await decideChangeRequest(organization.id, String(requestId).slice(0, 64), viewer.user.id, { approve, note: note?.slice(0, 2000) ?? null, acknowledge: acknowledge?.slice(0, 4000) ?? null });
    // The decision stands from here on; the agency hears if the customer's email couldn't be handed on.
    const mailed = await emailChangeDecision(decision).catch((error: unknown) => {
      console.error("[bookings] change decision email failed", decision.requestId, error);
      return false;
    });
    const said = approve ? t("changeApproved") : t("changeRejected");
    return mailed ? said : `${said} ${t("changeEmailFailed")}`;
  });
}

export async function changeStatusAction(
  bookingId: string,
  action: "decline" | "cancel" | "complete" | "settle",
  reason: string | null,
): Promise<ActionResult> {
  const { viewer, organization, db } = await requireAgency("agency.bookings.status");
  const blocked = await suspendedBlocked(organization.id);
  if (blocked) return { ok: false, message: blocked };
  const t = await getTranslations("booking");
  // Artists on the booking now; a cancel or decline takes them off it, and they're told.
  const active = action === "cancel" || action === "decline" ? await db.bookingAssignment.findMany({ where: { bookingId, status: { in: ["pending", "accepted"] } }, select: { id: true } }) : [];
  return runAction(async () => {
    await changeBookingStatus(organization.id, bookingId, action, { actor: "agency", actorId: viewer.user.id, reason: reason?.trim() || null });
    await emailArtists(active.map((a) => a.id), "cancelled");
  }, t("statusChanged"));
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
  const blocked = await suspendedBlocked(organization.id);
  if (blocked) return { ok: false, message: blocked };
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

export async function issueInvoiceAction(bookingId: string, manualNumber: string | null = null): Promise<ActionResult> {
  const { viewer, organization } = await requireAgency("agency.invoices");
  const blocked = await suspendedBlocked(organization.id);
  if (blocked) return { ok: false, message: blocked };
  const t = await getTranslations("booking");
  // Typing a number (instead of the next in the series) is for people who manage the agency's settings.
  if (manualNumber && !viewerCan(viewer, "agency.settings")) return { ok: false, message: (await getTranslations("bookingErrors"))("not_allowed") };
  if (manualNumber !== null && (typeof manualNumber !== "string" || manualNumber.length > 64)) return { ok: false, message: (await getTranslations("bookingErrors"))("invoice_number_invalid") };
  return runAction(async () => {
    const invoice = await issueInvoice(organization.id, bookingId, viewer.user.id, new Date(), { manualNumber });
    return t("invoiceIssued", { number: invoice.number });
  });
}

export async function addNoteAction(bookingId: string, body: string): Promise<ActionResult> {
  const { viewer, organization, db } = await requireAgency("agency.bookings");
  const blocked = await writeBlocked(organization.id);
  if (blocked) return { ok: false, message: blocked };
  const text = body.trim().slice(0, 5000);
  if (!text) return { ok: false };
  const booking = await db.booking.findFirst({ where: { id: bookingId }, select: { id: true } });
  if (!booking) throw new BookingError("not_found");
  await db.bookingNote.create({ data: { id: randomUUID(), bookingId, authorId: viewer.user.id, body: text, organizationId: "" } });
  return { ok: true };
}

const detailRequestSchema = z.object({ locale: z.enum(["nl", "en"]), days: z.number().int().min(1).max(30), email: z.boolean() });

/**
 * Makes a private link for the customer to fill in the event details, and
 * emails it when asked. Returns the link so it can be copied (it's shown
 * only now; the server keeps a hash).
 */
export async function requestDetailsAction(bookingId: string, input: z.input<typeof detailRequestSchema>): Promise<ActionResult & { url?: string }> {
  const { viewer, organization, db } = await requireAgency("agency.bookings.edit");
  const blocked = await writeBlocked(organization.id);
  if (blocked) return { ok: false, message: blocked };
  const t = await getTranslations("detailRequest");
  const parsed = detailRequestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t("invalid") };
  const booking = await db.booking.findFirst({ where: { id: bookingId }, select: { customer: { select: { name: true, email: true } } } });
  if (!booking?.customer) return { ok: false, message: t("error_no_customer") };
  try {
    const { id: requestId, token, expiresAt } = await createDetailRequest(organization.id, bookingId, viewer.user.id, { locale: parsed.data.locale, days: parsed.data.days, emailedTo: parsed.data.email ? booking.customer.email : null });
    const url = absoluteUrl(parsed.data.locale, `/d/${token}`);
    let mailed = true;
    if (parsed.data.email) {
      const org = await prisma.organization.findUniqueOrThrow({ where: { id: organization.id }, select: agencySenderSelect });
      const intl = parsed.data.locale === "en" ? "en-GB" : "nl-NL";
      const receipt = await deliver({
        kind: "bookingDetailsRequest",
        to: booking.customer.email,
        sender: agencySender(org),
        params: {
          locale: parsed.data.locale,
          name: booking.customer.name.split(/\s+/)[0] ?? booking.customer.name,
          agency: org.emailFromName?.trim() || org.name,
          until: new Intl.DateTimeFormat(intl, { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Amsterdam" }).format(expiresAt),
          url,
        },
      }, { key: `details:${requestId}`, agencyId: organization.id, bookingId });
      mailed = accepted(receipt);
    }
    // The link works either way; if the email couldn't be handed on, the agency can copy it.
    return { ok: true, message: !parsed.data.email ? t("created") : mailed ? t("emailed", { email: booking.customer.email }) : t("emailFailedCopy"), url };
  } catch (error) {
    if (error instanceof DetailRequestError) return { ok: false, message: t(`error_${error.code}`) };
    throw error;
  }
}

export async function revokeDetailsAction(bookingId: string): Promise<ActionResult> {
  const { viewer, organization } = await requireAgency("agency.bookings.edit");
  const t = await getTranslations("detailRequest");
  await revokeDetailRequests(organization.id, bookingId, viewer.user.id);
  return { ok: true, message: t("revoked") };
}

/** Puts a failed email of this booking back in line; the worker (or this request, without one) sends it. */
export async function retryEmailAction(emailId: string): Promise<ActionResult> {
  const { organization, db } = await requireAgency("agency.bookings.edit");
  const t = await getTranslations("bookingEmails");
  const row = await prisma.emailMessage.findUnique({ where: { id: String(emailId).slice(0, 64) }, select: { bookingId: true, agencyId: true } });
  // Only this agency's bookings (the outbox isn't tenant-scoped, so check through the booking).
  const mine = row?.bookingId ? await db.booking.findFirst({ where: { id: row.bookingId }, select: { id: true } }) : null;
  if (!row || !mine || (row.agencyId && row.agencyId !== organization.id)) return { ok: false, message: t("notFound") };
  if (!(await retryEmail(emailId))) return { ok: false, message: t("notRetryable") };
  void sendStored(emailId).catch(() => undefined);
  return { ok: true, message: t("retried") };
}
