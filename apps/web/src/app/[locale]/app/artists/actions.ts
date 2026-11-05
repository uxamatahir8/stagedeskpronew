"use server";

import { randomUUID } from "node:crypto";
import { getLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { mediaEmbed, parseEuros } from "@stagedesk/core";
import { artistAccountState, artistCanBeAssigned, audit, prisma } from "@stagedesk/db";
import type { ActionResult } from "@/lib/actions";
import { toggleUnavailable } from "@/lib/availability";
import { deletePublicFile, detectImage, putPublicFile } from "@/lib/storage";
import { featureBlocked, limitBlocked, writeBlocked } from "@/lib/billing";
import { allow } from "@/lib/rate-limit";
import { requireAgency } from "@/lib/viewer";
import { announceOpenRequests, ArtistAccountError, ensureArtistAccount, resendArtistSetup, sendArtistSetup } from "@/lib/artist-account";

const artistSchema = z.object({
  id: z.string().max(64).nullable(),
  stageName: z.string().trim().min(1).max(120),
  genres: z.string().max(500),
  bio: z.string().max(5000).nullable(),
  sharePct: z.number().min(0).max(100),
  compensationType: z.enum(["percentage", "fixed"]).default("percentage"),
  /** The fixed amount as typed, for compensationType "fixed". */
  fixedFee: z.string().max(32).nullable().optional(),
  userId: z.string().max(64).nullable(),
  email: z.string().trim().email().max(191).nullable(),
  active: z.boolean(),
  showOnBookingPage: z.boolean(),
  mediaLinks: z.string().max(2000),
});

/** Only artist members of this agency without a profile can be linked. */
async function linkableUser(db: Awaited<ReturnType<typeof requireAgency>>["db"], userId: string | null, artistId: string | null) {
  if (!userId) return null;
  const member = await db.member.findFirst({ where: { userId, role: "artist" }, select: { userId: true } });
  if (!member) return null;
  const taken = await db.artist.findFirst({ where: { userId, ...(artistId ? { id: { not: artistId } } : {}) }, select: { id: true } });
  return taken ? null : userId;
}

/**
 * The account to keep linked: unchanged when the form sends the current one
 * (an artist whose membership changed mustn't be silently unlinked by an
 * unrelated edit), otherwise a linkable artist member of this agency.
 */
async function keptOrLinkableUser(db: Awaited<ReturnType<typeof requireAgency>>["db"], userId: string | null, artistId: string | null) {
  if (artistId && userId) {
    const current = await db.artist.findFirst({ where: { id: artistId }, select: { userId: true } });
    if (current?.userId === userId) return userId;
  }
  return linkableUser(db, userId, artistId);
}

export async function saveArtistAction(input: z.input<typeof artistSchema>): Promise<ActionResult & { id?: string }> {
  const { viewer, organization, db } = await requireAgency("agency.artists.manage");
  // New artists count against the plan; edits only need an active subscription.
  const blocked = await (input.id ? writeBlocked(organization.id) : limitBlocked(organization.id, "maxArtists"));
  if (blocked) return { ok: false, message: blocked };
  const t = await getTranslations("artists");
  const parsed = artistSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t("invalidShare") };
  const d = parsed.data;
  const fixedCents = d.compensationType === "fixed" ? parseEuros(d.fixedFee ?? "") : null;
  if (d.compensationType === "fixed" && (fixedCents === null || fixedCents < 0)) return { ok: false, message: t("invalidFixedFee") };

  // Only links we know how to embed safely are stored.
  const links = d.mediaLinks.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 3);
  const invalid = links.find((l) => !mediaEmbed(l));
  if (invalid) return { ok: false, message: t("invalidMedia", { link: invalid.slice(0, 80) }) };

  const data = {
    showOnBookingPage: d.showOnBookingPage,
    mediaLinks: links,
    stageName: d.stageName,
    genres: d.genres.split(",").map((g) => g.trim()).filter(Boolean).slice(0, 12),
    bio: d.bio?.trim() || null,
    defaultShareBps: Math.round(d.sharePct * 100),
    // Only new assignments take this; gigs already assigned keep the pay they were given.
    compensationType: d.compensationType,
    defaultFixedFeeCents: d.compensationType === "fixed" ? fixedCents : null,
    userId: await keptOrLinkableUser(db, d.userId, d.id),
    active: d.active,
  };
  if (d.id) {
    const before = await db.artist.findFirst({ where: { id: d.id }, select: { userId: true } });
    await db.artist.updateMany({ where: { id: d.id }, data });
    // Linked just now: requests sent before they had a login reach them from here on.
    if (data.userId && data.userId !== before?.userId) await announceOpenRequests(d.id, data.userId);
    return { ok: true, message: t("saved"), id: d.id };
  }
  const email = d.email?.toLowerCase() ?? null;
  if (!email) return { ok: false, message: t("emailRequired") };

  try {
    const account = await ensureArtistAccount({ organizationId: organization.id, email, name: d.stageName, locale: await getLocale() });
    const id = randomUUID();
    await db.artist.create({ data: { ...data, userId: account.userId, id, organizationId: organization.id } });
    const setup = account.needsSetup ? await sendArtistSetup(organization.id, account) : null;
    await audit({ actorId: viewer.user.id, action: "artist.invite", agencyId: organization.id, targetType: "artist", targetId: id, data: { userId: account.userId, created: account.created, setup } });
    // Saved either way. Say plainly when the email couldn't be handed on: it can be sent again from the artist's page.
    if (setup === "failed") return { ok: true, message: (await getTranslations("artistAccount"))("savedEmailFailed", { name: d.stageName }), id };
    return { ok: true, message: setup ? t("invited", { name: d.stageName, email }) : t("added", { name: d.stageName }), id };
  } catch (error) {
    if (error instanceof ArtistAccountError) return { ok: false, message: (await getTranslations("artistAccount"))(`error_${error.code}`) };
    throw error;
  }
}

const inviteSchema = z.object({ artistId: z.string().min(1).max(64), email: z.email().max(191) });

/**
 * Gives a profile without a login its account: an invitation with a first-password
 * link, or a link to the existing account with that address. Requests already
 * waiting for this artist reach them at once.
 */
export async function inviteArtistAccountAction(input: z.input<typeof inviteSchema>): Promise<ActionResult> {
  const { viewer, organization, db } = await requireAgency("agency.artists.manage");
  const blocked = await writeBlocked(organization.id);
  if (blocked) return { ok: false, message: blocked };
  const t = await getTranslations("artistAccount");
  const parsed = inviteSchema.safeParse({ ...input, email: input.email?.trim() });
  if (!parsed.success) return { ok: false, message: t("invalidEmail") };
  const artist = await db.artist.findFirst({ where: { id: parsed.data.artistId }, select: { id: true, stageName: true, userId: true } });
  if (!artist) return { ok: false };
  // A working login stays. One that can't be used (disabled, off the team) can be replaced.
  if (artist.userId && artistCanBeAssigned(await artistAccountState(artist.id))) return { ok: false, message: t("error_already_linked") };
  if (!(await allow(`artist-invite:${organization.id}`, 30, 3600))) return { ok: false, message: t("rateLimited") };

  try {
    const email = parsed.data.email.toLowerCase();
    const account = await ensureArtistAccount({ organizationId: organization.id, email, name: artist.stageName, locale: await getLocale() });
    const { count } = await db.artist.updateMany({ where: { id: artist.id, userId: artist.userId }, data: { userId: account.userId } });
    if (count !== 1) return { ok: false, message: t("error_already_linked") };
    const setup = account.needsSetup ? await sendArtistSetup(organization.id, account) : null;
    await audit({ actorId: viewer.user.id, action: "artist.invite", agencyId: organization.id, targetType: "artist", targetId: artist.id, data: { userId: account.userId, from: artist.userId, created: account.created, setup } });
    const waiting = await announceOpenRequests(artist.id, account.userId);
    const said = setup === "failed" ? t("savedEmailFailed", { name: artist.stageName }) : setup === "already_sent" ? t("setupAlreadySent", { name: artist.stageName, email }) : setup ? t("invited", { name: artist.stageName, email }) : t("linked", { name: artist.stageName });
    return { ok: true, message: waiting > 0 ? `${said} ${t("requestsDelivered", { count: waiting })}` : said };
  } catch (error) {
    if (error instanceof ArtistAccountError) return { ok: false, message: t(`error_${error.code}`) };
    throw error;
  }
}

/** Sends a new first-password link to an artist who hasn't been able to sign in yet. */
export async function resendArtistSetupAction(artistId: string): Promise<ActionResult> {
  const { viewer, organization, db } = await requireAgency("agency.artists.manage");
  const t = await getTranslations("artistAccount");
  const artist = await db.artist.findFirst({ where: { id: String(artistId).slice(0, 64) }, select: { id: true, user: { select: { id: true, email: true, name: true, locale: true, disabledAt: true, accounts: { select: { id: true }, take: 1 } } } } });
  if (!artist?.user || artist.user.disabledAt) return { ok: false, message: t("state_no_account") };
  if (artist.user.accounts.length > 0) return { ok: false, message: t("alreadyActive") };
  if (!(await allow(`artist-setup:${artist.id}`, 5, 3600))) return { ok: false, message: t("rateLimited") };
  const result = await resendArtistSetup(organization.id, artist.user);
  await audit({ actorId: viewer.user.id, action: "artist.setup_resent", agencyId: organization.id, targetType: "artist", targetId: artist.id, data: { result } });
  return result === "accepted" ? { ok: true, message: t("setupSent", { email: artist.user.email }) } : { ok: false, message: t("setupFailed") };
}

const linkSchema = z.object({ artistId: z.string().min(1).max(64), userId: z.string().min(1).max(64) });

/** Links a profile without a working login to an artist already on the team. */
export async function linkArtistAccountAction(input: z.input<typeof linkSchema>): Promise<ActionResult> {
  const { viewer, organization, db } = await requireAgency("agency.artists.manage");
  const blocked = await writeBlocked(organization.id);
  if (blocked) return { ok: false, message: blocked };
  const t = await getTranslations("artistAccount");
  const parsed = linkSchema.safeParse(input);
  if (!parsed.success) return { ok: false };
  const artist = await db.artist.findFirst({ where: { id: parsed.data.artistId }, select: { id: true, stageName: true, userId: true } });
  if (!artist) return { ok: false };
  if (artist.userId && artistCanBeAssigned(await artistAccountState(artist.id))) return { ok: false, message: t("error_already_linked") };
  const userId = await linkableUser(db, parsed.data.userId, artist.id);
  if (!userId) return { ok: false, message: t("error_already_linked") };
  const { count } = await db.artist.updateMany({ where: { id: artist.id, userId: artist.userId }, data: { userId } });
  if (count !== 1) return { ok: false, message: t("error_already_linked") };
  await audit({ actorId: viewer.user.id, action: "artist.invite", agencyId: organization.id, targetType: "artist", targetId: artist.id, data: { userId, from: artist.userId, linked: true } });
  const waiting = await announceOpenRequests(artist.id, userId);
  const said = t("linked", { name: artist.stageName });
  return { ok: true, message: waiting > 0 ? `${said} ${t("requestsDelivered", { count: waiting })}` : said };
}

export async function uploadArtistPhotoAction(artistId: string, form: FormData): Promise<ActionResult> {
  const { organization, db } = await requireAgency("agency.artists.manage");
  const [t, ts] = await Promise.all([getTranslations("artists"), getTranslations("agencySettings")]);
  const artist = await db.artist.findFirst({ where: { id: artistId }, select: { photoUrl: true } });
  if (!artist) return { ok: false };

  const file = form.get("photo");
  if (!(file instanceof File) || file.size === 0 || file.size > 4 * 1024 * 1024) return { ok: false, message: ts("invalidFile") };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const image = detectImage(bytes);
  if (!image) return { ok: false, message: ts("invalidFile") };

  const url = await putPublicFile(`organizations/${organization.id}/artists/${artistId}-${randomUUID()}.${image.ext}`, bytes, image.mime);
  await db.artist.updateMany({ where: { id: artistId }, data: { photoUrl: url } });
  await deletePublicFile(artist.photoUrl);
  return { ok: true, message: t("photoSaved") };
}

export async function setUnavailableAction(artistId: string, date: string, unavailable: boolean): Promise<ActionResult> {
  const { organization, db } = await requireAgency("agency.artists.manage");
  return toggleUnavailable(db, organization.id, artistId, date, unavailable);
}


export async function shareArtistAction(artistId: string, partnerSlug: string): Promise<ActionResult> {
  const { organization, db } = await requireAgency("agency.artists.manage");
  const blocked = (await writeBlocked(organization.id)) ?? (await featureBlocked(organization.id, "artistSharing"));
  if (blocked) return { ok: false, message: blocked };
  const t = await getTranslations("artists");
  const artist = await db.artist.findFirst({ where: { id: artistId }, select: { id: true } });
  if (!artist) return { ok: false };
  const partner = await prisma.organization.findUnique({ where: { slug: partnerSlug.trim().toLowerCase() }, select: { id: true } });
  if (!partner) return { ok: false, message: t("shareNotFound") };
  if (partner.id === organization.id) return { ok: false, message: t("shareSelf") };

  const existing = await db.artistShare.findFirst({ where: { artistId, partnerOrganizationId: partner.id } });
  if (existing) {
    await db.artistShare.updateMany({ where: { id: existing.id }, data: { status: "pending", respondedAt: null } });
  } else {
    await db.artistShare.create({
      data: { id: randomUUID(), artistId, partnerOrganizationId: partner.id, status: "pending", organizationId: organization.id },
    });
  }
  return { ok: true, message: t("shareSent") };
}

export async function revokeShareAction(shareId: string): Promise<ActionResult> {
  const { db } = await requireAgency("agency.artists.manage");
  await db.artistShare.updateMany({ where: { id: shareId }, data: { status: "revoked", respondedAt: new Date() } });
  return { ok: true, message: (await getTranslations("artists"))("shareUpdated") };
}

/** The partner agency answers a share request. Scoped to shares addressed to this agency. */
export async function respondShareAction(shareId: string, accept: boolean): Promise<ActionResult> {
  const { organization } = await requireAgency("agency.artists.manage");
  await prisma.artistShare.updateMany({
    where: { id: shareId, partnerOrganizationId: organization.id, status: "pending" },
    data: { status: accept ? "accepted" : "declined", respondedAt: new Date() },
  });
  return { ok: true, message: (await getTranslations("artists"))("shareUpdated") };
}
