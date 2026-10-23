"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import {
  AgencyAdminError,
  audit,
  createAgencyForOwner,
  deleteAgency,
  extendTrial,
  grantPlan,
  setAgencySuspended,
  updateAgencyDetails,
} from "@stagedesk/db";
import type { ActionResult } from "@/lib/actions";
import { absoluteUrl, deliver } from "@/lib/mail";
import { clientIp } from "@/lib/rate-limit";
import { requirePermission } from "@/lib/viewer";

const text = (max: number) => z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim() : null), z.string().max(max).nullable());

async function errorMessage(error: unknown) {
  const t = await getTranslations("agencyAdmin");
  if (error instanceof AgencyAdminError) return t(`error_${error.code}`);
  throw error;
}

function done(id?: string) {
  revalidatePath("/[locale]/app/agencies", "page");
  if (id) revalidatePath("/[locale]/app/agencies/[id]", "page");
}

const createSchema = z.object({
  name: z.string().trim().min(2).max(191),
  city: text(96),
  ownerName: z.string().trim().min(2).max(191),
  ownerEmail: z.email().max(191),
  locale: z.enum(["nl", "en"]),
  sendEmail: z.boolean(),
});

export type CreateAgencyResult = { ok: true; id: string; message: string } | { ok: false; message: string };

/** Sets up an agency for an owner (new or existing account) and starts the trial. */
export async function createAgencyAction(input: z.input<typeof createSchema>): Promise<CreateAgencyResult> {
  const viewer = await requirePermission("platform.agencies");
  const t = await getTranslations("agencyAdmin");
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t("invalid") };
  const d = parsed.data;
  try {
    const result = await createAgencyForOwner({ name: d.name, city: d.city, ownerName: d.ownerName, ownerEmail: d.ownerEmail, locale: d.locale });
    if (d.sendEmail) {
      deliver({
        kind: "agencyCreated",
        to: result.email,
        params: { locale: d.locale, name: d.ownerName.split(/\s+/)[0] ?? d.ownerName, agency: result.organization.name, url: absoluteUrl(d.locale, "/sign-in") },
      });
    }
    await audit({ actorId: viewer.user.id, action: "agency.create", agencyId: result.organization.id, data: { owner: result.email, newUser: result.newUser }, ip: clientIp(await headers()) });
    done();
    return { ok: true, id: result.organization.id, message: t("created", { name: result.organization.name }) };
  } catch (error) {
    return { ok: false, message: await errorMessage(error) };
  }
}

const detailsSchema = z.object({
  name: z.string().trim().min(2).max(191),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(96),
  city: text(96),
  contactEmail: z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim() : null), z.email().max(191).nullable()),
  phone: text(32),
  website: text(191),
  kvkNumber: z.preprocess((v) => (typeof v === "string" && v.trim() ? v.replace(/\s/g, "") : null), z.string().regex(/^\d{8}$/).nullable()),
  adminNotes: text(5000),
});

export async function updateAgencyAction(organizationId: string, input: z.input<typeof detailsSchema>): Promise<ActionResult> {
  const viewer = await requirePermission("platform.agencies");
  const t = await getTranslations("agencyAdmin");
  const parsed = detailsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t("invalidDetails") };
  try {
    await updateAgencyDetails(organizationId, parsed.data);
  } catch (error) {
    return { ok: false, message: await errorMessage(error) };
  }
  await audit({ actorId: viewer.user.id, action: "agency.update", agencyId: organizationId });
  done(organizationId);
  return { ok: true, message: t("saved") };
}

export async function suspendAgencyAction(organizationId: string, suspend: boolean, reason: string): Promise<ActionResult> {
  const viewer = await requirePermission("platform.agencies");
  const t = await getTranslations("agencyAdmin");
  await setAgencySuspended(organizationId, suspend, reason.trim() || null);
  await audit({ actorId: viewer.user.id, action: suspend ? "agency.suspend" : "agency.reactivate", agencyId: organizationId, data: suspend ? { reason } : null, ip: clientIp(await headers()) });
  done(organizationId);
  return { ok: true, message: t(suspend ? "suspended" : "reactivated") };
}

export async function extendTrialAction(organizationId: string, days: number): Promise<ActionResult> {
  const viewer = await requirePermission("platform.agencies");
  const t = await getTranslations("agencyAdmin");
  if (!Number.isInteger(days) || days < 1 || days > 365) return { ok: false, message: t("invalidDays") };
  try {
    await extendTrial(organizationId, days);
  } catch (error) {
    return { ok: false, message: await errorMessage(error) };
  }
  await audit({ actorId: viewer.user.id, action: "agency.extend_trial", agencyId: organizationId, data: { days } });
  done(organizationId);
  return { ok: true, message: t("trialExtended", { days }) };
}

export async function grantPlanAction(organizationId: string, planKey: string): Promise<ActionResult> {
  const viewer = await requirePermission("platform.agencies");
  const t = await getTranslations("agencyAdmin");
  try {
    await grantPlan(organizationId, planKey);
  } catch (error) {
    return { ok: false, message: await errorMessage(error) };
  }
  await audit({ actorId: viewer.user.id, action: "agency.grant_plan", agencyId: organizationId, data: { plan: planKey } });
  done(organizationId);
  return { ok: true, message: t("planGranted") };
}

export type DeleteAgencyResult = { ok: true } | { ok: false; message: string };

/** Only for agencies without bookings or payments; the confirmation must repeat the agency's name. */
export async function deleteAgencyAction(organizationId: string, confirmName: string, expectedName: string): Promise<DeleteAgencyResult> {
  const viewer = await requirePermission("platform.agencies");
  const t = await getTranslations("agencyAdmin");
  if (confirmName.trim() !== expectedName.trim()) return { ok: false, message: t("confirmMismatch") };
  try {
    await deleteAgency(organizationId);
  } catch (error) {
    return { ok: false, message: await errorMessage(error) };
  }
  await audit({ actorId: viewer.user.id, action: "agency.delete", agencyId: null, targetType: "agency", targetId: organizationId, data: { name: expectedName }, ip: clientIp(await headers()) });
  done();
  return { ok: true };
}
