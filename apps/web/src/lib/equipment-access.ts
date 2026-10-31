import "server-only";
import { notFound } from "next/navigation";
import { type EquipmentAccess, lineOfBooking, resolveEquipmentAccess } from "@stagedesk/db";
import { getViewer, requireViewer } from "@/lib/viewer";

/**
 * The only gate for a booking's equipment, for the signed-in person. The
 * rules live in packages/db (resolveEquipmentAccess) where they're tested
 * against the database; this supplies the viewer.
 */
export type { EquipmentAccess };
export { lineOfBooking };

export async function equipmentAccess(code: string, prefer: "desk" | "artist" = "desk"): Promise<EquipmentAccess | null> {
  const viewer = await getViewer();
  if (!viewer?.role) return null;
  return resolveEquipmentAccess({ userId: viewer.user.id, organizationId: viewer.organization?.id ?? null, permissions: viewer.permissions }, code, prefer);
}

/** For pages: the access, or a 404 for anyone who has none. */
export async function requireEquipmentAccess(code: string, prefer: "desk" | "artist") {
  await requireViewer();
  const access = await equipmentAccess(code, prefer);
  if (!access || access.mode !== prefer) notFound();
  return access;
}
