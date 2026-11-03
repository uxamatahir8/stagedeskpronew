"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import {
  ArtistAdminError,
  assignArtist,
  deactivateArtist,
  deleteArtistProfile,
  prisma,
  reactivateArtist,
  relinkArtistUser,
  revokeArtistShares,
  unlinkArtistUser,
  withdrawArtistEverywhere,
} from "@stagedesk/db";
import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import type { ActionResult } from "@/lib/actions";
import { requirePermission } from "@/lib/viewer";
import { emailArtists } from "@/lib/artist-mail";
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
  const { assignmentId, withdrawnIds } = await assignArtist(booking.organizationId, booking.id, artistId, viewer.user.id);
  await emailArtists([assignmentId], "new");
  await emailArtists(withdrawnIds, "withdrawn");
  revalidatePath("/[locale]/app/platform-artists", "page");
  return { ok: true, message: (await getTranslations("platformArtists"))("assigned") };
}

const reason = z.string().trim().min(1).max(500);

/** Runs one support action on an artist and turns its refusals into text. */
async function supportAction(task: (actorId: string) => Promise<unknown>, done: "withdrawn" | "deactivated" | "reactivated" | "sharesRevoked" | "unlinked" | "relinked" | "deleted"): Promise<ActionResult> {
  const viewer = await requirePermission("platform.agencies");
  const t = await getTranslations("platformArtists");
  try {
    await task(viewer.user.id);
  } catch (error) {
    if (error instanceof ArtistAdminError) return { ok: false, message: t(`error_${error.code}`) };
    throw error;
  }
  revalidatePath("/[locale]/app/platform-artists", "layout");
  return { ok: true, message: t(done) };
}

export async function withdrawArtistAction(artistId: string, why: string) {
  const r = reason.safeParse(why);
  if (!r.success) return { ok: false, message: (await getTranslations("platformArtists"))("error_reason_required") };
  // Booking agencies are told, and so are the artists, by email too.
  return supportAction(async (actor) => {
    const active = await prisma.bookingAssignment.findMany({ where: { artistId, status: { in: ["pending", "accepted"] }, booking: { status: { in: ["booked", "confirmed"] } } }, select: { id: true } });
    await withdrawArtistEverywhere(artistId, actor, r.data);
    await emailArtists(active.map((a) => a.id), "withdrawn");
  }, "withdrawn");
}

export async function deactivateArtistAction(artistId: string, why: string, withdraw: boolean) {
  const r = reason.safeParse(why);
  if (!r.success) return { ok: false, message: (await getTranslations("platformArtists"))("error_reason_required") };
  return supportAction(async (actor) => {
    const active = withdraw ? await prisma.bookingAssignment.findMany({ where: { artistId, status: { in: ["pending", "accepted"] }, booking: { status: { in: ["booked", "confirmed"] } } }, select: { id: true } }) : [];
    await deactivateArtist(artistId, actor, r.data, { withdraw });
    await emailArtists(active.map((a) => a.id), "withdrawn");
  }, "deactivated");
}

export async function reactivateArtistAction(artistId: string, why: string) {
  return supportAction((actor) => reactivateArtist(artistId, actor, why), "reactivated");
}

export async function revokeArtistSharesAction(artistId: string, why: string) {
  return supportAction((actor) => revokeArtistShares(artistId, actor, why), "sharesRevoked");
}

export async function unlinkArtistAction(artistId: string, why: string) {
  return supportAction((actor) => unlinkArtistUser(artistId, actor, why), "unlinked");
}

export async function relinkArtistAction(artistId: string, email: string, why: string) {
  const mail = z.email().max(191).safeParse(email.trim());
  if (!mail.success) return { ok: false, message: (await getTranslations("platformArtists"))("error_user_not_found") };
  return supportAction((actor) => relinkArtistUser(artistId, mail.data, actor, why), "relinked");
}

export async function deleteArtistAction(artistId: string, why: string): Promise<ActionResult> {
  const result = await supportAction((actor) => deleteArtistProfile(artistId, actor, why), "deleted");
  if (result.ok) redirect({ href: "/app/platform-artists", locale: (await getLocale()) as Locale });
  return result;
}
