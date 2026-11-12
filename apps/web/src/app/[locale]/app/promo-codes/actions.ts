"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { attachBookingPromo, deleteBookingPromoCode, detachBookingPromo, PromoCodeError, saveBookingPromoCode, tenantDb } from "@stagedesk/db";
import type { ActionResult } from "@/lib/actions";
import { writeBlocked } from "@/lib/billing";
import { requireAgency } from "@/lib/viewer";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();
const schema = z.object({
  code: z.string().trim().min(3).max(32),
  description: z.string().trim().max(191).nullable(),
  discountType: z.enum(["percentage", "fixed"]),
  percentBps: z.int().min(1).max(10_000).nullable(),
  amountCents: z.int().min(1).max(10_000_000).nullable(),
  minTotalCents: z.int().min(1).max(100_000_000).nullable(),
  validFrom: day,
  validUntil: day,
  maxRedemptions: z.int().min(1).max(1_000_000).nullable(),
  active: z.boolean(),
});
export type BookingPromoForm = z.input<typeof schema>;

const refresh = () => revalidatePath("/[locale]/app/promo-codes", "page");

async function message(error: unknown): Promise<ActionResult> {
  const t = await getTranslations("promoCodes");
  if (error instanceof PromoCodeError) return { ok: false, message: t(`error_${error.code}` as "error_invalid") };
  throw error;
}

/** Adds (id null) or changes one of the agency's codes. */
export async function saveBookingPromoAction(id: string | null, input: BookingPromoForm): Promise<ActionResult> {
  const { organization } = await requireAgency("agency.services");
  const blocked = await writeBlocked(organization.id);
  if (blocked) return { ok: false, message: blocked };
  const t = await getTranslations("promoCodes");
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t("error_invalid") };
  const d = parsed.data;
  try {
    const saved = await saveBookingPromoCode(organization.id, id ? z.string().max(64).parse(id) : null, {
      ...d,
      // Valid from the start of the first day to the end of the last.
      validFrom: d.validFrom ? new Date(`${d.validFrom}T00:00:00Z`) : null,
      validUntil: d.validUntil ? new Date(`${d.validUntil}T23:59:59Z`) : null,
    });
    refresh();
    return { ok: true, message: t("saved", { code: saved.code }) };
  } catch (error) {
    return message(error);
  }
}

export async function setBookingPromoActiveAction(id: string, active: boolean): Promise<ActionResult> {
  const { organization } = await requireAgency("agency.services");
  const blocked = await writeBlocked(organization.id);
  if (blocked) return { ok: false, message: blocked };
  const t = await getTranslations("promoCodes");
  const { count } = await tenantDb(organization.id).bookingPromoCode.updateMany({ where: { id: z.string().max(64).parse(id) }, data: { active } });
  refresh();
  return count ? { ok: true, message: active ? t("enabled") : t("disabled") } : { ok: false, message: t("error_not_found") };
}

/** Deletes an unused code; a used one has to be switched off (bookings keep their history). */
export async function deleteBookingPromoAction(id: string): Promise<ActionResult> {
  const { organization } = await requireAgency("agency.services");
  const blocked = await writeBlocked(organization.id);
  if (blocked) return { ok: false, message: blocked };
  const t = await getTranslations("promoCodes");
  try {
    await deleteBookingPromoCode(organization.id, z.string().max(64).parse(id));
    refresh();
    return { ok: true, message: t("deleted") };
  } catch (error) {
    return message(error);
  }
}

/** Staff put a code on a booking (or take it off) from the quote editor. */
export async function setBookingPromoOnBookingAction(bookingId: string, code: string | null): Promise<ActionResult> {
  const { organization } = await requireAgency("agency.quotes.send");
  const blocked = await writeBlocked(organization.id);
  if (blocked) return { ok: false, message: blocked };
  const t = await getTranslations("promoCodes");
  const id = z.string().max(64).parse(bookingId);
  try {
    if (code === null) {
      await detachBookingPromo(organization.id, id);
      revalidatePath("/[locale]/app/bookings/[code]", "page");
      return { ok: true, message: t("removedFromBooking") };
    }
    const promo = await attachBookingPromo(organization.id, id, z.string().max(40).parse(code), "staff");
    revalidatePath("/[locale]/app/bookings/[code]", "page");
    return { ok: true, message: t("addedToBooking", { code: promo.code }) };
  } catch (error) {
    return message(error);
  }
}
