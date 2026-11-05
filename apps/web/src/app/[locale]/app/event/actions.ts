"use server";

import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import { eventTypes, isPastInNetherlands, playlistLink } from "@stagedesk/core";
import {
  CustomerRequestError,
  prisma,
  submitCustomerRequest,
  submitEventChange,
  updateCustomerPreferences,
  withdrawChangeRequest,
} from "@stagedesk/db";
import { announceNewBooking } from "@/lib/announce";
import { type ActionResult, runAction } from "@/lib/actions";
import { writeBlocked } from "@/lib/billing";
import { lines, time } from "@/lib/booking-form";
import { absoluteUrl, deliver, userLocale } from "@/lib/mail";
import { allow } from "@/lib/rate-limit";
import { fieldErrorKeys, type FormState, optionalText } from "@/lib/validation";
import { requireAgency, requireViewer } from "@/lib/viewer";

/** Runs one of the customer's event changes, turning its refusals into text. */
async function attempt(organizationId: string, task: () => Promise<string>): Promise<FormState> {
  const t = await getTranslations("customerEventErrors");
  // A suspended or read-only agency isn't taking changes; the customer gets a neutral answer about it.
  if (await writeBlocked(organizationId)) return { message: t("agency_unavailable") };
  const result = await runAction(task);
  return result.ok ? { ok: true, message: result.message } : { message: result.message };
}

const preferencesSchema = z.object({
  preferredGenre: optionalText(96),
  dos: lines,
  donts: lines,
  playlistUrl: optionalText(500),
  musicRequests: optionalText(4000),
  specialRequests: optionalText(4000),
});

/** The customer's music wishes and instructions. Only these fields can be sent, and only for their own booking. */
export async function savePreferencesAction(bookingId: string, form: FormData): Promise<FormState> {
  const { viewer, organization } = await requireAgency("customer.event");
  const t = await getTranslations("customerEvent");
  const parsed = preferencesSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { message: t("invalidForm") };
  if (parsed.data.playlistUrl && !playlistLink(parsed.data.playlistUrl)) return { fieldErrors: { playlistUrl: t("invalidPlaylist") } };
  if (!(await allow(`customer-event:${viewer.user.id}`, 60, 3600))) return { message: t("rateLimited") };
  return attempt(organization.id, async () => {
    await updateCustomerPreferences(organization.id, String(bookingId).slice(0, 64), viewer.user.id, parsed.data);
    return t("preferencesSaved");
  });
}

const blankToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

const changeSchema = z.object({
  eventType: z.enum(eventTypes),
  eventDate: z.preprocess(blankToNull, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "invalidDate").nullable()),
  startTime: time,
  endTime: time,
  venueName: optionalText(191),
  venueAddress: optionalText(191),
  venueCity: optionalText(96),
  guestCount: z.preprocess((v) => (blankToNull(v) === null ? null : Number(v)), z.number("invalidNumber").int("invalidNumber").min(1, "invalidNumber").max(100_000, "invalidNumber").nullable()),
  note: optionalText(2000),
});

/** Changes the contract details, or asks the agency to: the service decides which from the booking's status. */
export async function requestEventChangeAction(bookingId: string, form: FormData): Promise<FormState> {
  const { viewer, organization } = await requireAgency("customer.event");
  const [t, tb] = await Promise.all([getTranslations("customerEvent"), getTranslations("newBooking")]);
  const parsed = changeSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    const keys = fieldErrorKeys(parsed.error);
    const known = ["invalidTime", "invalidNumber", "invalidDate"];
    return { fieldErrors: Object.fromEntries(Object.entries(keys).map(([field, key]) => [field, known.includes(key) ? tb(key as "invalidTime") : t("invalidForm")])) };
  }
  if (!(await allow(`customer-event:${viewer.user.id}`, 60, 3600))) return { message: t("rateLimited") };
  const { note, ...details } = parsed.data;
  return attempt(organization.id, async () => {
    const { mode } = await submitEventChange(organization.id, String(bookingId).slice(0, 64), viewer.user.id, details, note);
    return mode === "direct" ? t("changeSaved") : t("changeRequested");
  });
}

export async function withdrawChangeAction(requestId: string): Promise<ActionResult> {
  const { viewer, organization } = await requireAgency("customer.event");
  const t = await getTranslations("customerEvent");
  const result = await attempt(organization.id, async () => {
    await withdrawChangeRequest(organization.id, String(requestId).slice(0, 64), viewer.user.id);
    return t("changeWithdrawn");
  });
  return { ok: Boolean(result.ok), message: result.message };
}

const requestSchema = z.object({
  organizationId: z.string().min(1).max(64),
  clientRequestId: z.uuid(),
  name: z.string().trim().min(2).max(191),
  phone: optionalText(32),
  eventType: z.enum(eventTypes),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: time,
  venueName: optionalText(191),
  venueCity: z.string().trim().min(1).max(96),
  guestCount: z.preprocess((v) => (blankToNull(v) === null ? null : Number(v)), z.number().int().min(1).max(100_000).nullable()),
  budgetRange: optionalText(16),
  preferredArtistId: optionalText(64),
  preferredGenre: optionalText(96),
  partnerName: optionalText(191),
  ceremony: z.preprocess((v) => v === "on" || v === true, z.boolean()),
  message: optionalText(5000),
});

export type RequestBookingResult = { ok: true; code: string; agency: string; organizationId: string } | { ok: false; message: string };

/**
 * A signed-in customer requests a booking from an agency they're a customer of.
 * The agency comes from their own memberships, never from the form alone. The
 * form's key makes a repeated submit return the first booking without telling
 * anyone twice.
 */
export async function requestBookingAction(form: FormData): Promise<RequestBookingResult> {
  const viewer = await requireViewer();
  const t = await getTranslations("customerRequest");
  const tp = await getTranslations("bookingPage");
  const parsed = requestSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: tp("errorRequired") };
  const d = parsed.data;
  const agency = viewer.memberships.find((m) => m.id === d.organizationId && m.role === "customer");
  if (!agency) return { ok: false, message: t("notCustomer") };
  if (isPastInNetherlands(d.eventDate, d.startTime)) return { ok: false, message: tp("errorDate") };
  if (!(await allow(`customer-request:${viewer.user.id}`, 10, 3600))) return { ok: false, message: tp("errorRate") };
  if (await writeBlocked(agency.id)) return { ok: false, message: t("closed", { agency: agency.name }) };

  let result: Awaited<ReturnType<typeof submitCustomerRequest>>;
  try {
    result = await submitCustomerRequest(agency.id, viewer.user.id, {
      clientRequestId: d.clientRequestId,
      eventType: d.eventType,
      eventDate: d.eventDate,
      startTime: d.startTime,
      venueName: d.venueName,
      venueCity: d.venueCity,
      guestCount: d.guestCount,
      budgetRange: d.budgetRange,
      preferredArtistId: d.preferredArtistId,
      preferredGenre: d.preferredGenre,
      partnerName: d.partnerName,
      ceremony: d.ceremony,
      message: d.message,
    });
  } catch (error) {
    if (error instanceof CustomerRequestError) return { ok: false, message: error.code === "closed" ? t("closed", { agency: agency.name }) : t("notCustomer") };
    throw error;
  }
  const { booking, duplicate } = result;
  const locale = userLocale(await getLocale());
  // Keyed by booking: a retry after a lost answer finds it stored and sends nothing twice,
  // and one whose first try died before this point still gets its confirmation.
  void deliver(
    {
      kind: "inquiryReceived",
      to: viewer.user.email,
      params: { locale, name: d.name.split(/\s+/)[0] ?? d.name, agency: agency.name, code: booking.trackingCode, url: absoluteUrl(locale, `/app/event?booking=${booking.trackingCode}`) },
    },
    { key: `inquiry-received:${booking.id}`, agencyId: agency.id, bookingId: booking.id },
  );
  if (!duplicate) {
    await prisma.user.update({ where: { id: viewer.user.id }, data: { name: d.name, phone: d.phone } });
    await announceNewBooking(agency.id, { trackingCode: booking.trackingCode, eventType: d.eventType, eventDate: d.eventDate }, d.name, viewer.user.id);
  }
  return { ok: true, code: booking.trackingCode, agency: agency.name, organizationId: agency.id };
}
