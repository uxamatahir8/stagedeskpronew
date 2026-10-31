"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { cleanRegions, currencies, dateFormats, eventTypes, isTimeZone, isValidIban, normalizeIban, timeFormats } from "@stagedesk/core";
import { auditTx, enabledCurrencies, geocode, getSetting, Prisma, prisma } from "@stagedesk/db";
import { writeBlocked } from "@/lib/billing";
import type { ActionResult } from "@/lib/actions";
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
  currency: z.enum(currencies).default("EUR"),
  // "" follows the platform default.
  timeZone: z.union([z.literal(""), z.string().refine(isTimeZone)]).default(""),
  dateFormat: z.union([z.literal(""), z.enum(dateFormats)]).default(""),
  timeFormat: z.union([z.literal(""), z.enum(timeFormats)]).default(""),
});

const MAX_LOGO_BYTES = 2 * 1024 * 1024;

async function updateOrganization(organizationId: string, data: Prisma.OrganizationUpdateInput) {
  // Written directly rather than through Better Auth's updateOrganization, which only accepts
  // members: platform admins in support mode aren't. requireAgency has already checked the permission.
  await prisma.organization.update({ where: { id: organizationId }, data });
}

export async function saveAgency(_prev: FormState, form: FormData): Promise<FormState> {
  const { organization } = await requireAgency("agency.settings");
  const t = await getTranslations("agencySettings");

  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    const keys = fieldErrorKeys(parsed.error);
    return { fieldErrors: Object.fromEntries(Object.entries(keys).map(([f, k]) => [f, t(k as "required")])) };
  }

  const { currency, timeZone, dateFormat, timeFormat, ...details } = parsed.data;
  // Only currencies the platform offers; an agency may keep one that was switched off later.
  if (currency !== organization.currency && !(await enabledCurrencies()).includes(currency)) {
    return { fieldErrors: { currency: t("currencyUnavailable") } };
  }
  await updateOrganization(organization.id, details);
  // The currency isn't one of Better Auth's organization fields; existing bookings keep theirs.
  await prisma.organization.update({ where: { id: organization.id }, data: { currency, timeZone: timeZone || null, dateFormat: dateFormat || null, timeFormat: timeFormat || null } });
  revalidatePath("/[locale]/app", "layout");
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

const serviceAreaSchema = z.object({
  acceptsLeads: z.boolean(),
  regions: z.array(z.string().max(96)).max(50),
  radiusKm: z.number().int().min(1).max(1000).nullable(),
  eventTypes: z.array(z.enum(eventTypes)).min(1).nullable(),
});

/** Where and what the agency plays, for matching website requests. The address is put on the map for the radius. */
export async function saveServiceAreaAction(input: z.input<typeof serviceAreaSchema>): Promise<ActionResult> {
  const { organization } = await requireAgency("agency.settings");
  const t = await getTranslations("serviceArea");
  const parsed = serviceAreaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t("invalid") };
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organization.id }, select: { addressLine: true, postalCode: true, city: true } });
  const address = [org.addressLine, [org.postalCode, org.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const spot = address ? ((await geocode(address)) ?? (org.city ? await geocode(org.city) : null)) : null;
  await prisma.organization.update({
    where: { id: organization.id },
    data: {
      acceptsLeads: parsed.data.acceptsLeads,
      serviceRegions: cleanRegions(parsed.data.regions),
      serviceRadiusKm: parsed.data.radiusKm,
      serviceEventTypes: parsed.data.eventTypes ?? Prisma.DbNull,
      latitude: spot?.latitude ?? null,
      longitude: spot?.longitude ?? null,
    },
  });
  revalidatePath("/[locale]/app/agency-settings", "page");
  return { ok: true, message: parsed.data.radiusKm && !spot ? t("savedNoMap") : t("saved") };
}

const inventorySettingsSchema = z.object({ inventorySharing: z.boolean(), artistsHandleEquipment: z.boolean() });

/**
 * Inventory sharing (other agencies may browse public fields, read-only) and
 * whether assigned artists may record loading and returns. Sharing is an
 * access change, so turning it on or off is audited.
 */
export async function saveInventorySettingsAction(input: z.input<typeof inventorySettingsSchema>): Promise<ActionResult> {
  const { viewer, organization } = await requireAgency("agency.settings");
  const blocked = await writeBlocked(organization.id);
  if (blocked) return { ok: false, message: blocked };
  const data = inventorySettingsSchema.parse(input);
  // The setting and its audit row commit together: an access change never goes unrecorded.
  await prisma.$transaction(async (tx) => {
    const before = await tx.organization.findUniqueOrThrow({ where: { id: organization.id }, select: { inventorySharing: true, artistsHandleEquipment: true } });
    await tx.organization.update({ where: { id: organization.id }, data });
    if (before.inventorySharing !== data.inventorySharing) {
      await auditTx(tx, { actorId: viewer.user.id, action: "inventory.sharing", agencyId: organization.id, targetType: "agency", targetId: organization.id, data: { on: data.inventorySharing } });
    }
    if (before.artistsHandleEquipment !== data.artistsHandleEquipment) {
      await auditTx(tx, { actorId: viewer.user.id, action: "inventory.artist_access", agencyId: organization.id, targetType: "agency", targetId: organization.id, data: { on: data.artistsHandleEquipment } });
    }
  });
  return { ok: true, message: (await getTranslations("agencySettings"))("saved") };
}
