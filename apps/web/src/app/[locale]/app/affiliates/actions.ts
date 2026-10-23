"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getFormatter, getTranslations } from "next-intl/server";
import { z } from "zod";
import { prisma, reviewCommission, setAffiliateStatus } from "@stagedesk/db";
import { sendAffiliateApproved } from "@stagedesk/emails";
import { getStripe, payAffiliate, syncAffiliatePromo } from "@stagedesk/payments";
import type { ActionResult } from "@/lib/actions";
import { referralLink } from "@/lib/affiliate";
import { paymentsErrorMessage } from "@/lib/billing";
import { euro } from "@/lib/format";
import { absoluteUrl, deliver, userLocale } from "@/lib/mail";
import { requirePermission } from "@/lib/viewer";

const done = () => revalidatePath("/[locale]/app", "layout");

export async function setAffiliateStatusAction(affiliateId: string, status: "approved" | "rejected" | "suspended"): Promise<ActionResult> {
  await requirePermission("platform.affiliates");
  const t = await getTranslations("affiliatesAdmin");
  const before = await prisma.affiliate.findUnique({ where: { id: affiliateId }, select: { approvedAt: true } });
  if (!before) return { ok: false, message: t("notFound") };
  const affiliate = await setAffiliateStatus(affiliateId, status);

  if (status === "approved") {
    const stripe = getStripe();
    // Without Stripe the code still works at signup; it's created in Stripe once keys are added.
    if (stripe) await syncAffiliatePromo(stripe, affiliateId).catch((error) => console.error("[affiliates] promo sync failed", error));
    if (!before.approvedAt) {
      const locale = userLocale(affiliate.user.locale);
      deliver(
        sendAffiliateApproved(affiliate.user.email, {
          locale,
          name: affiliate.user.name.split(/\s+/)[0] ?? affiliate.user.name,
          link: referralLink(affiliate.code),
          promo: affiliate.promoCode,
          url: absoluteUrl(locale, "/app"),
        }),
      );
    }
  }
  done();
  return { ok: true, message: t(`statusSaved_${status}`) };
}

/** A personal commission rate in percent, or empty to follow the tiers. */
export async function setAffiliateRateAction(affiliateId: string, percentText: string): Promise<ActionResult> {
  await requirePermission("platform.affiliates");
  const t = await getTranslations("affiliatesAdmin");
  const raw = percentText.trim().replace(",", ".");
  const value = raw === "" ? null : Number(raw);
  if (value !== null && (!Number.isFinite(value) || value < 0 || value > 100)) return { ok: false, message: t("invalidRate") };
  await prisma.affiliate.update({ where: { id: affiliateId }, data: { commissionBps: value === null ? null : Math.round(value * 100) } });
  done();
  return { ok: true, message: t("rateSaved") };
}

export async function reviewCommissionAction(commissionId: string, approve: boolean): Promise<ActionResult> {
  await requirePermission("platform.affiliates");
  const t = await getTranslations("affiliatesAdmin");
  try {
    await reviewCommission(commissionId, approve);
  } catch {
    return { ok: false, message: t("notFound") };
  }
  done();
  return { ok: true, message: approve ? t("commissionApproved") : t("commissionCancelled") };
}

/** Pays approved commissions now instead of waiting for the payout day. */
export async function payNowAction(affiliateId: string): Promise<ActionResult> {
  await requirePermission("platform.affiliates");
  const t = await getTranslations("affiliatesAdmin");
  const stripe = getStripe();
  if (!stripe) return { ok: false, message: (await getTranslations("platformPayments"))("notConfigured") };
  try {
    const paid = await payAffiliate(stripe, affiliateId);
    done();
    return paid ? { ok: true, message: t("paid", { amount: euro(await getFormatter(), paid.amountCents) }) } : { ok: false, message: t("nothingToPay") };
  } catch (error) {
    return { ok: false, message: await paymentsErrorMessage(error) };
  }
}

const assetSchema = z.object({
  id: z.string().nullable(),
  kind: z.enum(["logo", "banner", "email", "video", "other"]),
  titleNl: z.string().trim().min(1).max(120),
  titleEn: z.string().trim().min(1).max(120),
  descriptionNl: z.string().trim().max(300),
  descriptionEn: z.string().trim().max(300),
  url: z.url({ protocol: /^https?$/ }).max(500),
});

export async function saveAssetAction(input: z.input<typeof assetSchema>): Promise<ActionResult> {
  await requirePermission("platform.affiliates");
  const t = await getTranslations("affiliatesAdmin");
  const parsed = assetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t("invalidAsset") };
  const d = parsed.data;
  const data = {
    kind: d.kind,
    title: { nl: d.titleNl, en: d.titleEn },
    description: { nl: d.descriptionNl, en: d.descriptionEn },
    url: d.url,
  };
  if (d.id) await prisma.affiliateAsset.update({ where: { id: d.id }, data });
  else await prisma.affiliateAsset.create({ data: { id: randomUUID(), position: await prisma.affiliateAsset.count(), ...data } });
  done();
  return { ok: true, message: t("assetSaved") };
}

export async function deleteAssetAction(id: string): Promise<ActionResult> {
  await requirePermission("platform.affiliates");
  await prisma.affiliateAsset.deleteMany({ where: { id } });
  done();
  return { ok: true, message: (await getTranslations("affiliatesAdmin"))("assetDeleted") };
}
