"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { audit, createPlatformPromoCode, prisma, PromoCodeError } from "@stagedesk/db";
import { getStripe, syncPlatformPromo } from "@stagedesk/payments";
import type { ActionResult } from "@/lib/actions";
import { paymentsErrorMessage } from "@/lib/billing";
import { requirePermission } from "@/lib/viewer";

const schema = z.object({
  code: z.string().trim().min(3).max(32),
  description: z.string().trim().max(191).nullable(),
  discountType: z.enum(["percentage", "fixed"]),
  percentBps: z.int().min(1).max(10_000).nullable(),
  amountCents: z.int().min(1).max(10_000_000).nullable(),
  duration: z.enum(["once", "repeating", "forever"]),
  durationMonths: z.int().min(1).max(36).nullable(),
  planKeys: z.array(z.string().min(1).max(48)).max(20),
  firstSubscriptionOnly: z.boolean(),
  maxRedemptions: z.int().min(1).max(1_000_000).nullable(),
  expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
});
export type PlatformPromoForm = z.input<typeof schema>;

const refresh = () => revalidatePath("/[locale]/app/subscription-codes", "page");

async function promoMessage(error: unknown) {
  const t = await getTranslations("promoCodes");
  if (error instanceof PromoCodeError) return t(`error_${error.code}` as "error_invalid");
  return paymentsErrorMessage(error);
}

/** A new code for plans; made in Stripe right away when Stripe is set up (else on first use). */
export async function createPlatformPromoAction(input: PlatformPromoForm): Promise<ActionResult> {
  const viewer = await requirePermission("platform.plans");
  const t = await getTranslations("promoCodes");
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t("error_invalid") };
  const d = parsed.data;
  try {
    const promo = await createPlatformPromoCode(
      // The end of the chosen day, Amsterdam-ish (23:59 UTC is safe for "valid until").
      { ...d, expiresAt: d.expiresAt ? new Date(`${d.expiresAt}T23:59:59Z`) : null },
      viewer.user.id,
    );
    await audit({ actorId: viewer.user.id, action: "promo.create", targetType: "platform_promo", targetId: promo.id, data: { code: promo.code } });
    const stripe = await getStripe();
    if (stripe) await syncPlatformPromo(stripe, promo.id);
    refresh();
    return { ok: true, message: t("created", { code: promo.code }) };
  } catch (error) {
    return { ok: false, message: await promoMessage(error) };
  }
}

/** Switches a code on or off, here and in Stripe. */
export async function setPlatformPromoActiveAction(id: string, active: boolean): Promise<ActionResult> {
  const viewer = await requirePermission("platform.plans");
  const t = await getTranslations("promoCodes");
  const { count } = await prisma.platformPromoCode.updateMany({ where: { id: z.string().max(64).parse(id) }, data: { active } });
  if (count === 0) return { ok: false, message: t("error_not_found") };
  await audit({ actorId: viewer.user.id, action: active ? "promo.enable" : "promo.disable", targetType: "platform_promo", targetId: id });
  try {
    const stripe = await getStripe();
    if (stripe) await syncPlatformPromo(stripe, id);
  } catch (error) {
    refresh();
    return { ok: false, message: await promoMessage(error) };
  }
  refresh();
  return { ok: true, message: active ? t("enabled") : t("disabled") };
}
