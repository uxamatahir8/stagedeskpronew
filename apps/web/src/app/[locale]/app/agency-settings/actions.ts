"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { isValidIban, normalizeIban } from "@stagedesk/core";
import { getSetting, prisma } from "@stagedesk/db";
import type { ActionResult } from "@/lib/actions";
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

export type PaymentMethodsInput = { acceptOnline: boolean; acceptBankTransfer: boolean; acceptCash: boolean; iban: string; bankAccountName: string; paymentInstructions: string };

/**
 * How this agency's customers may pay, within what the platform allows.
 * Bank transfer needs a valid IBAN and the account holder's name, which customers see.
 */
export async function savePaymentMethodsAction(input: PaymentMethodsInput): Promise<ActionResult> {
  const { organization } = await requireAgency("agency.settings");
  const [t, allowed] = await Promise.all([getTranslations("agencyPayments"), getSetting("payments.methods")]);
  const iban = normalizeIban(input.iban);
  const name = input.bankAccountName.trim();
  if (iban && !isValidIban(iban)) return { ok: false, message: t("invalidIban") };
  if (input.acceptBankTransfer && (!iban || !name)) return { ok: false, message: t("bankDetailsRequired") };
  if (!input.acceptOnline && !input.acceptBankTransfer && !input.acceptCash) return { ok: false, message: t("oneMethod") };
  await prisma.organization.update({
    where: { id: organization.id },
    data: {
      // A method the platform switched off stays off, whatever is sent.
      acceptOnline: input.acceptOnline && allowed.online,
      acceptBankTransfer: input.acceptBankTransfer && allowed.bankTransfer,
      acceptCash: input.acceptCash && allowed.cash,
      iban: iban || null,
      bankAccountName: name.slice(0, 191) || null,
      paymentInstructions: input.paymentInstructions.trim().slice(0, 2000) || null,
    },
  });
  revalidatePath("/[locale]/app/agency-settings", "page");
  return { ok: true, message: t("saved") };
}
