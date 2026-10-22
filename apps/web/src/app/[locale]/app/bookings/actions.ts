"use server";

import { randomUUID } from "node:crypto";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import { eventTypes, parseEuros, parseQuantity, type QuoteLineInput } from "@stagedesk/core";
import {
  acceptQuote,
  assignArtist,
  BookingError,
  changeBookingStatus,
  createBooking,
  getSetting,
  issueInvoice,
  prisma,
  recordPayment,
  sendQuote,
  toDateOnly,
} from "@stagedesk/db";
import { sendQuote as sendQuoteEmail } from "@stagedesk/emails";
import { redirect } from "@/i18n/navigation";
import { absoluteUrl, deliver, userLocale } from "@/lib/mail";
import type { Locale } from "@/i18n/routing";
import { type ActionResult, runAction } from "@/lib/actions";
import { fieldErrorKeys, type FormState, optionalText } from "@/lib/validation";
import { requireAgency } from "@/lib/viewer";

const time = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? null : v),
  z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "invalidTime").nullable(),
);
const wholeNumber = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? null : Number(v)),
  z.number().int("invalidNumber").min(0, "invalidNumber").max(100_000, "invalidNumber").nullable(),
);
const euros = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? null : typeof v === "string" ? parseEuros(v) : v),
  z.number({ error: "invalidPrice" }).int().min(0, "invalidPrice").nullable(),
);
const date = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? null : v),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "invalidDate").nullable(),
);
const lines = z.preprocess(
  (v) => (typeof v === "string" ? v.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 30) : []),
  z.array(z.string().max(200)),
);

const eventFields = {
  eventType: z.enum(eventTypes),
  eventDate: date,
  startTime: time,
  endTime: time,
  venueName: optionalText(191),
  venueAddress: optionalText(191),
  venueCity: optionalText(96),
  guestCount: wholeNumber,
  budget: euros,
  partnerName: optionalText(191),
};

const newBookingSchema = z.object({
  ...eventFields,
  customerMode: z.enum(["existing", "new"]),
  customerId: optionalText(64),
  customerName: optionalText(191),
  customerEmail: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.email("invalidEmail").max(191).nullable()),
  customerPhone: optionalText(32),
  message: optionalText(5000),
});

async function translateErrors(error: z.ZodError) {
  const [tb, ts] = await Promise.all([getTranslations("newBooking"), getTranslations("agencySettings")]);
  const keys = fieldErrorKeys(error);
  return Object.fromEntries(
    Object.entries(keys).map(([field, key]) => [
      field,
      ["invalidTime", "invalidNumber", "invalidDate", "invalidPrice"].includes(key)
        ? tb(key as "invalidTime")
        : ts(key as "required"),
    ]),
  );
}

/** Customers are global accounts linked to the agency through a membership. */
async function resolveCustomer(
  db: Awaited<ReturnType<typeof requireAgency>>["db"],
  organizationId: string,
  input: { mode: "existing" | "new"; id: string | null; name: string | null; email: string | null; phone: string | null },
) {
  if (input.mode === "existing") {
    if (!input.id) return null;
    const member = await db.member.findFirst({ where: { userId: input.id, role: "customer" }, select: { userId: true } });
    return member?.userId ?? null;
  }
  if (!input.name || !input.email) return null;
  const email = input.email.toLowerCase();
  const user =
    (await prisma.user.findUnique({ where: { email }, select: { id: true } })) ??
    (await prisma.user.create({ data: { id: randomUUID(), email, name: input.name, phone: input.phone }, select: { id: true } }));
  const existing = await db.member.findFirst({ where: { userId: user.id }, select: { role: true } });
  if (existing && existing.role !== "customer") return null;
  if (!existing) await db.member.create({ data: { id: randomUUID(), userId: user.id, role: "customer", organizationId } });
  return user.id;
}

export async function createBookingAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { viewer, organization, db } = await requireAgency("agency.bookings");
  const parsed = newBookingSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { fieldErrors: await translateErrors(parsed.error) };
  const d = parsed.data;

  const customerId = await resolveCustomer(db, organization.id, {
    mode: d.customerMode,
    id: d.customerId,
    name: d.customerName,
    email: d.customerEmail,
    phone: d.customerPhone,
  });
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
  const { viewer, db } = await requireAgency("agency.bookings");
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

const quoteSchema = z.object({
  depositPct: z.number().min(0).max(100),
  expiresInDays: z.number().int().min(1).max(180),
  notes: z.string().max(2000).nullable(),
  lines: z
    .array(z.object({ description: z.string(), quantity: z.string(), unitPrice: z.string(), vatBps: z.number().int() }))
    .max(50),
});

export async function sendQuoteAction(bookingId: string, input: z.input<typeof quoteSchema>): Promise<ActionResult> {
  const { viewer, organization } = await requireAgency("agency.quotes");
  const t = await getTranslations("booking");
  const parsed = quoteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: (await getTranslations("auth"))("generic") };

  const { vatRatesBps } = await getSetting("bookings.defaults");
  const quoteLines: QuoteLineInput[] = [];
  for (const [i, line] of parsed.data.lines.entries()) {
    const quantityHundredths = parseQuantity(line.quantity);
    const unitPriceCents = parseEuros(line.unitPrice);
    if (!line.description.trim() || line.description.length > 500 || quantityHundredths === null || unitPriceCents === null || !vatRatesBps.includes(line.vatBps)) {
      return { ok: false, message: t("invalidLine", { n: i + 1 }) };
    }
    quoteLines.push({ description: line.description.trim(), quantityHundredths, unitPriceCents, vatBps: line.vatBps });
  }

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
async function emailQuote(quoteId: string, agencyName: string) {
  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    select: { token: true, totalCents: true, expiresAt: true, booking: { select: { customer: { select: { name: true, email: true, locale: true } } } } },
  });
  const customer = quote?.booking.customer;
  if (!quote || !customer) return;
  const locale = userLocale(customer.locale);
  const intl = locale === "en" ? "en-GB" : "nl-NL";
  deliver(
    sendQuoteEmail(customer.email, {
      locale,
      name: customer.name.split(/\s+/)[0] ?? customer.name,
      agency: agencyName,
      total: new Intl.NumberFormat(intl, { style: "currency", currency: "EUR" }).format(quote.totalCents / 100),
      until: new Intl.DateTimeFormat(intl, { day: "numeric", month: "long", timeZone: "Europe/Amsterdam" }).format(quote.expiresAt),
      url: absoluteUrl(locale, `/q/${quote.token}`),
    }),
  );
}

export async function acceptOnBehalfAction(quoteId: string, name: string): Promise<ActionResult> {
  const { viewer, organization } = await requireAgency("agency.quotes");
  const t = await getTranslations("booking");
  return runAction(
    () => acceptQuote(organization.id, quoteId, { actor: "agency", actorId: viewer.user.id, name: name.trim().slice(0, 191) || viewer.user.name }),
    t("statusChanged"),
  );
}

export async function assignArtistAction(bookingId: string, artistId: string): Promise<ActionResult> {
  const { viewer, organization } = await requireAgency("agency.bookings");
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
  const { viewer, organization } = await requireAgency("agency.bookings");
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
  const { viewer, organization } = await requireAgency("agency.payments");
  const t = await getTranslations("booking");
  const parsed = paymentSchema.safeParse(input);
  const amountCents = parsed.success ? parseEuros(parsed.data.amount) : null;
  if (!parsed.success || !amountCents || amountCents <= 0) {
    return { ok: false, message: (await getTranslations("bookingErrors"))("invalid_amount") };
  }
  return runAction(
    () =>
      recordPayment(
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
      ),
    t("paymentRecorded"),
  );
}

export async function issueInvoiceAction(bookingId: string): Promise<ActionResult> {
  const { viewer, organization } = await requireAgency("agency.payments");
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
