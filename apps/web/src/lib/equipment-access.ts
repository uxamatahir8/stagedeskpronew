import "server-only";
import { notFound } from "next/navigation";
import { prisma, tenantDb } from "@stagedesk/db";
import { getViewer, requireViewer, viewerCan } from "@/lib/viewer";

/**
 * The only gate for a booking's equipment (its packing list, loading and
 * returns). Desk: the booking belongs to the viewer's active agency and they
 * may handle gig equipment. Artist: they're assigned to the booking (pending
 * or accepted, like the gig page); they may record loading and returns only
 * once they accepted and the booking's agency allows it. Works across
 * agencies for lent and shared artists, because it goes by the booking.
 */
export interface EquipmentAccess {
  mode: "desk" | "artist";
  organizationId: string;
  bookingId: string;
  trackingCode: string;
  userId: string;
  /** Record loading and returns. */
  canHandle: boolean;
  /** Change the packing list, finish check-in. Desk only. */
  canPlan: boolean;
  /** Override same-day conflicts and confirm losses: owners and admins. */
  canOverride: boolean;
  /** See serial numbers and notes. Desk only. */
  canSeePrivate: boolean;
}

export async function equipmentAccess(code: string, prefer: "desk" | "artist" = "desk"): Promise<EquipmentAccess | null> {
  const viewer = await getViewer();
  if (!viewer?.role) return null;
  const trackingCode = code.toUpperCase().slice(0, 16);

  const desk = async (): Promise<EquipmentAccess | null> => {
    if (!viewer.organization || !viewerCan(viewer, "agency.inventory.gigs")) return null;
    const booking = await tenantDb(viewer.organization.id).booking.findFirst({ where: { trackingCode }, select: { id: true } });
    if (!booking) return null;
    return {
      mode: "desk",
      organizationId: viewer.organization.id,
      bookingId: booking.id,
      trackingCode,
      userId: viewer.user.id,
      canHandle: true,
      canPlan: true,
      canOverride: viewerCan(viewer, "agency.inventory.admin"),
      canSeePrivate: true,
    };
  };

  const artist = async (): Promise<EquipmentAccess | null> => {
    if (!viewerCan(viewer, "artist.gigs")) return null;
    // Only an assignment for one of the signed-in artist's own profiles.
    const assignment = await prisma.bookingAssignment.findFirst({
      where: { artist: { userId: viewer.user.id }, booking: { trackingCode }, status: { in: ["pending", "accepted"] } },
      orderBy: { createdAt: "desc" },
      select: { status: true, booking: { select: { id: true, organizationId: true, organization: { select: { artistsHandleEquipment: true } } } } },
    });
    if (!assignment) return null;
    return {
      mode: "artist",
      organizationId: assignment.booking.organizationId,
      bookingId: assignment.booking.id,
      trackingCode,
      userId: viewer.user.id,
      canHandle: assignment.status === "accepted" && assignment.booking.organization.artistsHandleEquipment,
      canPlan: false,
      canOverride: false,
      canSeePrivate: false,
    };
  };

  return prefer === "desk" ? ((await desk()) ?? (await artist())) : ((await artist()) ?? (await desk()));
}

/** For pages: the access, or a 404 for anyone who has none. */
export async function requireEquipmentAccess(code: string, prefer: "desk" | "artist") {
  await requireViewer();
  const access = await equipmentAccess(code, prefer);
  if (!access || access.mode !== prefer) notFound();
  return access;
}

/** The line must belong to the booking the access was granted for. */
export async function lineOfBooking(access: EquipmentAccess, lineId: string) {
  const line = await tenantDb(access.organizationId).bookingEquipment.findFirst({ where: { id: lineId, bookingId: access.bookingId }, select: { id: true, itemId: true } });
  return line;
}
