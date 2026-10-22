"use server";

import { headers } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import { eventTypes, generateTrackingCode, todayInNetherlands } from "@stagedesk/core";
import { prisma, submitInquiry } from "@stagedesk/db";
import { sendInquiryReceived, sendNewInquiry } from "@stagedesk/emails";
import { absoluteUrl, deliver, userLocale } from "@/lib/mail";
import { allow, clientIp } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";

export type InquiryResult = { ok: true; code: string; name: string } | { ok: false; message: string };

const text = (max: number) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : typeof v === "string" ? v.trim() : v), z.string().max(max).nullable());

const schema = z.object({
  name: z.string().trim().min(2).max(191),
  email: z.email().max(191),
  phone: text(32),
  eventType: z.enum(eventTypes),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.preprocess((v) => (v === "" ? null : v), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable()),
  venueName: text(191),
  venueCity: z.string().trim().min(1).max(96),
  guestCount: z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().int().min(1).max(100_000).nullable()),
  budgetRange: text(16),
  preferredArtistId: text(64),
  preferredGenre: text(96),
  partnerName: text(191),
  ceremony: z.preprocess((v) => v === "on" || v === true, z.boolean()),
  message: text(5000),
});

/**
 * Public inquiry form. Bots are filtered by a honeypot field, a minimum fill
 * time, Turnstile and per-IP / per-email rate limits; honeypot and timing
 * failures get a normal-looking answer so bots don't learn what tripped them.
 */
export async function submitInquiryAction(slug: string, form: FormData): Promise<InquiryResult> {
  const t = await getTranslations("bookingPage");
  const h = await headers();
  const ip = clientIp(h);
  const fields = Object.fromEntries(form);

  const startedAt = Number(fields["startedAt"]);
  if (fields["website"] || !Number.isFinite(startedAt) || Date.now() - startedAt < 3_000) {
    // Looks exactly like a real success, with a made-up reference.
    const name = String(fields["name"] ?? "").trim();
    return { ok: true, code: generateTrackingCode(), name: name.split(/\s+/)[0] ?? name };
  }

  if (!(await allow(`inquiry:ip:${ip}`, 5, 3600))) return { ok: false, message: t("errorRate") };
  if (!(await verifyTurnstile(typeof fields["cf-turnstile-response"] === "string" ? fields["cf-turnstile-response"] : null, ip))) {
    return { ok: false, message: t("errorCaptcha") };
  }

  const parsed = schema.safeParse(fields);
  if (!parsed.success) return { ok: false, message: t("errorRequired") };
  const d = parsed.data;
  if (d.eventDate < todayInNetherlands()) return { ok: false, message: t("errorDate") };
  if (!(await allow(`inquiry:email:${d.email.toLowerCase()}`, 3, 3600))) return { ok: false, message: t("errorRate") };

  const locale = userLocale(await getLocale());
  const result = await submitInquiry(slug, { ...d, email: d.email, locale });
  if (!result) return { ok: false, message: t("notFound") };
  const { agency, booking } = result;

  deliver(
    sendInquiryReceived(d.email, {
      locale,
      name: d.name.split(/\s+/)[0] ?? d.name,
      agency: agency.name,
      code: booking.trackingCode,
      url: absoluteUrl(locale, `/sign-in?next=${encodeURIComponent("/app/event")}`),
    }),
  );

  // Let everyone who handles bookings at the agency know, each in their own language.
  const staff = await prisma.member.findMany({
    where: { organizationId: agency.id, role: { in: ["agency_owner", "agency_admin", "agency_staff"] } },
    include: { user: { select: { email: true, locale: true } } },
  });
  for (const member of staff) {
    const staffLocale = userLocale(member.user.locale);
    const tt = await getTranslations({ locale: staffLocale, namespace: "eventTypes" });
    deliver(
      sendNewInquiry(member.user.email, {
        locale: staffLocale,
        customer: d.name,
        event: tt(d.eventType).toLowerCase(),
        date: new Intl.DateTimeFormat(staffLocale === "en" ? "en-GB" : "nl-NL", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
          new Date(`${d.eventDate}T12:00:00Z`),
        ),
        url: absoluteUrl(staffLocale, `/app/bookings/${booking.trackingCode}`),
      }),
    );
  }

  return { ok: true, code: booking.trackingCode, name: d.name.split(/\s+/)[0] ?? d.name };
}
