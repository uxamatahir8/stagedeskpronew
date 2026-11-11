import { randomUUID } from "node:crypto";
import { freeSlug } from "./agencies";
import { prisma } from "./client";

export class SoloArtistError extends Error {
  constructor(readonly code: "already_independent" | "not_allowed" | "invalid") {
    super(`Independent artist: ${code}`);
    this.name = "SoloArtistError";
  }
}

/**
 * An independent artist's own business: one organization of kind "solo",
 * the artist as its only member (role solo_artist), and their artist profile
 * in it, so bookings, quotes, payments and the calendar work as for agencies.
 */
export async function createSoloArtist(
  userId: string,
  input: { stageName: string; city: string | null; genres: string[]; bio?: string | null; mediaLinks?: string[]; photoUrl?: string | null },
) {
  const organizationId = randomUUID();
  const slug = await freeSlug(input.stageName);
  await prisma.$transaction(async (tx) => {
    // One independent business per person (checked under the user row's lock, so two requests can't both create one).
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
    if (await tx.member.count({ where: { userId, role: "solo_artist" } })) throw new SoloArtistError("already_independent");
    await tx.organization.create({ data: { id: organizationId, name: input.stageName.trim(), slug, city: input.city, kind: "solo", logo: input.photoUrl ?? null } });
    await tx.member.create({ data: { id: randomUUID(), organizationId, userId, role: "solo_artist" } });
    await tx.artist.create({
      data: {
        id: randomUUID(),
        organizationId,
        userId,
        stageName: input.stageName.trim(),
        genres: input.genres.slice(0, 12),
        defaultShareBps: 0,
        showOnBookingPage: true,
        bio: input.bio ?? null,
        mediaLinks: input.mediaLinks ?? [],
        photoUrl: input.photoUrl ?? null,
      },
    });
  });
  return prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
}

/**
 * A platform admin sets up an independent artist for someone: a new account
 * (no password; the web action emails a setup link) or an existing one that
 * isn't a platform admin and has no independent business yet.
 */
export async function createSoloArtistForPerson(input: { name: string; email: string; stageName: string; city: string | null; genres: string[]; locale: "nl" | "en" }) {
  const email = input.email.trim().toLowerCase();
  const stageName = input.stageName.trim();
  if (!stageName || stageName.length > 120 || !/^\S+@\S+\.\S+$/.test(email) || email.length > 191) throw new SoloArtistError("invalid");
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true, email: true, platformRole: true, disabledAt: true } });
  if (existing && (existing.platformRole === "platform_admin" || existing.disabledAt)) throw new SoloArtistError("not_allowed");
  const user =
    existing ??
    (await prisma.user.create({ data: { id: randomUUID(), name: input.name.trim().slice(0, 191) || stageName, email, locale: input.locale }, select: { id: true, name: true, email: true, platformRole: true, disabledAt: true } }));
  try {
    const organization = await createSoloArtist(user.id, { stageName, city: input.city?.trim() || null, genres: input.genres });
    return { organization, user: { id: user.id, name: user.name, email: user.email }, newUser: !existing };
  } catch (error) {
    // Don't leave behind an account made only for this.
    if (!existing) await prisma.user.deleteMany({ where: { id: user.id } });
    throw error;
  }
}

/** The artist profile inside a solo business (null for agencies). */
export async function soloArtist(organizationId: string) {
  return prisma.artist.findFirst({ where: { organizationId, organization: { kind: "solo" }, userId: { not: null } } });
}

/**
 * Independent artists for the platform admin: who they are, their plan and
 * whether they're in the directory, and how much they do on the platform.
 */
export async function listSoloArtists(input: { q?: string; filter?: "listed" | "free" | "suspended" | null } = {}) {
  const q = input.q?.trim();
  const rows = await prisma.organization.findMany({
    where: {
      kind: "solo",
      ...(q
        ? { OR: [{ name: { contains: q } }, { slug: { contains: q } }, { city: { contains: q } }, { members: { some: { user: { email: { contains: q } } } } }] }
        : {}),
      ...(input.filter === "suspended" ? { suspendedAt: { not: null } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 500,
    include: {
      members: { where: { role: "solo_artist" }, take: 1, include: { user: { select: { name: true, email: true } } } },
      subscription: { include: { plan: { select: { key: true, name: true, audience: true } } } },
      artists: { where: { userId: { not: null } }, take: 1, select: { id: true, stageName: true, headline: true, photoUrl: true, genres: true } },
      _count: { select: { bookings: true, gigListings: true } },
    },
  });
  const paid = (r: (typeof rows)[number]) => r.subscription?.plan.audience === "artist" && ["active", "trialing", "past_due"].includes(r.subscription.status);
  return rows
    .map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.artists[0]?.stageName ?? r.name,
      headline: r.artists[0]?.headline ?? null,
      photoUrl: r.artists[0]?.photoUrl ?? null,
      genres: Array.isArray(r.artists[0]?.genres) ? (r.artists[0]!.genres as string[]) : [],
      city: r.city,
      owner: r.members[0]?.user ?? null,
      plan: r.subscription ? { name: r.subscription.plan.name as Record<string, string>, status: r.subscription.status } : null,
      listed: paid(r) && !r.suspendedAt,
      suspended: Boolean(r.suspendedAt),
      bookings: r._count.bookings,
      gigs: r._count.gigListings,
      acceptsLeads: r.acceptsLeads,
      createdAt: r.createdAt,
    }))
    .filter((r) => (input.filter === "listed" ? r.listed : input.filter === "free" ? !r.listed && !r.suspended : true));
}
