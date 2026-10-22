"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { prisma } from "@stagedesk/db";
import { auth } from "@/lib/auth";
import { deletePublicFile, detectImage, putPublicFile } from "@/lib/storage";
import {
  brandColor,
  fieldErrorKeys,
  type FormState,
  kvkNumber,
  optionalEmail,
  optionalText,
  optionalUrl,
  postalCode,
  requiredText,
  vatNumber,
} from "@/lib/validation";
import { requireAgency } from "@/lib/viewer";

const schema = z.object({
  name: requiredText(191),
  kvkNumber,
  vatNumber,
  contactEmail: optionalEmail,
  phone: optionalText(32),
  website: optionalUrl,
  addressLine: optionalText(191),
  postalCode,
  city: optionalText(96),
  brandColor,
});

const MAX_LOGO_BYTES = 2 * 1024 * 1024;

async function updateOrganization(organizationId: string, data: Record<string, unknown>) {
  // Better Auth checks that the member may update the organization.
  await auth.api.updateOrganization({ headers: await headers(), body: { organizationId, data } });
}

export async function saveAgency(_prev: FormState, form: FormData): Promise<FormState> {
  const { organization } = await requireAgency("agency.settings");
  const t = await getTranslations("agencySettings");

  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    const keys = fieldErrorKeys(parsed.error);
    return { fieldErrors: Object.fromEntries(Object.entries(keys).map(([f, k]) => [f, t(k as "required")])) };
  }

  await updateOrganization(organization.id, parsed.data);
  return { ok: true, message: t("saved") };
}

export async function uploadLogo(_prev: FormState, form: FormData): Promise<FormState> {
  const { organization } = await requireAgency("agency.settings");
  const t = await getTranslations("agencySettings");

  const file = form.get("logo");
  if (!(file instanceof File) || file.size === 0 || file.size > MAX_LOGO_BYTES) return { message: t("invalidFile") };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const image = detectImage(bytes);
  if (!image) return { message: t("invalidFile") };

  const previous = await prisma.organization.findUnique({ where: { id: organization.id }, select: { logo: true } });
  const url = await putPublicFile(`organizations/${organization.id}/logo-${randomUUID()}.${image.ext}`, bytes, image.mime);
  await updateOrganization(organization.id, { logo: url });
  await deletePublicFile(previous?.logo);
  return { ok: true, message: t("logoSaved") };
}

export async function removeLogo(): Promise<FormState> {
  const { organization } = await requireAgency("agency.settings");
  const t = await getTranslations("agencySettings");
  const previous = await prisma.organization.findUnique({ where: { id: organization.id }, select: { logo: true } });
  await updateOrganization(organization.id, { logo: null });
  await deletePublicFile(previous?.logo);
  return { ok: true, message: t("logoRemoved") };
}
