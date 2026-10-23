"use server";

import { getTranslations } from "next-intl/server";
import { feeRuleSchema, type SettingKey } from "@stagedesk/core";
import { updateTag } from "next/cache";
import { audit, Prisma, prisma, updateSetting } from "@stagedesk/db";
import { SITE_TAGS } from "@/lib/site";
import type { ActionResult } from "@/lib/actions";
import { requirePermission } from "@/lib/viewer";

const editable: SettingKey[] = ["fees.platform", "bookings.defaults", "billing.defaults", "site.general", "affiliates.program", "payments.methods"];

/** Saves one platform setting; the registry schema validates it and the change is logged. */
export async function saveSettingAction(key: SettingKey, value: unknown): Promise<ActionResult> {
  const viewer = await requirePermission("platform.settings");
  const t = await getTranslations("platformSettings");
  if (!editable.includes(key)) return { ok: false, message: t("invalid") };
  try {
    await updateSetting(key, value, viewer.user.id);
    await audit({ actorId: viewer.user.id, action: "settings.update", targetType: "setting", targetId: key });
    // The website shows fees, the waitlist switch and the partner program.
    updateTag(SITE_TAGS.settings);
    return { ok: true, message: t("saved") };
  } catch {
    return { ok: false, message: t("invalid") };
  }
}

/** A special fee deal for one agency, or null to use its plan / the platform default. */
export async function setAgencyFeeAction(organizationId: string, rule: unknown): Promise<ActionResult> {
  const viewer = await requirePermission("platform.agencies");
  const parsed = rule === null ? null : feeRuleSchema.safeParse(rule);
  if (parsed && !parsed.success) return { ok: false, message: (await getTranslations("platformSettings"))("invalid") };
  await prisma.organization.update({ where: { id: organizationId }, data: { feeRule: parsed ? parsed.data : Prisma.DbNull } });
  await audit({ actorId: viewer.user.id, action: "agency.fee_deal", agencyId: organizationId, data: { rule: parsed ? parsed.data : null } });
  return { ok: true, message: (await getTranslations("agencyFee"))("saved") };
}
