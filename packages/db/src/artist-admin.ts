import { artistHoldStatuses } from "@stagedesk/core";
import { randomUUID } from "node:crypto";
import { auditTx, type AuditInput } from "./audit";
import { withdrawArtist } from "./bookings";
import { prisma } from "./client";
import type { Prisma } from "./generated/prisma/client";
import { createSoloArtist } from "./solo";

/**
 * Platform support for artists an agency can't sort out itself: see
 * everything about one artist, take them off upcoming gigs, deactivate,
 * revoke sharing, fix the linked account, and delete only what has no
 * history. Each change needs a reason and is audited; bookings, payments and
 * ledger rows are never removed (artists with history are deactivated).
 */

export class ArtistAdminError extends Error {
  constructor(readonly code: "not_found" | "has_history" | "has_upcoming" | "user_not_found" | "user_taken" | "user_not_allowed" | "reason_required" | "already_independent" | "same_place") {
    super(`Artist admin: ${code}`);
    this.name = "ArtistAdminError";
  }
}

export const PLATFORM_ARTISTS_SLUG = "stagedesk-platform-artists";

/**
 * StageDesk's own business for the artists it manages and the bookings it
 * takes itself (platform bookings). Made the first time it's needed.
 */
export async function platformArtistsOrganization() {
  return prisma.organization.upsert({
    where: { slug: PLATFORM_ARTISTS_SLUG },
    update: {},
    create: { id: randomUUID(), name: "StageDesk managed artists", slug: PLATFORM_ARTISTS_SLUG, kind: "platform", bookingPageEnabled: false, acceptsLeads: false },
    select: { id: true, name: true },
  });
}

// Open requests and gigs, including ones asked for while the quote is still out.
const upcomingStatuses: string[] = [...artistHoldStatuses];

/** Everything support needs to see about one artist. */
export async function artistAdminDetail(artistId: string) {
  const artist = await prisma.artist.findUnique({
    where: { id: artistId },
    include: {
      organization: { select: { id: true, name: true, slug: true, kind: true, suspendedAt: true } },
      user: { select: { id: true, name: true, email: true, emailVerified: true, disabledAt: true, platformRole: true, _count: { select: { accounts: true } } } },
      shares: { include: { partnerOrganization: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" } },
      connectedAccount: { select: { payoutsEnabled: true } },
    },
  });
  if (!artist) return null;
  const [active, history, ledger, reviews, requests] = await Promise.all([
    prisma.bookingAssignment.findMany({
      where: { artistId, status: { in: ["pending", "accepted"] } },
      include: { booking: { select: { id: true, trackingCode: true, status: true, eventDate: true, organizationId: true, organization: { select: { name: true } } } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.bookingAssignment.count({ where: { artistId } }),
    prisma.ledgerEntry.count({ where: { artistId } }),
    prisma.review.count({ where: { artistId } }),
    prisma.artistRequest.count({ where: { artistId } }),
  ]);
  return {
    artist,
    active: active.filter((a) => upcomingStatuses.includes(a.booking.status)),
    history: { assignments: history, ledger, reviews, requests },
    deletable: history + ledger + reviews + requests === 0,
  };
}

async function auditArtist(input: Omit<AuditInput, "targetType">) {
  await prisma.$transaction((tx) => auditTx(tx, { ...input, targetType: "artist" }));
}

function needReason(reason: string | null | undefined) {
  const r = reason?.trim();
  if (!r) throw new ArtistAdminError("reason_required");
  return r.slice(0, 500);
}

/** Takes the artist off every upcoming gig, at whichever agency it is; the agencies are told. */
export async function withdrawArtistEverywhere(artistId: string, actorId: string, reason: string, now = new Date()) {
  const why = needReason(reason);
  const active = await prisma.bookingAssignment.findMany({
    where: { artistId, status: { in: ["pending", "accepted"] }, booking: { status: { in: upcomingStatuses } } },
    select: { bookingId: true, organizationId: true },
  });
  const done: string[] = [];
  for (const a of active) done.push(...(await withdrawArtist(a.organizationId, a.bookingId, artistId, actorId, why, now)));
  await auditArtist({ actorId, action: "artist.withdraw", targetId: artistId, data: { assignments: done.length, reason: why } });
  return done.length;
}

/**
 * Deactivates an artist: off the booking page, not lendable, not bookable.
 * Refused while they're on upcoming gigs unless `withdraw` also takes them off.
 */
export async function deactivateArtist(artistId: string, actorId: string, reason: string, opts: { withdraw?: boolean } = {}) {
  const why = needReason(reason);
  const artist = await prisma.artist.findUnique({ where: { id: artistId }, select: { id: true, organizationId: true } });
  if (!artist) throw new ArtistAdminError("not_found");
  const upcoming = await prisma.bookingAssignment.count({ where: { artistId, status: { in: ["pending", "accepted"] }, booking: { status: { in: upcomingStatuses } } } });
  if (upcoming > 0 && !opts.withdraw) throw new ArtistAdminError("has_upcoming");
  if (upcoming > 0) await withdrawArtistEverywhere(artistId, actorId, why);
  await prisma.$transaction(async (tx) => {
    await tx.artist.update({ where: { id: artistId }, data: { active: false, showOnBookingPage: false, lendable: false } });
    await auditTx(tx, { actorId, action: "artist.deactivate", agencyId: artist.organizationId, targetType: "artist", targetId: artistId, data: { reason: why } });
  });
}

export async function reactivateArtist(artistId: string, actorId: string, reason: string) {
  const why = needReason(reason);
  const artist = await prisma.artist.findUnique({ where: { id: artistId }, select: { organizationId: true } });
  if (!artist) throw new ArtistAdminError("not_found");
  await prisma.$transaction(async (tx) => {
    await tx.artist.update({ where: { id: artistId }, data: { active: true } });
    await auditTx(tx, { actorId, action: "artist.reactivate", agencyId: artist.organizationId, targetType: "artist", targetId: artistId, data: { reason: why } });
  });
}

/** Ends every share of the artist with partner agencies (gigs already assigned there are left to withdrawArtistEverywhere). */
export async function revokeArtistShares(artistId: string, actorId: string, reason: string) {
  const why = needReason(reason);
  const count = await prisma.$transaction(async (tx) => {
    const { count } = await tx.artistShare.updateMany({ where: { artistId, status: { in: ["pending", "accepted"] } }, data: { status: "revoked", respondedAt: new Date() } });
    await auditTx(tx, { actorId, action: "artist.revoke_shares", targetType: "artist", targetId: artistId, data: { shares: count, reason: why } });
    return count;
  });
  return count;
}

/**
 * Removes the link between the artist profile and a user account: the user
 * no longer sees the profile's gigs or earnings. Their artist membership of
 * the agency goes too when no other artist profile there uses it. The
 * account itself is kept.
 */
export async function unlinkArtistUser(artistId: string, actorId: string, reason: string) {
  const why = needReason(reason);
  await prisma.$transaction(async (tx) => {
    const artist = await tx.artist.findUnique({ where: { id: artistId }, select: { userId: true, organizationId: true } });
    if (!artist) throw new ArtistAdminError("not_found");
    if (!artist.userId) return;
    await tx.artist.update({ where: { id: artistId }, data: { userId: null } });
    const others = await tx.artist.count({ where: { organizationId: artist.organizationId, userId: artist.userId } });
    if (others === 0) await tx.member.deleteMany({ where: { organizationId: artist.organizationId, userId: artist.userId, role: "artist" } });
    await auditTx(tx, { actorId, action: "artist.unlink", agencyId: artist.organizationId, targetType: "artist", targetId: artistId, data: { userId: artist.userId, reason: why } });
  });
}

/**
 * Links the profile to the right account (fixing a wrong link): an existing
 * user who isn't a platform admin, isn't on the agency's team and has no
 * other profile at this agency. They become an artist member if needed.
 */
export async function relinkArtistUser(artistId: string, email: string, actorId: string, reason: string) {
  const why = needReason(reason);
  await prisma.$transaction(async (tx) => {
    const artist = await tx.artist.findUnique({ where: { id: artistId }, select: { userId: true, organizationId: true } });
    if (!artist) throw new ArtistAdminError("not_found");
    const user = await tx.user.findUnique({ where: { email: email.trim().toLowerCase() }, select: { id: true, platformRole: true } });
    if (!user) throw new ArtistAdminError("user_not_found");
    if (user.platformRole === "platform_admin") throw new ArtistAdminError("user_not_allowed");
    const membership = await tx.member.findFirst({ where: { organizationId: artist.organizationId, userId: user.id }, select: { role: true } });
    if (membership && membership.role !== "artist") throw new ArtistAdminError("user_not_allowed");
    const taken = await tx.artist.findFirst({ where: { organizationId: artist.organizationId, userId: user.id, id: { not: artistId } }, select: { id: true } });
    if (taken) throw new ArtistAdminError("user_taken");
    await tx.artist.update({ where: { id: artistId }, data: { userId: user.id } });
    if (!membership) await tx.member.create({ data: { id: randomUUID(), organizationId: artist.organizationId, userId: user.id, role: "artist" } });
    // The previous account loses the membership when nothing else uses it.
    if (artist.userId && artist.userId !== user.id) {
      const others = await tx.artist.count({ where: { organizationId: artist.organizationId, userId: artist.userId } });
      if (others === 0) await tx.member.deleteMany({ where: { organizationId: artist.organizationId, userId: artist.userId, role: "artist" } });
    }
    await auditTx(tx, { actorId, action: "artist.relink", agencyId: artist.organizationId, targetType: "artist", targetId: artistId, data: { from: artist.userId, to: user.id, reason: why } });
  });
}

/**
 * Deletes an artist profile for good, only when nothing refers to it: no
 * gigs (also past or withdrawn), payouts, reviews or lending requests.
 * Anything with history is deactivated instead.
 */
export async function deleteArtistProfile(artistId: string, actorId: string, reason: string) {
  const why = needReason(reason);
  const detail = await artistAdminDetail(artistId);
  if (!detail) throw new ArtistAdminError("not_found");
  if (!detail.deletable) throw new ArtistAdminError("has_history");
  await prisma.$transaction(async (tx) => {
    await auditTx(tx, { actorId, action: "artist.delete", agencyId: detail.artist.organizationId, targetType: "artist", targetId: artistId, data: { stageName: detail.artist.stageName, userId: detail.artist.userId, reason: why } });
    await tx.connectedAccount.deleteMany({ where: { artistId } });
    await tx.artist.delete({ where: { id: artistId } });
    if (detail.artist.userId) {
      const others = await tx.artist.count({ where: { organizationId: detail.artist.organizationId, userId: detail.artist.userId } });
      if (others === 0) await tx.member.deleteMany({ where: { organizationId: detail.artist.organizationId, userId: detail.artist.userId, role: "artist" } });
    }
  });
}

/**
 * Turns an agency's (or the managed pool's) artist into an independent artist:
 * the same account gets its own business, starting from this profile (stage
 * name, bio, genres, media; the caller passes a copy of the photo). Bookings,
 * payouts and reviews stay with the agency's profile.
 *
 * `leaveAgency`: the artist stops working for the agency too. Their profile
 * there is deactivated and unlinked (history kept) and their artist membership
 * ends. Upcoming gigs block that unless `withdraw` takes them off (the agencies
 * are told). Without it they keep working for the agency as well.
 */
export async function makeArtistIndependent(
  artistId: string,
  actorId: string,
  reason: string,
  opts: { leaveAgency: boolean; withdraw?: boolean; photoUrl?: string | null },
) {
  const why = needReason(reason);
  const artist = await prisma.artist.findUnique({
    where: { id: artistId },
    select: { id: true, userId: true, stageName: true, bio: true, genres: true, mediaLinks: true, organizationId: true, organization: { select: { kind: true, city: true } }, user: { select: { platformRole: true, disabledAt: true } } },
  });
  if (!artist) throw new ArtistAdminError("not_found");
  if (!artist.userId || !artist.user) throw new ArtistAdminError("user_not_found");
  if (artist.organization.kind === "solo") throw new ArtistAdminError("already_independent");
  if (artist.user.platformRole === "platform_admin" || artist.user.disabledAt) throw new ArtistAdminError("user_not_allowed");
  if (await prisma.member.count({ where: { userId: artist.userId, role: "solo_artist" } })) throw new ArtistAdminError("already_independent");
  if (opts.leaveAgency) {
    const upcoming = await prisma.bookingAssignment.count({ where: { artistId, status: { in: ["pending", "accepted"] }, booking: { status: { in: upcomingStatuses } } } });
    if (upcoming > 0 && !opts.withdraw) throw new ArtistAdminError("has_upcoming");
  }

  const solo = await createSoloArtist(artist.userId, {
    stageName: artist.stageName,
    city: artist.organization.city,
    genres: Array.isArray(artist.genres) ? (artist.genres as string[]) : [],
    bio: artist.bio,
    mediaLinks: Array.isArray(artist.mediaLinks) ? (artist.mediaLinks as string[]) : [],
    photoUrl: opts.photoUrl ?? null,
  });
  if (opts.leaveAgency) await leaveOrganization(artistId, artist.organizationId, artist.userId, actorId, why);
  await auditArtist({ actorId, action: "artist.make_independent", agencyId: artist.organizationId, targetId: artistId, data: { organizationId: solo.id, leftAgency: opts.leaveAgency, reason: why } });
  return solo;
}

/**
 * The person stops working through this profile: off upcoming gigs (callers
 * check `has_upcoming` first), profile deactivated and unlinked with its
 * history kept, sharing ended, and their artist membership there removed when
 * no other profile at that agency uses it.
 */
async function leaveOrganization(artistId: string, organizationId: string, userId: string, actorId: string, why: string) {
  await withdrawArtistEverywhere(artistId, actorId, why);
  await prisma.$transaction(async (tx) => {
    await tx.artist.update({ where: { id: artistId }, data: { active: false, showOnBookingPage: false, lendable: false, userId: null } });
    await tx.artistShare.updateMany({ where: { artistId, status: { in: ["pending", "accepted"] } }, data: { status: "revoked", respondedAt: new Date() } });
    const others = await tx.artist.count({ where: { organizationId, userId } });
    if (others === 0) await tx.member.deleteMany({ where: { organizationId, userId, role: "artist" } });
  });
}

/**
 * Changes where an artist works: to an agency or StageDesk's managed pool
 * (`organizationId`), or to their own independent business. The same account
 * gets a profile there, starting from this one; pay is copied when the
 * currency allows, otherwise it starts as the default percentage.
 *
 * `keepCurrent`: they keep this profile too (working for both). Otherwise they
 * leave it as in makeArtistIndependent. An independent artist's own business
 * is never closed this way: moving them to an agency always keeps it.
 */
export async function moveArtist(
  artistId: string,
  target: { kind: "independent" } | { kind: "organization"; organizationId: string },
  actorId: string,
  reason: string,
  opts: { keepCurrent: boolean; withdraw?: boolean; photoUrl?: string | null },
) {
  if (target.kind === "independent") return makeArtistIndependent(artistId, actorId, reason, { leaveAgency: !opts.keepCurrent, withdraw: opts.withdraw, photoUrl: opts.photoUrl });
  const why = needReason(reason);
  const artist = await prisma.artist.findUnique({
    where: { id: artistId },
    select: {
      id: true,
      userId: true,
      stageName: true,
      bio: true,
      genres: true,
      mediaLinks: true,
      headline: true,
      compensationType: true,
      defaultShareBps: true,
      defaultFixedFeeCents: true,
      organizationId: true,
      organization: { select: { kind: true, currency: true } },
      user: { select: { platformRole: true, disabledAt: true } },
    },
  });
  if (!artist) throw new ArtistAdminError("not_found");
  if (!artist.userId || !artist.user) throw new ArtistAdminError("user_not_found");
  if (artist.user.platformRole === "platform_admin" || artist.user.disabledAt) throw new ArtistAdminError("user_not_allowed");
  if (artist.organizationId === target.organizationId) throw new ArtistAdminError("same_place");
  const destination = await prisma.organization.findFirst({ where: { id: target.organizationId, kind: { in: ["agency", "platform"] } }, select: { id: true, currency: true } });
  if (!destination) throw new ArtistAdminError("not_found");
  const userId = artist.userId;
  const leave = !opts.keepCurrent && artist.organization.kind !== "solo";
  if (leave) {
    const upcoming = await prisma.bookingAssignment.count({ where: { artistId, status: { in: ["pending", "accepted"] }, booking: { status: { in: upcomingStatuses } } } });
    if (upcoming > 0 && !opts.withdraw) throw new ArtistAdminError("has_upcoming");
  }
  const sameCurrency = destination.currency === artist.organization.currency;
  const pay =
    artist.compensationType === "fixed" && artist.defaultFixedFeeCents !== null && sameCurrency
      ? { compensationType: "fixed", defaultFixedFeeCents: artist.defaultFixedFeeCents, defaultShareBps: 0 }
      : // An independent artist's own profile has a 0% share (they own the business); an agency needs a real default.
        { compensationType: "percentage", defaultFixedFeeCents: null, defaultShareBps: artist.organization.kind === "solo" || artist.compensationType === "fixed" ? 4_000 : artist.defaultShareBps };

  const created = await prisma.$transaction(async (tx) => {
    const membership = await tx.member.findFirst({ where: { organizationId: destination.id, userId }, select: { role: true } });
    if (membership && membership.role !== "artist") throw new ArtistAdminError("user_not_allowed");
    if (await tx.artist.findFirst({ where: { organizationId: destination.id, userId }, select: { id: true } })) throw new ArtistAdminError("user_taken");
    if (!membership) await tx.member.create({ data: { id: randomUUID(), organizationId: destination.id, userId, role: "artist" } });
    return tx.artist.create({
      data: {
        id: randomUUID(),
        organizationId: destination.id,
        userId,
        stageName: artist.stageName,
        bio: artist.bio,
        genres: (artist.genres ?? []) as Prisma.InputJsonValue,
        mediaLinks: (artist.mediaLinks ?? []) as Prisma.InputJsonValue,
        photoUrl: opts.photoUrl ?? null,
        ...pay,
      },
    });
  });
  if (leave) await leaveOrganization(artistId, artist.organizationId, userId, actorId, why);
  await auditArtist({ actorId, action: "artist.move", agencyId: destination.id, targetId: created.id, data: { from: artistId, fromOrganizationId: artist.organizationId, left: leave, reason: why } });
  return created;
}
