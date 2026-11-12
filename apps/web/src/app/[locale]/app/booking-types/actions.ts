"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { audit, BookingTypeError, deletePlatformBookingType, saveOrganizationBookingType, savePlatformBookingType, type BookingTypeInput } from "@stagedesk/db";
import type { ActionResult } from "@/lib/actions";
import { requirePermission } from "@/lib/viewer";

const refresh = () => revalidatePath("/[locale]/app/booking-types", "page");

async function failure(error: unknown): Promise<ActionResult> {
  if (error instanceof BookingTypeError) return { ok: false, message: (await getTranslations("bookingTypesAdmin"))(`error_${error.code}`) };
  throw error;
}

export async function saveBookingTypeAction(id: string | null, input: BookingTypeInput): Promise<ActionResult> {
  const viewer = await requirePermission("agency.booking-types");
  if (!viewer.organization) return { ok: false };
  try {
    const row = await saveOrganizationBookingType(viewer.organization.id, viewer.user.id, id, input);
    await audit({ actorId: viewer.user.id, agencyId: viewer.organization.id, action: id ? "booking_type.update" : "booking_type.create", targetType: "booking_type", targetId: row.id, data: { key: row.key, active: row.active } });
    refresh();
    return { ok: true, message: (await getTranslations("bookingTypesAdmin"))("saved") };
  } catch (error) { return failure(error); }
}

export async function savePlatformBookingTypeAction(id: string | null, input: BookingTypeInput): Promise<ActionResult> {
  const viewer = await requirePermission("platform.settings");
  try {
    const row = await savePlatformBookingType(viewer.user.id, id, input);
    await audit({ actorId: viewer.user.id, action: id ? "booking_type.update" : "booking_type.create", targetType: "booking_type", targetId: row.id, data: { key: row.key, active: row.active } });
    refresh();
    return { ok: true, message: (await getTranslations("bookingTypesAdmin"))("saved") };
  } catch (error) { return failure(error); }
}

export async function deletePlatformBookingTypeAction(id: string): Promise<ActionResult> {
  const viewer = await requirePermission("platform.settings");
  try {
    await deletePlatformBookingType(id);
    await audit({ actorId: viewer.user.id, action: "booking_type.delete", targetType: "booking_type", targetId: id });
    refresh();
    return { ok: true, message: (await getTranslations("bookingTypesAdmin"))("deleted") };
  } catch (error) { return failure(error); }
}
