"use server";

import { randomUUID } from "node:crypto";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { feeRuleSchema, parseEuros, planLimitsSchema } from "@stagedesk/core";
import { updateTag } from "next/cache";
import { audit, Prisma, prisma } from "@stagedesk/db";
import { SITE_TAGS } from "@/lib/site";
import { getStripe, syncPlanToStripe } from "@stagedesk/payments";
import type { ActionResult } from "@/lib/actions";
import { requirePermission } from "@/lib/viewer";

const lines = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 12);

const schema = z.object({
  id: z.string().max(64).nullable(),
  key: z.string().regex(/^[a-z0-9-]{2,48}$/),
  nameNl: z.string().trim().min(1).max(80),
  nameEn: z.string().trim().min(1).max(80),
  descriptionNl: z.string().max(500),
  descriptionEn: z.string().max(500),
  monthly: z.string(),
  yearly: z.string(),
  trialEnabled: z.boolean(),
  trialDays: z.number().int().min(1).max(90),
  featuresNl: z.string().max(3000),
  featuresEn: z.string().max(3000),
  limits: planLimitsSchema,
  feeRule: feeRuleSchema.nullable(),
  recommended: z.boolean(),
  audience: z.enum(["agency", "artist"]),
  visible: z.boolean(),
  active: z.boolean(),
  position: z.number().int().min(0).max(100),
});

export async function savePlanAction(input: z.input<typeof schema>): Promise<ActionResult> {
  const viewer = await requirePermission("platform.plans");
  const t = await getTranslations("plans");
  const parsed = schema.safeParse(input);
  const monthly = parsed.success ? parseEuros(parsed.data.monthly) : null;
  const yearly = parsed.success ? parseEuros(parsed.data.yearly) : null;
  if (!parsed.success || monthly === null || yearly === null || monthly < 0 || yearly < 0) return { ok: false, message: t("invalid") };
  const d = parsed.data;

  const data = {
    name: { nl: d.nameNl, en: d.nameEn },
    description: { nl: d.descriptionNl.trim(), en: d.descriptionEn.trim() },
    monthlyPriceCents: monthly,
    yearlyPriceCents: yearly,
    trialEnabled: d.trialEnabled,
    trialDays: d.trialDays,
    features: { nl: lines(d.featuresNl), en: lines(d.featuresEn) },
    limits: d.limits,
    // DbNull clears the column, so the plan falls back to the platform default.
    feeRule: d.feeRule ?? Prisma.DbNull,
    recommended: d.recommended,
    audience: d.audience,
    visible: d.visible,
    active: d.active,
    position: d.position,
  };
  const id = d.id ?? randomUUID();
  if (d.id) {
    await prisma.plan.update({ where: { id }, data });
  } else {
    if (await prisma.plan.findUnique({ where: { key: d.key } })) return { ok: false, message: t("invalid") };
    await prisma.plan.create({ data: { ...data, id, key: d.key } });
  }
  // Only one plan is recommended at a time.
  if (d.recommended) await prisma.plan.updateMany({ where: { id: { not: id }, audience: d.audience }, data: { recommended: false } });

  const stripe = await getStripe();
  await audit({ actorId: viewer.user.id, action: "plan.save", targetType: "plan", targetId: d.key });
  // The pricing page shows plans; refresh it now.
  updateTag(SITE_TAGS.plans);
  if (!stripe) return { ok: true, message: t("savedNoStripe") };
  try {
    await syncPlanToStripe(stripe, id);
    return { ok: true, message: t("savedSynced") };
  } catch (error) {
    return { ok: true, message: t("syncFailed", { error: error instanceof Error ? error.message.slice(0, 160) : "?" }) };
  }
}

/** Pushes one plan to Stripe without changing it. */
export async function syncPlanAction(planId: string): Promise<ActionResult> {
  const viewer = await requirePermission("platform.plans");
  const t = await getTranslations("plans");
  const stripe = await getStripe();
  if (!stripe) return { ok: false, message: t("stripeMissing") };
  try {
    await syncPlanToStripe(stripe, planId);
    await audit({ actorId: viewer.user.id, action: "plan.sync", targetType: "plan", targetId: planId });
    updateTag(SITE_TAGS.plans);
    return { ok: true, message: t("syncDone") };
  } catch (error) {
    return { ok: false, message: t("syncFailed", { error: error instanceof Error ? error.message.slice(0, 160) : "?" }) };
  }
}
