import { gigState, type GigState, isClosedGig, isOpenGigRequest, isUpcomingGig, todayInNetherlands } from "@stagedesk/core";
import { prisma } from "./client";

/**
 * An artist's assignments, across every agency they work for. This is an
 * explicit cross-agency read: it starts from the signed-in user's own artist
 * profiles, and only profiles at an agency they're still a member of count, so
 * removing someone from a team ends their view of its gigs.
 *
 * Open assignments are never limited: a busy diary must not push a request out
 * of sight. Only the history (declined, withdrawn, cancelled) is capped.
 */
const HISTORY = 30;

const gigSelect = {
  id: true,
  status: true,
  createdAt: true,
  shareBps: true,
  compensationType: true,
  fixedFeeCents: true,
  artist: { select: { stageName: true } },
  booking: {
    select: {
      trackingCode: true,
      status: true,
      eventType: true,
      eventDate: true,
      startTime: true,
      endTime: true,
      venueName: true,
      venueCity: true,
      guestCount: true,
      totalCents: true,
      currency: true,
      dos: true,
      donts: true,
      playlistUrl: true,
      organization: { select: { name: true } },
    },
  },
} as const;

const artistRoles = ["artist", "solo_artist"];
const ownProfile = (userId: string) => ({ userId, organization: { members: { some: { userId, role: { in: artistRoles } } } } });

/** Soonest first, with undated gigs up front: they need sorting out and mustn't sink below a long list. */
function byDate(a: { booking: { eventDate: Date | null } }, b: { booking: { eventDate: Date | null } }) {
  return (a.booking.eventDate?.getTime() ?? 0) - (b.booking.eventDate?.getTime() ?? 0);
}

export async function artistGigs(userId: string, now = new Date()) {
  const today = todayInNetherlands(now);
  const [open, closed] = await Promise.all([
    prisma.bookingAssignment.findMany({ where: { artist: ownProfile(userId), status: { in: ["pending", "accepted"] } }, select: gigSelect }),
    prisma.bookingAssignment.findMany({ where: { artist: ownProfile(userId), status: { in: ["declined", "withdrawn"] } }, select: gigSelect, orderBy: { createdAt: "desc" }, take: HISTORY }),
  ]);
  const classify = <T extends (typeof open)[number]>(row: T) => ({
    ...row,
    state: gigState({ assignmentStatus: row.status, bookingStatus: row.booking.status, eventDate: row.booking.eventDate?.toISOString().slice(0, 10) ?? null, createdAt: row.createdAt }, today, now) as GigState,
  });
  const all = open.map(classify).sort(byDate);
  return {
    requests: all.filter((g) => isOpenGigRequest(g.state)),
    upcoming: all.filter((g) => isUpcomingGig(g.state)),
    past: all.filter((g) => g.state === "past" || g.state === "completed").reverse(),
    closed: [...all.filter((g) => isClosedGig(g.state)), ...closed.map(classify)],
  };
}

/** The number for the badge: requests waiting for this artist's answer. */
export function pendingGigCount(userId: string) {
  return prisma.bookingAssignment.count({
    where: { artist: ownProfile(userId), status: "pending", booking: { status: { notIn: ["cancelled", "declined", "expired", "completed", "settled"] } } },
  });
}

/** Whether this user is an artist at an agency, seen from a membership where they aren't. */
export async function hasArtistProfileAt(userId: string, organizationIds: string[]) {
  if (organizationIds.length === 0) return false;
  return (await prisma.artist.count({ where: { userId, organizationId: { in: organizationIds } } })) > 0;
}

/** Whether an independent artist has a live gig from another agency (their own gigs are bookings in their own business). */
export async function hasGigsOutside(userId: string, soloOrganizationIds: string[]) {
  if (soloOrganizationIds.length === 0) return false;
  return (await prisma.bookingAssignment.count({ where: { artist: { userId, organizationId: { in: soloOrganizationIds } }, organizationId: { notIn: soloOrganizationIds }, status: { in: ["pending", "accepted"] } } })) > 0;
}
