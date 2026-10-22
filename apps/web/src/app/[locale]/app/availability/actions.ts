"use server";

import type { ActionResult } from "@/lib/actions";
import { toggleUnavailable } from "@/lib/availability";
import { requireAgency } from "@/lib/viewer";

/** The signed-in artist blocks or frees one of their own dates. */
export async function toggleMyDateAction(date: string, unavailable: boolean): Promise<ActionResult> {
  const { viewer, organization, db } = await requireAgency("artist.availability");
  const artist = await db.artist.findFirst({ where: { userId: viewer.user.id }, select: { id: true } });
  if (!artist) return { ok: false };
  return toggleUnavailable(db, organization.id, artist.id, date, unavailable);
}
