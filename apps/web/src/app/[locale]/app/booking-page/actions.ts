"use server";

import { randomUUID } from "node:crypto";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { bookingThemeSchema, normalizeBookingSections } from "@stagedesk/core";
import { prisma } from "@stagedesk/db";
import type { ActionResult } from "@/lib/actions";
import { deletePublicFile, detectImage, putPublicFile } from "@/lib/storage";
import { writeBlocked } from "@/lib/billing";
import { requireAgency } from "@/lib/viewer";

const schema = z.object({
  enabled: z.boolean(),
  intro: z.string().max(5000),
  faq: z.array(z.object({ question: z.string().trim().max(300), answer: z.string().trim().max(3000) })).max(20),
  theme: bookingThemeSchema,
});


export async function saveBookingPageAction(input: z.input<typeof schema>): Promise<ActionResult> {
  const { organization } = await requireAgency("agency.website");
  const blocked = await writeBlocked(organization.id);
  if (blocked) return { ok: false, message: blocked };
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, message: (await getTranslations("auth"))("generic") };
  const sections = normalizeBookingSections(parsed.data.theme.sections);
  // Not part of Better Auth's organization fields; requireAgency already limits this to owners and admins.
  await prisma.organization.update({
    where: { id: organization.id },
    data: {
      bookingPageEnabled: parsed.data.enabled,
      bookingIntro: parsed.data.intro.trim() || null,
      faq: parsed.data.faq.filter((f) => f.question && f.answer),
      // The reviews section's switch also decides whether reviews are loaded at all.
      showReviews: sections.find((s) => s.key === "reviews")!.visible,
      bookingTheme: { ...parsed.data.theme, sections },
    },
  });
  return { ok: true, message: (await getTranslations("bookingPageSettings"))("saved") };
}

export async function uploadCoverAction(form: FormData): Promise<ActionResult> {
  const { organization } = await requireAgency("agency.website");
  const ts = await getTranslations("agencySettings");
  const file = form.get("cover");
  if (!(file instanceof File) || file.size === 0 || file.size > 4 * 1024 * 1024) return { ok: false, message: ts("invalidFile") };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const image = detectImage(bytes);
  if (!image) return { ok: false, message: ts("invalidFile") };

  const previous = await prisma.organization.findUnique({ where: { id: organization.id }, select: { coverUrl: true } });
  const url = await putPublicFile(`organizations/${organization.id}/cover-${randomUUID()}.${image.ext}`, bytes, image.mime);
  await prisma.organization.update({ where: { id: organization.id }, data: { coverUrl: url } });
  await deletePublicFile(previous?.coverUrl);
  return { ok: true, message: (await getTranslations("bookingPageSettings"))("saved") };
}

export async function removeCoverAction(): Promise<ActionResult> {
  const { organization } = await requireAgency("agency.website");
  const previous = await prisma.organization.findUnique({ where: { id: organization.id }, select: { coverUrl: true } });
  await prisma.organization.update({ where: { id: organization.id }, data: { coverUrl: null } });
  await deletePublicFile(previous?.coverUrl);
  return { ok: true, message: (await getTranslations("bookingPageSettings"))("saved") };
}

