import { artistCanBeAssigned, artistStateOf } from "./artist-accounts";
import { prisma } from "./client";

/**
 * Who counts as the artist behind a profile, for everything an artist reads or
 * does: dashboard, gigs, answering, equipment, messages, earnings. This is the
 * one policy; the pages and actions use these conditions instead of writing
 * their own. The active agency plays no part, so someone working for several
 * agencies sees all their gigs, and a shared artist sees a partner's booking.
 *
 * A profile counts only while its account isn't disabled and holds an artist
 * role at the profile's own agency. Moving someone to staff or removing them
 * therefore ends their access to that agency's gigs, also when they're still an
 * artist somewhere else. Records stay: only the access goes.
 */

export const artistRoles = ["artist", "solo_artist"];
export const openAssignmentStatuses = ["pending", "accepted"];

/** The person's own profiles: what they may look back on (earnings, past gigs). */
export const currentArtistProfile = (userId: string) => ({
  userId,
  user: { disabledAt: null },
  organization: { members: { some: { userId, role: { in: artistRoles } } } },
});

/** Profiles that can work: also not deactivated. Needed to see or act on an open gig. */
export const workingArtistProfile = (userId: string) => ({ ...currentArtistProfile(userId), active: true });

/** Open assignments this person may read and act on. */
export const liveAssignmentOf = (userId: string) => ({ artist: workingArtistProfile(userId), status: { in: openAssignmentStatuses } });

/** Their open assignment on a booking, by its public code. */
export const liveAssignmentOnBooking = (userId: string, trackingCode: string) => ({ ...liveAssignmentOf(userId), booking: { trackingCode: trackingCode.toUpperCase() } });

export async function isLiveArtistOnBooking(userId: string, bookingId: string) {
  return (await prisma.bookingAssignment.count({ where: { ...liveAssignmentOf(userId), bookingId } })) > 0;
}

/** Ids of the person's own profiles, for reading their payouts. */
export async function currentArtistIds(userId: string) {
  return (await prisma.artist.findMany({ where: currentArtistProfile(userId), select: { id: true } })).map((a) => a.id);
}

/** Accounts that should hear about a booking's open assignment: never one who has lost access to it. */
export async function reachableArtistUserIds(bookingId: string) {
  const rows = await prisma.bookingAssignment.findMany({
    where: { bookingId, status: { in: openAssignmentStatuses } },
    orderBy: { createdAt: "desc" },
    select: {
      artist: {
        select: {
          organizationId: true,
          active: true,
          userId: true,
          user: { select: { disabledAt: true, accounts: { select: { id: true }, take: 1 }, members: { select: { organizationId: true, role: true } } } },
        },
      },
    },
  });
  return rows.filter((r) => artistCanBeAssigned(artistStateOf(r.artist))).map((r) => r.artist.userId!);
}
