import { audit } from "./audit";
import { prisma } from "./client";

/**
 * An artist profile is what an agency books; an account is who can sign in and
 * answer. They aren't the same thing, and a request to a profile nobody can
 * reach would just sit there unseen, so assigning needs to know the difference.
 *
 * - no_account: the profile has no user linked.
 * - not_member: the user was removed from the artist's agency.
 * - disabled: the account has been disabled.
 * - inactive: the agency or support deactivated the profile.
 * - setup_pending: an account made for them that has never had a way to sign in;
 *   they can be assigned, because the request email carries a first-password link.
 * - active: can sign in.
 */
export const artistAccountStates = ["no_account", "not_member", "disabled", "inactive", "setup_pending", "active"] as const;
export type ArtistAccountState = (typeof artistAccountStates)[number];

export const artistCanBeAssigned = (state: ArtistAccountState) => state === "active" || state === "setup_pending";

const accountSelect = {
  id: true,
  organizationId: true,
  active: true,
  user: {
    select: {
      id: true,
      email: true,
      disabledAt: true,
      accounts: { select: { id: true }, take: 1 },
      members: { select: { organizationId: true, role: true } },
    },
  },
} as const;

type ArtistWithAccount = {
  organizationId: string;
  active: boolean;
  user: { disabledAt: Date | null; accounts: { id: string }[]; members: { organizationId: string; role: string }[] } | null;
};

/** Only an artist at the profile's agency has the pages to see a request. */
export function artistStateOf(artist: ArtistWithAccount): ArtistAccountState {
  if (!artist.user) return "no_account";
  if (artist.user.disabledAt) return "disabled";
  if (!artist.user.members.some((m) => m.organizationId === artist.organizationId && (m.role === "artist" || m.role === "solo_artist"))) return "not_member";
  if (!artist.active) return "inactive";
  return artist.user.accounts.length > 0 ? "active" : "setup_pending";
}

export async function artistAccountState(artistId: string): Promise<ArtistAccountState> {
  const artist = await prisma.artist.findUnique({ where: { id: artistId }, select: accountSelect });
  return artist ? artistStateOf(artist) : "no_account";
}

/**
 * Someone left an agency's team: their account no longer answers for its artist
 * profiles, so they stop seeing its gigs, messages and earnings, and the agency
 * sees the profile needs a login again. History on the profile stays.
 */
export async function unlinkRemovedMember(organizationId: string, userId: string) {
  const profiles = await prisma.artist.findMany({ where: { organizationId, userId }, select: { id: true } });
  if (profiles.length === 0) return 0;
  await prisma.artist.updateMany({ where: { organizationId, userId }, data: { userId: null } });
  for (const p of profiles) await audit({ actorId: null, action: "artist.unlink", agencyId: organizationId, targetType: "artist", targetId: p.id, data: { userId, reason: "removed from the team" } });
  return profiles.length;
}

/** The account state of many artists at once, by artist id, for lists and pickers. */
export async function artistAccountStatesOf(artistIds: string[]): Promise<Map<string, ArtistAccountState>> {
  if (artistIds.length === 0) return new Map();
  const rows = await prisma.artist.findMany({ where: { id: { in: artistIds } }, select: accountSelect });
  return new Map(rows.map((a) => [a.id, artistStateOf(a)]));
}
