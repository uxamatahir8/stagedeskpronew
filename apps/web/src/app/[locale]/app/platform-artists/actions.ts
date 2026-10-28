"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getLocale, getTranslations } from "next-intl/server";
import { assignArtist, prisma } from "@stagedesk/db";
import type { ActionResult } from "@/lib/actions";
import { requirePermission } from "@/lib/viewer";
import { ArtistAccountError, ensureArtistAccount } from "@/lib/artist-account";

const PLATFORM_ARTISTS_SLUG = "stagedesk-platform-artists";

async function platformOrganization() {
  return prisma.organization.upsert({
    where: { slug: PLATFORM_ARTISTS_SLUG },
    update: {},
    create: { id: randomUUID(), name: "StageDesk managed artists", slug: PLATFORM_ARTISTS_SLUG, kind: "platform", bookingPageEnabled: false, acceptsLeads: false },
    select: { id: true, name: true },
  });
}

export async function createPlatformArtistAction(input: { stageName: string; email: string; organizationId: string | null; sharePct: number }): Promise<ActionResult> {
  await requirePermission("platform.agencies");
  const t = await getTranslations("platformArtists");
  const stageName = input.stageName.trim();
  const email = input.email.trim().toLowerCase();
  if (!stageName || !/^\S+@\S+\.\S+$/.test(email) || input.sharePct < 0 || input.sharePct > 100) return { ok: false, message: t("invalid") };

  const organization = input.organizationId
    ? await prisma.organization.findFirst({ where: { id: input.organizationId, kind: "agency" }, select: { id: true, name: true } })
    : await platformOrganization();
  if (!organization) return { ok: false, message: t("invalid") };

  try {
    const account = await ensureArtistAccount({ organizationId: organization.id, email, name: stageName, locale: await getLocale() });
    await prisma.artist.create({ data: { id: randomUUID(), organizationId: organization.id, stageName, genres: [], defaultShareBps: Math.round(input.sharePct * 100), userId: account.userId } });
    revalidatePath("/[locale]/app/platform-artists", "page");
    return { ok: true, message: account.setupSent ? t("created", { name: stageName, email }) : t("linked", { name: stageName }) };
  } catch (error) {
    if (error instanceof ArtistAccountError) return { ok: false, message: error.message };
    throw error;
  }
}

export async function sharePlatformArtistAction(artistId: string, organizationId: string): Promise<ActionResult> {
  await requirePermission("platform.agencies");
  const [artist, partner] = await Promise.all([
    prisma.artist.findUnique({ where: { id: artistId }, select: { organizationId: true } }),
    prisma.organization.findFirst({ where: { id: organizationId, kind: "agency" }, select: { id: true } }),
  ]);
  if (!artist || !partner || artist.organizationId === partner.id) return { ok: false };
  await prisma.artistShare.upsert({
    where: { artistId_partnerOrganizationId: { artistId, partnerOrganizationId: partner.id } },
    update: { status: "accepted", respondedAt: new Date() },
    create: { id: randomUUID(), organizationId: artist.organizationId, artistId, partnerOrganizationId: partner.id, status: "accepted", respondedAt: new Date() },
  });
  revalidatePath("/[locale]/app/platform-artists", "page");
  return { ok: true, message: (await getTranslations("platformArtists"))("shared") };
}

export async function assignPlatformArtistAction(artistId: string, bookingId: string): Promise<ActionResult> {
  const viewer = await requirePermission("platform.agencies");
  const [artist, booking] = await Promise.all([
    prisma.artist.findUnique({ where: { id: artistId }, select: { organizationId: true } }),
    prisma.booking.findFirst({ where: { id: bookingId, status: { in: ["booked", "confirmed"] } }, select: { id: true, organizationId: true } }),
  ]);
  if (!artist || !booking) return { ok: false };
  if (artist.organizationId !== booking.organizationId) {
    await prisma.artistShare.upsert({
      where: { artistId_partnerOrganizationId: { artistId, partnerOrganizationId: booking.organizationId } },
      update: { status: "accepted", respondedAt: new Date() },
      create: { id: randomUUID(), organizationId: artist.organizationId, artistId, partnerOrganizationId: booking.organizationId, status: "accepted", respondedAt: new Date() },
    });
  }
  await assignArtist(booking.organizationId, booking.id, artistId, viewer.user.id);
  revalidatePath("/[locale]/app/platform-artists", "page");
  return { ok: true, message: (await getTranslations("platformArtists"))("assigned") };
}
