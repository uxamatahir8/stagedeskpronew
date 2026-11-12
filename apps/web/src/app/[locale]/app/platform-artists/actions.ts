"use server";

import { artistAssignableStatuses, artistHoldStatuses, parseEuros } from "@stagedesk/core";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import {
  ArtistAdminError,
  assignArtist,
  deactivateArtist,
  deleteArtistProfile,
  makeArtistIndependent,
  moveArtist,
  platformArtistsOrganization,
  prisma,
  reactivateArtist,
  relinkArtistUser,
  revokeArtistShares,
  unlinkArtistUser,
  withdrawArtistEverywhere,
} from "@stagedesk/db";
import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { type ActionResult, runAction } from "@/lib/actions";
import { copyPublicImage, deletePublicFile } from "@/lib/storage";
import { requirePermission } from "@/lib/viewer";
import { emailArtists } from "@/lib/artist-mail";
import { ArtistAccountError, ensureArtistAccount, sendArtistSetup } from "@/lib/artist-account";

const platformOrganization = platformArtistsOrganization;

/** Default pay as typed: a percentage of each booking payment ("40", "37,5") or a fixed fee per booking ("250,00"). */
export type ArtistPayInput = { type: "percentage" | "fixed"; value: string };

function parsePay(pay: ArtistPayInput | undefined) {
  const value = String(pay?.value ?? "").trim();
  if (pay?.type === "fixed") {
    const cents = parseEuros(value);
    return cents !== null && cents > 0 ? { compensationType: "fixed", defaultFixedFeeCents: cents, defaultShareBps: 0 } : null;
  }
  const pct = Number(value.replace(",", "."));
  return value !== "" && Number.isFinite(pct) && pct >= 0 && pct <= 100 ? { compensationType: "percentage", defaultFixedFeeCents: null, defaultShareBps: Math.round(pct * 100) } : null;
}

export async function createPlatformArtistAction(input: { stageName: string; email: string; organizationId: string | null; pay: ArtistPayInput }): Promise<ActionResult> {
  await requirePermission("platform.agencies");
  const t = await getTranslations("platformArtists");
  const stageName = String(input?.stageName ?? "").trim();
  const email = String(input?.email ?? "").trim().toLowerCase();
  const pay = parsePay(input?.pay);
  if (!stageName || !/^\S+@\S+\.\S+$/.test(email)) return { ok: false, message: t("invalid") };
  if (!pay) return { ok: false, message: t("invalidPay") };

  const organization = input.organizationId
    ? await prisma.organization.findFirst({ where: { id: input.organizationId, kind: "agency" }, select: { id: true, name: true } })
    : await platformOrganization();
  if (!organization) return { ok: false, message: t("invalid") };

  try {
    const account = await ensureArtistAccount({ organizationId: organization.id, email, name: stageName, locale: await getLocale() });
    await prisma.artist.create({ data: { id: randomUUID(), organizationId: organization.id, stageName, genres: [], ...pay, userId: account.userId } });
    const setup = account.needsSetup ? await sendArtistSetup(organization.id, account) : null;
    revalidatePath("/[locale]/app/platform-artists", "page");
    if (setup === "failed") return { ok: true, message: (await getTranslations("artistAccount"))("savedEmailFailed", { name: stageName }) };
    return { ok: true, message: setup ? t("created", { name: stageName, email }) : t("linked", { name: stageName }) };
  } catch (error) {
    if (error instanceof ArtistAccountError) return { ok: false, message: (await getTranslations("artistAccount"))(`error_${error.code}`) };
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
    prisma.booking.findFirst({ where: { id: bookingId, status: { in: [...artistAssignableStatuses] } }, select: { id: true, organizationId: true } }),
  ]);
  if (!artist || !booking) return { ok: false };
  const t = await getTranslations("platformArtists");
  const tb = await getTranslations("booking");
  // A refusal (unavailable, no login) gets the same message as at an agency, not a server error.
  return runAction(async () => {
    if (artist.organizationId !== booking.organizationId) {
      await prisma.artistShare.upsert({
        where: { artistId_partnerOrganizationId: { artistId, partnerOrganizationId: booking.organizationId } },
        update: { status: "accepted", respondedAt: new Date() },
        create: { id: randomUUID(), organizationId: artist.organizationId, artistId, partnerOrganizationId: booking.organizationId, status: "accepted", respondedAt: new Date() },
      });
    }
    const { assignmentId, withdrawnIds, notified } = await assignArtist(booking.organizationId, booking.id, artistId, viewer.user.id);
    const mailed = await emailArtists([assignmentId], "new");
    await emailArtists(withdrawnIds, "withdrawn");
    revalidatePath("/[locale]/app/platform-artists", "page");
    return notified && mailed ? t("assigned") : [t("assigned"), !notified && tb("notifyFailed"), !mailed && tb("emailNotQueued")].filter(Boolean).join(" ");
  });
}

const reason = z.string().trim().min(1).max(500);

/** Runs one support action on an artist and turns its refusals into text. */
async function supportAction(task: (actorId: string) => Promise<unknown>, done: "withdrawn" | "deactivated" | "reactivated" | "sharesRevoked" | "unlinked" | "relinked" | "deleted" | "madeIndependent" | "moved"): Promise<ActionResult> {
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
    const active = await prisma.bookingAssignment.findMany({ where: { artistId, status: { in: ["pending", "accepted"] }, booking: { status: { in: [...artistHoldStatuses] } } }, select: { id: true } });
    await withdrawArtistEverywhere(artistId, actor, r.data);
    await emailArtists(active.map((a) => a.id), "withdrawn");
  }, "withdrawn");
}

export async function deactivateArtistAction(artistId: string, why: string, withdraw: boolean) {
  const r = reason.safeParse(why);
  if (!r.success) return { ok: false, message: (await getTranslations("platformArtists"))("error_reason_required") };
  return supportAction(async (actor) => {
    const active = withdraw ? await prisma.bookingAssignment.findMany({ where: { artistId, status: { in: ["pending", "accepted"] }, booking: { status: { in: [...artistHoldStatuses] } } }, select: { id: true } }) : [];
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

/**
 * Moves an agency's (or the managed pool's) artist to their own independent
 * business. The photo is copied, so the agency replacing its own copy later
 * doesn't take it away from the artist.
 */
export async function makeIndependentAction(artistId: string, why: string, leaveAgency: boolean, withdraw: boolean): Promise<ActionResult> {
  const r = reason.safeParse(why);
  if (!r.success) return { ok: false, message: (await getTranslations("platformArtists"))("error_reason_required") };
  return supportAction(async (actor) => {
    const artist = await prisma.artist.findUnique({ where: { id: String(artistId) }, select: { photoUrl: true } });
    const active = leaveAgency && withdraw ? await prisma.bookingAssignment.findMany({ where: { artistId, status: { in: ["pending", "accepted"] }, booking: { status: { in: [...artistHoldStatuses] } } }, select: { id: true } }) : [];
    const photoUrl = await copyPublicImage(artist?.photoUrl ?? null, `artists/independent-${randomUUID()}`);
    try {
      await makeArtistIndependent(String(artistId), actor, r.data, { leaveAgency: Boolean(leaveAgency), withdraw: Boolean(withdraw), photoUrl });
    } catch (error) {
      await deletePublicFile(photoUrl);
      throw error;
    }
    await emailArtists(active.map((a) => a.id), "withdrawn");
  }, "madeIndependent");
}

/**
 * Changes where an artist works ("independent", "platform" for the managed
 * pool, or an agency's id), optionally keeping their current role as well.
 * The photo is copied so each profile owns its own file.
 */
export async function moveArtistAction(input: { artistId: string; target: string; keepCurrent: boolean; withdraw: boolean; reason: string }): Promise<ActionResult> {
  const r = reason.safeParse(input?.reason);
  if (!r.success) return { ok: false, message: (await getTranslations("platformArtists"))("error_reason_required") };
  const artistId = String(input.artistId);
  const target = String(input.target);
  return supportAction(async (actor) => {
    const artist = await prisma.artist.findUnique({ where: { id: artistId }, select: { photoUrl: true } });
    const leaving = !input.keepCurrent && input.withdraw;
    const active = leaving ? await prisma.bookingAssignment.findMany({ where: { artistId, status: { in: ["pending", "accepted"] }, booking: { status: { in: [...artistHoldStatuses] } } }, select: { id: true } }) : [];
    const destination = target === "independent" ? { kind: "independent" as const } : { kind: "organization" as const, organizationId: target === "platform" ? (await platformOrganization()).id : target };
    const photoUrl = await copyPublicImage(artist?.photoUrl ?? null, `artists/moved-${randomUUID()}`);
    try {
      await moveArtist(artistId, destination, actor, r.data, { keepCurrent: Boolean(input.keepCurrent), withdraw: Boolean(input.withdraw), photoUrl });
    } catch (error) {
      await deletePublicFile(photoUrl);
      throw error;
    }
    await emailArtists(active.map((a) => a.id), "withdrawn");
  }, "moved");
}
