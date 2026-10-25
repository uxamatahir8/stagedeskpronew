import { randomUUID } from "node:crypto";
import { freeSlug } from "./agencies";
import { prisma } from "./client";

/**
 * An independent artist's own business: one organization of kind "solo",
 * the artist as its only member (role solo_artist), and their artist profile
 * in it, so bookings, quotes, payments and the calendar work as for agencies.
 */
export async function createSoloArtist(userId: string, input: { stageName: string; city: string | null; genres: string[] }) {
  const organizationId = randomUUID();
  const slug = await freeSlug(input.stageName);
  await prisma.$transaction(async (tx) => {
    await tx.organization.create({ data: { id: organizationId, name: input.stageName.trim(), slug, city: input.city, kind: "solo" } });
    await tx.member.create({ data: { id: randomUUID(), organizationId, userId, role: "solo_artist" } });
    await tx.artist.create({
      data: { id: randomUUID(), organizationId, userId, stageName: input.stageName.trim(), genres: input.genres.slice(0, 12), defaultShareBps: 0, showOnBookingPage: true },
    });
  });
  return prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
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
