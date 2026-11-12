"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import {
  cleanRegions,
  currencies,
  dateFormats,
  depositTypes,
  eventTypes,
  invoiceNumberings,
  invoicePrefixPattern,
  invoiceTemplateSchema,
  isTimeZone,
  isValidIban,
  normalizeIban,
  normalizeInvoiceNumber,
  parseEuros,
  parseInvoiceTemplate,
  timeFormats,
} from "@stagedesk/core";
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
import { allow } from "@/lib/rate-limit";
import { deliver, userLocale } from "@/lib/mail";
import { agencySender } from "@/lib/correspondence";

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
  await deleteUnlessOnInvoices(organization.id, previous?.logo);
  return { ok: true, message: t("logoSaved") };
}

export async function removeLogo(): Promise<FormState> {
  const { organization } = await requireAgency("agency.settings");
  const t = await getTranslations("agencySettings");
  const previous = await prisma.organization.findUnique({ where: { id: organization.id }, select: { logo: true } });
  await updateOrganization(organization.id, { logo: null });
  await deleteUnlessOnInvoices(organization.id, previous?.logo);
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

const customerPortalSchema = z.object({ customerPreferencesEditable: z.boolean() });

/** Whether customers may edit their own wishes in their portal. It decides who can write to a booking, so it's audited. */
export async function saveCustomerPortalAction(input: z.input<typeof customerPortalSchema>): Promise<ActionResult> {
  const { viewer, organization } = await requireAgency("agency.settings");
  const blocked = await writeBlocked(organization.id);
  if (blocked) return { ok: false, message: blocked };
  const data = customerPortalSchema.parse(input);
  await prisma.$transaction(async (tx) => {
    const before = await tx.organization.findUniqueOrThrow({ where: { id: organization.id }, select: { customerPreferencesEditable: true } });
    await tx.organization.update({ where: { id: organization.id }, data });
    if (before.customerPreferencesEditable !== data.customerPreferencesEditable) {
      await auditTx(tx, { actorId: viewer.user.id, action: "agency.customer_portal", agencyId: organization.id, targetType: "agency", targetId: organization.id, data: { on: data.customerPreferencesEditable } });
    }
  });
  return { ok: true, message: (await getTranslations("agencySettings"))("saved") };
}

/**
 * Issued invoices print the logo and background they had when issued (their
 * snapshot keeps the file path), so a replaced file is only deleted while the
 * agency has no invoices yet.
 */
async function deleteUnlessOnInvoices(organizationId: string, url: string | null | undefined) {
  if (!url) return;
  if ((await prisma.invoice.count({ where: { organizationId } })) > 0) return;
  await deletePublicFile(url);
}

// ─── Customer communication ─────────────────────────────────────────────

const communicationSchema = z.object({
  correspondenceLocale: z.enum(["nl", "en"]),
  depositType: z.enum(depositTypes),
  depositPct: z.number().min(0).max(100),
  depositFixed: z.string().max(32),
  emailFromName: z.string().trim().max(120),
  emailReplyTo: z.union([z.literal(""), z.email().max(191)]),
});

/** The language customers get mail in, the upfront payment new quotes start with, and how customer mail is signed. */
export async function saveCommunicationSettingsAction(input: z.input<typeof communicationSchema>): Promise<ActionResult> {
  const { viewer, organization } = await requireAgency("agency.settings");
  const blocked = await writeBlocked(organization.id);
  if (blocked) return { ok: false, message: blocked };
  const t = await getTranslations("communicationSettings");
  const parsed = communicationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t("invalid") };
  const d = parsed.data;
  const fixed = d.depositType === "fixed" ? parseEuros(d.depositFixed) : null;
  if (d.depositType === "fixed" && (fixed === null || fixed < 0)) return { ok: false, message: t("invalidDeposit") };
  // Customers' replies go to the address chosen here; a change is recorded.
  await prisma.$transaction(async (tx) => {
    const before = await tx.organization.findUniqueOrThrow({ where: { id: organization.id }, select: { emailFromName: true, emailReplyTo: true } });
    await tx.organization.update({
      where: { id: organization.id },
      data: {
        correspondenceLocale: d.correspondenceLocale,
        defaultDepositType: d.depositType,
        defaultDepositBps: d.depositType === "percentage" ? Math.round(d.depositPct * 100) : null,
        defaultDepositFixedCents: fixed,
        emailFromName: d.emailFromName || null,
        emailReplyTo: d.emailReplyTo || null,
      },
    });
    if (before.emailFromName !== (d.emailFromName || null) || before.emailReplyTo !== (d.emailReplyTo || null)) {
      await auditTx(tx, { actorId: viewer.user.id, action: "agency.email_sender", agencyId: organization.id, targetType: "agency", targetId: organization.id, data: { name: d.emailFromName || null, replyTo: d.emailReplyTo || null } });
    }
  });
  revalidatePath("/[locale]/app/agency-settings", "page");
  return { ok: true, message: t("saved") };
}

/** Sends the signed-in person a sample of how customer mail arrives (name, Reply-To), at most a few times an hour. */
export async function sendSenderTestAction(): Promise<ActionResult> {
  const { viewer, organization } = await requireAgency("agency.settings");
  const t = await getTranslations("communicationSettings");
  if (!(await allow(`sender-test:${organization.id}`, 5, 3600))) return { ok: false, message: t("tooMany") };
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organization.id }, select: { name: true, emailFromName: true, emailReplyTo: true, contactEmail: true } });
  const sender = agencySender(org);
  deliver({
    kind: "senderTest",
    to: viewer.user.email,
    sender,
    params: { locale: userLocale(await getLocale()), agency: sender.name, replyTo: sender.replyTo ?? viewer.user.email },
  });
  return { ok: true, message: t("testSent", { email: viewer.user.email }) };
}

// ─── Invoices ───────────────────────────────────────────────────────────

const invoiceSettingsSchema = z.object({
  invoiceNumbering: z.enum(invoiceNumberings),
  invoicePrefix: z.string().max(12),
  allowManualInvoiceNumbers: z.boolean(),
  template: invoiceTemplateSchema.omit({ backgroundUrl: true }),
});

/** Numbering and look of the agency's invoices. Issued invoices keep their number and look. */
export async function saveInvoiceSettingsAction(input: z.input<typeof invoiceSettingsSchema>): Promise<ActionResult> {
  const { viewer, organization } = await requireAgency("agency.settings");
  const blocked = await writeBlocked(organization.id);
  if (blocked) return { ok: false, message: blocked };
  const t = await getTranslations("invoiceSettings");
  const parsed = invoiceSettingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t("invalid") };
  const d = parsed.data;
  const prefix = d.invoicePrefix.trim() ? normalizeInvoiceNumber(d.invoicePrefix) : null;
  if (prefix && !invoicePrefixPattern.test(prefix)) return { ok: false, message: t("invalidPrefix") };
  await prisma.$transaction(async (tx) => {
    const before = await tx.organization.findUniqueOrThrow({ where: { id: organization.id }, select: { invoiceNumbering: true, invoicePrefix: true, allowManualInvoiceNumbers: true, invoiceTemplate: true } });
    const current = parseInvoiceTemplate(before.invoiceTemplate);
    await tx.organization.update({
      where: { id: organization.id },
      data: {
        invoiceNumbering: d.invoiceNumbering,
        invoicePrefix: prefix,
        allowManualInvoiceNumbers: d.allowManualInvoiceNumbers,
        invoiceTemplate: { ...d.template, backgroundUrl: current.backgroundUrl } as Prisma.InputJsonValue,
      },
    });
    // Numbering is part of the books: every change to it is recorded.
    if (before.invoiceNumbering !== d.invoiceNumbering || before.invoicePrefix !== prefix || before.allowManualInvoiceNumbers !== d.allowManualInvoiceNumbers) {
      await auditTx(tx, {
        actorId: viewer.user.id,
        action: "invoice.numbering",
        agencyId: organization.id,
        targetType: "agency",
        targetId: organization.id,
        data: { from: { numbering: before.invoiceNumbering, prefix: before.invoicePrefix, manual: before.allowManualInvoiceNumbers }, to: { numbering: d.invoiceNumbering, prefix, manual: d.allowManualInvoiceNumbers } },
      });
    }
  });
  revalidatePath("/[locale]/app/agency-settings", "page");
  return { ok: true, message: t("saved") };
}

const MAX_BACKGROUND_BYTES = 4 * 1024 * 1024;

/** A full-page background (letterhead) for invoices and quotes: PNG or JPEG only (what the PDF renderer draws). */
export async function uploadInvoiceBackgroundAction(form: FormData): Promise<ActionResult> {
  const { organization } = await requireAgency("agency.settings");
  const blocked = await writeBlocked(organization.id);
  if (blocked) return { ok: false, message: blocked };
  const t = await getTranslations("invoiceSettings");
  const file = form.get("background");
  if (!(file instanceof File) || file.size === 0 || file.size > MAX_BACKGROUND_BYTES) return { ok: false, message: t("invalidBackground") };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const image = detectImage(bytes);
  if (!image || !["png", "jpg"].includes(image.ext)) return { ok: false, message: t("invalidBackground") };
  const url = await putPublicFile(`organizations/${organization.id}/invoice/background-${randomUUID()}.${image.ext}`, bytes, image.mime);
  const before = await prisma.organization.findUniqueOrThrow({ where: { id: organization.id }, select: { invoiceTemplate: true } });
  const template = parseInvoiceTemplate(before.invoiceTemplate);
  await prisma.organization.update({ where: { id: organization.id }, data: { invoiceTemplate: { ...template, backgroundUrl: url } as Prisma.InputJsonValue } });
  await deleteUnlessOnInvoices(organization.id, template.backgroundUrl);
  revalidatePath("/[locale]/app/agency-settings", "page");
  return { ok: true, message: t("backgroundSaved") };
}

export async function removeInvoiceBackgroundAction(): Promise<ActionResult> {
  const { organization } = await requireAgency("agency.settings");
  const t = await getTranslations("invoiceSettings");
  const before = await prisma.organization.findUniqueOrThrow({ where: { id: organization.id }, select: { invoiceTemplate: true } });
  const template = parseInvoiceTemplate(before.invoiceTemplate);
  await prisma.organization.update({ where: { id: organization.id }, data: { invoiceTemplate: { ...template, backgroundUrl: null } as Prisma.InputJsonValue } });
  await deleteUnlessOnInvoices(organization.id, template.backgroundUrl);
  revalidatePath("/[locale]/app/agency-settings", "page");
  return { ok: true, message: t("backgroundRemoved") };
}
