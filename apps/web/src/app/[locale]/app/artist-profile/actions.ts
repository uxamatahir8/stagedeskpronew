"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { mediaEmbed, parseEuros } from "@stagedesk/core";
import { prisma, soloArtist } from "@stagedesk/db";
import type { ActionResult } from "@/lib/actions";
import { deletePublicFile, detectImage, putPublicFile } from "@/lib/storage";
import { requireAgency } from "@/lib/viewer";

const profileSchema = z.object({
  stageName: z.string().trim().min(1).max(120),
  headline: z.string().trim().max(160),
  bio: z.string().trim().max(5000),
  genres: z.string().max(500),
  mediaLinks: z.string().max(2000),
  priceFrom: z.string().max(20),
});

/** The independent artist's own profile; their stage name is also their business name. */
export async function saveSoloProfileAction(input: z.input<typeof profileSchema>): Promise<ActionResult> {
  const { organization } = await requireAgency("artist.profile");
  const t = await getTranslations("artistProfile");
  const artist = await soloArtist(organization.id);
  if (!artist) return { ok: false, message: t("notSolo") };
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t("invalid") };
  const d = parsed.data;

  const links = d.mediaLinks.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 3);
  const invalid = links.find((l) => !mediaEmbed(l));
  if (invalid) return { ok: false, message: t("invalidMedia", { link: invalid.slice(0, 80) }) };
  const priceFromCents = d.priceFrom.trim() ? parseEuros(d.priceFrom) : null;
  if (d.priceFrom.trim() && (priceFromCents === null || priceFromCents <= 0)) return { ok: false, message: t("invalidPrice") };

  await prisma.$transaction([
    prisma.artist.update({
      where: { id: artist.id },
      data: {
        stageName: d.stageName,
        headline: d.headline || null,
        bio: d.bio || null,
        genres: d.genres.split(",").map((g) => g.trim()).filter(Boolean).slice(0, 12),
        mediaLinks: links,
        priceFromCents,
      },
    }),
    prisma.organization.update({ where: { id: organization.id }, data: { name: d.stageName } }),
  ]);
  revalidatePath("/[locale]/app", "layout");
  return { ok: true, message: t("saved") };
}

export async function uploadSoloPhotoAction(form: FormData): Promise<ActionResult> {
  const { organization } = await requireAgency("artist.profile");
  const [t, ts] = await Promise.all([getTranslations("artistProfile"), getTranslations("agencySettings")]);
  const artist = await soloArtist(organization.id);
  if (!artist) return { ok: false, message: t("notSolo") };
  const file = form.get("photo");
  if (!(file instanceof File) || file.size === 0 || file.size > 4 * 1024 * 1024) return { ok: false, message: ts("invalidFile") };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const image = detectImage(bytes);
  if (!image) return { ok: false, message: ts("invalidFile") };
  const url = await putPublicFile(`organizations/${organization.id}/artists/${artist.id}-${randomUUID()}.${image.ext}`, bytes, image.mime);
  // The photo is also the business logo, so it shows wherever agencies show theirs.
  const old = artist.photoUrl;
  await prisma.$transaction([prisma.artist.update({ where: { id: artist.id }, data: { photoUrl: url } }), prisma.organization.update({ where: { id: organization.id }, data: { logo: url } })]);
  await deletePublicFile(old);
  revalidatePath("/[locale]/app", "layout");
  return { ok: true, message: t("photoSaved") };
}
