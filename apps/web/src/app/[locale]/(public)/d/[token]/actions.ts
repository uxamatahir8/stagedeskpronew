"use server";

import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { eventTypes, playlistLink } from "@stagedesk/core";
import { submitDetailRequest } from "@stagedesk/db";
import type { ActionResult } from "@/lib/actions";
import { allow, clientIp } from "@/lib/rate-limit";

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v));

const schema = z.object({
  eventType: z.enum(eventTypes),
  eventDate: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).transform((v) => (v === "" ? null : v)),
  startTime: z.union([z.literal(""), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)]).transform((v) => (v === "" ? null : v)),
  endTime: z.union([z.literal(""), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)]).transform((v) => (v === "" ? null : v)),
  venueName: text(191),
  venueAddress: text(191),
  venueCity: text(96),
  guestCount: z.union([z.literal(""), z.coerce.number().int().min(1).max(100_000)]).transform((v) => (v === "" ? null : v)),
  partnerName: text(191),
  preferredGenre: text(96),
  // The same music services the customer's portal and the agency accept.
  playlistUrl: z.union([z.literal(""), z.string().trim().max(500).refine((v) => playlistLink(v) !== null)]).transform((v) => (v === "" ? null : playlistLink(v)!.url)),
  notes: text(4000),
  phone: text(32),
});

/**
 * The customer's details from their private link. The link's secret is what
 * grants access (like the quote link); submits are limited per address.
 */
export async function submitDetailsAction(token: string, input: z.input<typeof schema>): Promise<ActionResult & { kept?: string[] }> {
  const t = await getTranslations("detailsPage");
  if (!(await allow(`details:${clientIp(await headers())}`, 10, 600))) return { ok: false, message: t("tooMany") };
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t("invalid") };
  const valid = (d: string | null) => d === null || !Number.isNaN(new Date(`${d}T12:00:00Z`).getTime());
  if (!valid(parsed.data.eventDate)) return { ok: false, message: t("invalid") };
  const result = await submitDetailRequest(String(token).slice(0, 120), parsed.data);
  if (!result) return { ok: false, message: t("expired") };
  return { ok: true, message: t("thanks"), kept: result.kept };
}
