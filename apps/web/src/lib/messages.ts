import "server-only";
import { type MessageChannel, prisma } from "@stagedesk/db";
import type { Viewer } from "./viewer";

/**
 * Which conversations of a booking the viewer may read and write: the agency
 * desk sees both, the assigned artist the artist one, the customer their own.
 * Bookings are looked up across agencies (a shared artist's gig lives at the
 * partner agency), so this check is the only gate.
 */
export async function messageAccess(viewer: Viewer & { role: NonNullable<Viewer["role"]> }, code: string) {
  const booking = await prisma.booking.findUnique({
    where: { trackingCode: code },
    select: {
      id: true,
      trackingCode: true,
      organizationId: true,
      customerId: true,
      eventType: true,
      eventDate: true,
      customer: { select: { name: true } },
      organization: { select: { name: true } },
      assignments: { where: { status: { in: ["pending", "accepted"] } }, select: { artist: { select: { userId: true, stageName: true } } } },
    },
  });
  if (!booking) return null;
  const channels: MessageChannel[] = [];
  if (viewer.organization?.id === booking.organizationId && viewer.permissions.includes("agency.bookings")) channels.push("customer", "artist");
  else {
    if (booking.assignments.some((a) => a.artist.userId === viewer.user.id)) channels.push("artist");
    if (booking.customerId === viewer.user.id) channels.push("customer");
  }
  return channels.length ? { booking, channels, isDesk: channels.length === 2 } : null;
}

/** Which conversations list a role sees on the messages page. */
export function conversationScope(viewer: Viewer & { role: NonNullable<Viewer["role"]> }) {
  if (viewer.organization && viewer.permissions.includes("agency.bookings")) return { userId: viewer.user.id, agencyId: viewer.organization.id };
  if (viewer.role === "artist") return { userId: viewer.user.id, artistUserId: viewer.user.id };
  return { userId: viewer.user.id, customerId: viewer.user.id };
}
