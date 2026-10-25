"use server";

import { headers } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import { eventTypes, generateTrackingCode, todayInNetherlands } from "@stagedesk/core";
import { artistProfile, ListingError, orderListing, submitInquiry } from "@stagedesk/db";
import type { InquiryResult } from "@/app/[locale]/(public)/b/[slug]/actions";
import { announceNewBooking } from "@/lib/announce";
import { absoluteUrl, deliver, userLocale } from "@/lib/mail";
import { emailQuote } from "@/lib/quote-email";
import { allow, clientIp } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";

const text = (max: number) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : typeof v === "string" ? v.trim() : v), z.string().max(max).nullable());

const eventFields = {
  name: z.string().trim().min(2).max(191),
  email: z.email().max(191),
  phone: text(32),
  eventType: z.enum(eventTypes),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.preprocess((v) => (v === "" ? null : v), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable()),
  venueName: text(191),
  venueCity: z.string().trim().min(1).max(96),
  guestCount: z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().int().min(1).max(100_000).nullable()),
  message: text(5000),
};
const requestSchema = z.object({
  ...eventFields,
  budgetRange: text(16),
  preferredArtistId: text(64),
  preferredGenre: text(96),
  partnerName: text(191),
  ceremony: z.preprocess((v) => v === "on" || v === true, z.boolean()),
});
const orderSchema = z.object(eventFields);

/** Shared bot defences for both forms; a bot gets a normal-looking answer. */
async function screen(form: FormData, scope: string): Promise<{ fields: Record<string, FormDataEntryValue>; fake?: InquiryResult; error?: string }> {
  const t = await getTranslations("bookingPage");
  const ip = clientIp(await headers());
  const fields = Object.fromEntries(form);
  const startedAt = Number(fields["startedAt"]);
  if (fields["website"] || !Number.isFinite(startedAt) || Date.now() - startedAt < 3_000) {
    const name = String(fields["name"] ?? "").trim();
    return { fields, fake: { ok: true, code: generateTrackingCode(), name: name.split(/\s+/)[0] ?? name } };
  }
  if (!(await allow(`${scope}:ip:${ip}`, 5, 3600))) return { fields, error: t("errorRate") };
  if (!(await verifyTurnstile(typeof fields["cf-turnstile-response"] === "string" ? fields["cf-turnstile-response"] : null, ip))) return { fields, error: t("errorCaptcha") };
  return { fields };
}

/** "Ask for a price" on an artist's public profile: a request to that artist, like an agency's booking page. */
export async function requestArtistPriceAction(slug: string, form: FormData): Promise<InquiryResult> {
  const t = await getTranslations("bookingPage");
  const { fields, fake, error } = await screen(form, "artist-request");
  if (fake) return fake;
  if (error) return { ok: false, message: error };
  const parsed = requestSchema.safeParse(fields);
  if (!parsed.success) return { ok: false, message: t("errorRequired") };
  const d = parsed.data;
  if (d.eventDate < todayInNetherlands()) return { ok: false, message: t("errorDate") };
  if (!(await allow(`artist-request:email:${d.email.toLowerCase()}`, 3, 3600))) return { ok: false, message: t("errorRate") };
  // Only artists in the directory (with the Artist plan) can be booked directly.
  if (!(await artistProfile(slug))) return { ok: false, message: t("notFound") };

  const locale = userLocale(await getLocale());
  const result = await submitInquiry(slug, { ...d, preferredArtistId: null, locale }, "profile");
  if (!result) return { ok: false, message: t("notFound") };
  const { agency, booking } = result;
  deliver({
    kind: "inquiryReceived",
    to: d.email,
    params: { locale, name: d.name.split(/\s+/)[0] ?? d.name, agency: agency.name, code: booking.trackingCode, url: absoluteUrl(locale, `/sign-in?next=${encodeURIComponent("/app/event")}`) },
  });
  await announceNewBooking(agency.id, { trackingCode: booking.trackingCode, eventType: d.eventType, eventDate: d.eventDate }, d.name);
  return { ok: true, code: booking.trackingCode, name: d.name.split(/\s+/)[0] ?? d.name };
}

/** Orders one of the artist's gigs: the booking comes with the gig's price as a quote, emailed to accept and pay. */
export async function orderGigAction(slug: string, listingId: string, form: FormData): Promise<InquiryResult> {
  const [t, tl] = await Promise.all([getTranslations("bookingPage"), getTranslations("artistDirectory")]);
  const { fields, fake, error } = await screen(form, "gig-order");
  if (fake) return fake;
  if (error) return { ok: false, message: error };
  const parsed = orderSchema.safeParse(fields);
  if (!parsed.success) return { ok: false, message: t("errorRequired") };
  const d = parsed.data;
  if (d.eventDate < todayInNetherlands()) return { ok: false, message: t("errorDate") };
  if (!(await allow(`gig-order:email:${d.email.toLowerCase()}`, 3, 3600))) return { ok: false, message: t("errorRate") };

  try {
    const { booking, quote, organizationId, stageName } = await orderListing(slug, listingId, { ...d, email: d.email.trim().toLowerCase() });
    await emailQuote(quote.id, stageName);
    await announceNewBooking(organizationId, { trackingCode: booking.trackingCode, eventType: d.eventType, eventDate: d.eventDate }, d.name);
    return { ok: true, code: booking.trackingCode, name: d.name.split(/\s+/)[0] ?? d.name };
  } catch (e) {
    if (e instanceof ListingError) return { ok: false, message: tl(`error_${e.code}`) };
    throw e;
  }
}
