import { mediaEmbed } from "@stagedesk/core";
import { currentArtistProfile } from "./artist-access";
import { prisma } from "./client";

/**
 * What an artist working for an agency (or for StageDesk's managed pool) may
 * change about themselves: how they're presented. Pay, sharing, whether they're
 * on the booking page and whether the profile is active stay with the agency.
 * An independent artist's own profile goes through the artist-profile page's
 * solo actions instead (it is also their business).
 */
export class ArtistSelfError extends Error {
  constructor(public code: "not_found" | "invalid" | "invalid_media", public detail?: string) {
    super(code);
  }
}

/** Their profiles at agencies and in the managed pool, newest agency first. Inactive ones are left out. */
export async function ownAgencyArtistProfiles(userId: string) {
  return prisma.artist.findMany({
    where: { ...ownAgencyProfile(userId), active: true },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      stageName: true,
      bio: true,
      genres: true,
      mediaLinks: true,
      photoUrl: true,
      organization: { select: { id: true, name: true, kind: true } },
    },
  });
}

/** Someone's own profile, at an agency or the managed pool (never a solo business), while they still hold the artist role there. */
function ownAgencyProfile(userId: string) {
  const own = currentArtistProfile(userId);
  return { ...own, organization: { ...own.organization, kind: { not: "solo" } } };
}

export interface OwnArtistProfileInput {
  stageName: string;
  bio: string;
  genres: string;
  mediaLinks: string;
}

export async function updateOwnArtistProfile(userId: string, artistId: string, input: OwnArtistProfileInput) {
  const stageName = input.stageName.trim();
  if (!stageName || stageName.length > 120 || input.bio.length > 5000 || input.genres.length > 500 || input.mediaLinks.length > 2000) throw new ArtistSelfError("invalid");
  const links = input.mediaLinks.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 3);
  const bad = links.find((l) => !mediaEmbed(l));
  if (bad) throw new ArtistSelfError("invalid_media", bad.slice(0, 80));
  const updated = await prisma.artist.updateMany({
    where: { id: artistId, ...ownAgencyProfile(userId), active: true },
    data: {
      stageName,
      bio: input.bio.trim() || null,
      genres: input.genres.split(",").map((g) => g.trim()).filter(Boolean).slice(0, 12),
      mediaLinks: links,
    },
  });
  if (updated.count !== 1) throw new ArtistSelfError("not_found");
}

/** The profile a photo may go on, or null; the caller stores the file and then calls setOwnArtistPhoto. */
export async function ownAgencyArtistProfile(userId: string, artistId: string) {
  return prisma.artist.findFirst({ where: { id: artistId, ...ownAgencyProfile(userId), active: true }, select: { id: true, organizationId: true, photoUrl: true } });
}

/** Puts the new photo on the profile; returns the old one for the caller to delete. */
export async function setOwnArtistPhoto(userId: string, artistId: string, url: string) {
  const artist = await ownAgencyArtistProfile(userId, artistId);
  if (!artist) throw new ArtistSelfError("not_found");
  await prisma.artist.updateMany({ where: { id: artist.id }, data: { photoUrl: url } });
  return artist.photoUrl;
}
