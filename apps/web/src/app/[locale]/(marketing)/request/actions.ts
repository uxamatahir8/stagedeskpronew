"use server";

import { headers } from "next/headers";
import { after } from "next/server";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import { eventTypes, generateTrackingCode, isPastInNetherlands } from "@stagedesk/core";
import { notify, platformAdminIds, submitLead } from "@stagedesk/db";
import type { InquiryResult } from "@/app/[locale]/(public)/b/[slug]/actions";
import { runLeadBroadcast } from "@/lib/lead-market";
import { absoluteUrl, deliver, userLocale } from "@/lib/mail";
import { allow, clientIp } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";

const text = (max: number) =>
  z.preprocess((v) => (v == null || (typeof v === "string" && v.trim() === "") ? null : typeof v === "string" ? v.trim() : v), z.string().max(max).nullable());

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
  preferredGenre: text(96),
  partnerName: text(191),
  ceremony: z.preprocess((v) => v === "on" || v === true, z.boolean()),
  message: text(5000),
});

/**
 * The platform's own request form: the request becomes a lead that goes out
 * to every agency and artist serving the area, who send their price; the
 * customer compares and accepts one. Same bot defences as a booking page.
 */
export async function submitLeadAction(form: FormData): Promise<InquiryResult> {
  const t = await getTranslations("bookingPage");
  const h = await headers();
  const ip = clientIp(h);
  const fields = Object.fromEntries(form);

  const startedAt = Number(fields["startedAt"]);
  if (fields["website"] || !Number.isFinite(startedAt) || Date.now() - startedAt < 3_000) {
    const name = String(fields["name"] ?? "").trim();
    return { ok: true, code: `L-${generateTrackingCode().slice(0, 6)}`, name: name.split(/\s+/)[0] ?? name };
  }
  if (!(await allow(`lead:ip:${ip}`, 5, 3600))) return { ok: false, message: t("errorRate") };
  if (!(await verifyTurnstile(typeof fields["cf-turnstile-response"] === "string" ? fields["cf-turnstile-response"] : null, ip))) {
    return { ok: false, message: t("errorCaptcha") };
  }
  const parsed = schema.safeParse(fields);
  if (!parsed.success) return { ok: false, message: t("errorRequired") };
  const d = parsed.data;
  if (isPastInNetherlands(d.eventDate, d.startTime)) return { ok: false, message: t("errorDate") };
  if (!(await allow(`lead:email:${d.email.toLowerCase()}`, 3, 3600))) return { ok: false, message: t("errorRate") };

  const locale = userLocale(await getLocale());
  const lead = await submitLead({ ...d, locale });
  const first = d.name.split(/\s+/)[0] ?? d.name;
  deliver({ kind: "leadReceived", to: d.email, params: { locale, name: first, reference: lead.reference, url: absoluteUrl(locale, `/request/${lead.reference}?t=${lead.accessToken}`) } });
  await notify(await platformAdminIds(), { type: "lead_new", data: { name: d.name, code: lead.reference }, url: `/app/leads/${lead.id}` });
  // Matching needs the map (a network call), so it runs after the customer has their answer.
  after(() => runLeadBroadcast(lead.id));
  return { ok: true, code: lead.reference, name: first };
}
