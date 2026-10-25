"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { eventTypes, parseEuros } from "@stagedesk/core";
import { deleteListing, getSetting, ListingError, saveListing } from "@stagedesk/db";
import type { ActionResult } from "@/lib/actions";
import { requireAgency } from "@/lib/viewer";

const schema = z.object({
  id: z.string().max(64).nullable(),
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(3000),
  price: z.string().max(20),
  vatBps: z.number().int(),
  depositPct: z.number().min(0).max(100),
  hours: z.string().max(5),
  eventTypes: z.array(z.enum(eventTypes)).min(1).nullable(),
  active: z.boolean(),
});

/** Creates or changes a gig the independent artist offers at a set price. */
export async function saveListingAction(input: z.input<typeof schema>): Promise<ActionResult> {
  const { organization } = await requireAgency("solo.listings");
  const t = await getTranslations("listings");
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t("invalid") };
  const d = parsed.data;
  const priceCents = parseEuros(d.price);
  const { vatRatesBps } = await getSetting("bookings.defaults");
  if (priceCents === null || priceCents <= 0) return { ok: false, message: t("invalidPrice") };
  if (!vatRatesBps.includes(d.vatBps)) return { ok: false, message: t("invalid") };
  const hours = d.hours.trim() ? Number(d.hours.replace(",", ".")) : null;
  if (hours !== null && !(hours > 0 && hours <= 24)) return { ok: false, message: t("invalidHours") };
  try {
    await saveListing(organization.id, d.id, {
      title: d.title,
      description: d.description || null,
      priceCents,
      vatBps: d.vatBps,
      depositBps: Math.round(d.depositPct * 100),
      durationMinutes: hours === null ? null : Math.round(hours * 60),
      eventTypes: d.eventTypes,
      active: d.active,
    });
  } catch (error) {
    if (error instanceof ListingError) return { ok: false, message: t("notSolo") };
    throw error;
  }
  revalidatePath("/[locale]/app/listings", "page");
  return { ok: true, message: t("saved") };
}

export async function deleteListingAction(id: string): Promise<ActionResult> {
  const { organization } = await requireAgency("solo.listings");
  await deleteListing(organization.id, id);
  revalidatePath("/[locale]/app/listings", "page");
  return { ok: true, message: (await getTranslations("listings"))("deleted") };
}
