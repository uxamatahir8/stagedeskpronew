import { prisma } from "./client";
import { tenantDb } from "./tenant";

/**
 * Who may do what with one booking's equipment (packing list, loading,
 * check-in). Desk: the booking belongs to the person's active agency and they
 * may handle gig equipment. Artist: they're assigned to the booking (pending
 * or accepted, like the gig page); they may record loading and returns only
 * once accepted and when the booking's agency allows it. Goes by the booking,
 * so lent and shared artists from other agencies work too.
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
  /** Override same-day conflicts and confirm losses: agency.inventory.admin. */
  canOverride: boolean;
  /** See serial numbers and notes. Desk only. */
  canSeePrivate: boolean;
}

export interface EquipmentViewer {
  userId: string;
  /** The person's active agency, if any. */
  organizationId: string | null;
  permissions: readonly string[];
}

export async function resolveEquipmentAccess(viewer: EquipmentViewer, code: string, prefer: "desk" | "artist" = "desk"): Promise<EquipmentAccess | null> {
  const trackingCode = code.toUpperCase().slice(0, 16);

  const desk = async (): Promise<EquipmentAccess | null> => {
    if (!viewer.organizationId || !viewer.permissions.includes("agency.inventory.gigs")) return null;
    const booking = await tenantDb(viewer.organizationId).booking.findFirst({ where: { trackingCode }, select: { id: true } });
    if (!booking) return null;
    return {
      mode: "desk",
      organizationId: viewer.organizationId,
      bookingId: booking.id,
      trackingCode,
      userId: viewer.userId,
      canHandle: true,
      canPlan: true,
      canOverride: viewer.permissions.includes("agency.inventory.admin"),
      canSeePrivate: true,
    };
  };

  const artist = async (): Promise<EquipmentAccess | null> => {
    if (!viewer.permissions.includes("artist.gigs")) return null;
    // Only an assignment for one of the person's own artist profiles.
    const assignment = await prisma.bookingAssignment.findFirst({
      where: { artist: { userId: viewer.userId }, booking: { trackingCode }, status: { in: ["pending", "accepted"] } },
      orderBy: { createdAt: "desc" },
      select: { status: true, booking: { select: { id: true, organizationId: true, organization: { select: { artistsHandleEquipment: true } } } } },
    });
    if (!assignment) return null;
    return {
      mode: "artist",
      organizationId: assignment.booking.organizationId,
      bookingId: assignment.booking.id,
      trackingCode,
      userId: viewer.userId,
      canHandle: assignment.status === "accepted" && assignment.booking.organization.artistsHandleEquipment,
      canPlan: false,
      canOverride: false,
      canSeePrivate: false,
    };
  };

  return prefer === "desk" ? ((await desk()) ?? (await artist())) : ((await artist()) ?? (await desk()));
}

/** The line, if it belongs to the booking the access was granted for. */
export async function lineOfBooking(access: EquipmentAccess, lineId: string) {
  return tenantDb(access.organizationId).bookingEquipment.findFirst({ where: { id: lineId, bookingId: access.bookingId }, select: { id: true, itemId: true } });
}
