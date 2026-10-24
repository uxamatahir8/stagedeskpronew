"use server";

import { randomUUID } from "node:crypto";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { mediaEmbed } from "@stagedesk/core";
import { prisma } from "@stagedesk/db";
import type { ActionResult } from "@/lib/actions";
import { toggleUnavailable } from "@/lib/availability";
import { deletePublicFile, detectImage, putPublicFile } from "@/lib/storage";
import { featureBlocked, limitBlocked, writeBlocked } from "@/lib/billing";
import { requireAgency } from "@/lib/viewer";

const artistSchema = z.object({
  id: z.string().max(64).nullable(),
  stageName: z.string().trim().min(1).max(120),
  genres: z.string().max(500),
  bio: z.string().max(5000).nullable(),
  sharePct: z.number().min(0).max(100),
  userId: z.string().max(64).nullable(),
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

export async function saveArtistAction(input: z.input<typeof artistSchema>): Promise<ActionResult & { id?: string }> {
  const { organization, db } = await requireAgency("agency.artists.manage");
  // New artists count against the plan; edits only need an active subscription.
  const blocked = await (input.id ? writeBlocked(organization.id) : limitBlocked(organization.id, "maxArtists"));
  if (blocked) return { ok: false, message: blocked };
  const t = await getTranslations("artists");
  const parsed = artistSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t("invalidShare") };
  const d = parsed.data;

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
    userId: await linkableUser(db, d.userId, d.id),
    active: d.active,
  };
  if (d.id) {
    await db.artist.updateMany({ where: { id: d.id }, data });
    return { ok: true, message: t("saved"), id: d.id };
  }
  const id = randomUUID();
  await db.artist.create({ data: { ...data, id, organizationId: organization.id } });
  return { ok: true, message: t("added", { name: d.stageName }), id };
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
