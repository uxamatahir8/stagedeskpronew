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
