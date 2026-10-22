import "server-only";
import { randomUUID } from "node:crypto";
import { getTranslations } from "next-intl/server";
import { type TenantDb, toDateOnly } from "@stagedesk/db";
import type { ActionResult } from "./actions";

/**
 * Blocks or frees a date for an artist of this agency. Used by the agency's
 * artist page and the artist's own availability page; callers check access.
 */
export async function toggleUnavailable(
  db: TenantDb,
  organizationId: string,
  artistId: string,
  date: string,
  unavailable: boolean,
): Promise<ActionResult> {
  const t = await getTranslations("artists");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false };
  const artist = await db.artist.findFirst({ where: { id: artistId }, select: { id: true } });
  if (!artist) return { ok: false };
  const day = toDateOnly(date);
  if (unavailable) {
    const exists = await db.artistUnavailability.count({ where: { artistId, date: day } });
    if (!exists) await db.artistUnavailability.create({ data: { id: randomUUID(), artistId, date: day, organizationId } });
    return { ok: true, message: t("dateAdded") };
  }
  await db.artistUnavailability.deleteMany({ where: { artistId, date: day } });
  return { ok: true, message: t("dateRemoved") };
}
