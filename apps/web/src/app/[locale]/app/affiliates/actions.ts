"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getFormatter, getTranslations } from "next-intl/server";
import { z } from "zod";
import { affiliateCodePattern, promoCodePattern } from "@stagedesk/core";
import { AffiliateAdminError, audit, createAffiliateByAdmin, deleteAffiliateByAdmin, prisma, reviewCommission, setAffiliateStatus, updateAffiliateByAdmin } from "@stagedesk/db";
import { getStripe, payAffiliate, syncAffiliatePromo } from "@stagedesk/payments";
import type { ActionResult } from "@/lib/actions";
import { referralLink } from "@/lib/affiliate";
import { paymentsErrorMessage } from "@/lib/billing";
import { euro } from "@/lib/format";
import { absoluteUrl, deliver, userLocale } from "@/lib/mail";
import { requirePermission } from "@/lib/viewer";

const done = () => revalidatePath("/[locale]/app", "layout");

export async function setAffiliateStatusAction(affiliateId: string, status: "approved" | "rejected" | "suspended"): Promise<ActionResult> {
  const viewer = await requirePermission("platform.affiliates");
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
      deliver({
        kind: "affiliateApproved",
        to: affiliate.user.email,
        params: {
          locale,
          name: affiliate.user.name.split(/\s+/)[0] ?? affiliate.user.name,
          link: referralLink(affiliate.code),
          promo: affiliate.promoCode,
          url: absoluteUrl(locale, "/app"),
        },
      });
    }
  }
  await audit({ actorId: viewer.user.id, action: "affiliate.status", targetType: "affiliate", targetId: affiliateId, data: { status } });
  done();
  return { ok: true, message: t(`statusSaved_${status}`) };
}

export async function reviewCommissionAction(commissionId: string, approve: boolean): Promise<ActionResult> {
  const viewer = await requirePermission("platform.affiliates");
  const t = await getTranslations("affiliatesAdmin");
  try {
    await reviewCommission(commissionId, approve);
  } catch {
    return { ok: false, message: t("notFound") };
  }
  await audit({ actorId: viewer.user.id, action: approve ? "affiliate.commission_approve" : "affiliate.commission_cancel", targetType: "commission", targetId: commissionId });
  done();
  return { ok: true, message: approve ? t("commissionApproved") : t("commissionCancelled") };
}

/** Pays approved commissions now instead of waiting for the payout day. */
export async function payNowAction(affiliateId: string): Promise<ActionResult> {
  const viewer = await requirePermission("platform.affiliates");
  const t = await getTranslations("affiliatesAdmin");
  const stripe = getStripe();
  if (!stripe) return { ok: false, message: (await getTranslations("platformPayments"))("notConfigured") };
  try {
    const paid = await payAffiliate(stripe, affiliateId);
    if (paid) await audit({ actorId: viewer.user.id, action: "affiliate.pay_now", targetType: "affiliate", targetId: affiliateId, data: { cents: paid.amountCents } });
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

const partnerSchema = z.object({
  name: z.string().trim().min(2).max(191),
  email: z.email().max(191),
  code: z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim().toLowerCase() : null), z.string().regex(affiliateCodePattern).nullable()),
  website: z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim() : null), z.string().max(191).nullable()),
  ratePercent: z.string().trim().max(6),
  locale: z.enum(["nl", "en"]),
  sendEmail: z.boolean(),
});

/** Parses "25" or "27,5" into basis points; empty means "follow the tiers". */
function rateToBps(text: string): number | null | "invalid" {
  if (!text.trim()) return null;
  const n = Number(text.replace(",", "."));
  return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n * 100) : "invalid";
}

async function affiliateError(error: unknown) {
  const t = await getTranslations("affiliatesAdmin");
  if (error instanceof AffiliateAdminError) return t(`error_${error.code}`);
  throw error;
}

/** The admin adds a partner directly; they're approved straight away. */
export async function createPartnerAction(input: z.input<typeof partnerSchema>): Promise<ActionResult> {
  const viewer = await requirePermission("platform.affiliates");
  const t = await getTranslations("affiliatesAdmin");
  const parsed = partnerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t("invalidPartner") };
  const bps = rateToBps(parsed.data.ratePercent);
  if (bps === "invalid") return { ok: false, message: t("invalidRate") };
  try {
    const { affiliate } = await createAffiliateByAdmin({ ...parsed.data, commissionBps: bps });
    const stripe = getStripe();
    if (stripe) await syncAffiliatePromo(stripe, affiliate.id).catch((error) => console.error("[affiliates] promo sync failed", error));
    if (parsed.data.sendEmail) {
      const locale = parsed.data.locale;
      deliver({
        kind: "affiliateApproved",
        to: affiliate.user.email,
        params: { locale, name: parsed.data.name.split(/\s+/)[0] ?? parsed.data.name, link: referralLink(affiliate.code), promo: affiliate.promoCode, url: absoluteUrl(locale, "/sign-in") },
      });
    }
    await audit({ actorId: viewer.user.id, action: "affiliate.create", targetType: "affiliate", targetId: affiliate.id, data: { email: affiliate.user.email } });
  } catch (error) {
    return { ok: false, message: await affiliateError(error) };
  }
  done();
  return { ok: true, message: t("partnerCreated") };
}

const editSchema = z.object({
  code: z.string().trim().toLowerCase().regex(affiliateCodePattern),
  promoCode: z.string().trim().toUpperCase().regex(promoCodePattern),
  website: z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim() : null), z.string().max(191).nullable()),
  pitch: z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim() : null), z.string().max(2000).nullable()),
  ratePercent: z.string().trim().max(6),
});

export async function updatePartnerAction(affiliateId: string, input: z.input<typeof editSchema>): Promise<ActionResult> {
  const viewer = await requirePermission("platform.affiliates");
  const t = await getTranslations("affiliatesAdmin");
  const parsed = editSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t("invalidCodes") };
  const bps = rateToBps(parsed.data.ratePercent);
  if (bps === "invalid") return { ok: false, message: t("invalidRate") };
  try {
    await updateAffiliateByAdmin(affiliateId, { ...parsed.data, commissionBps: bps });
    const stripe = getStripe();
    if (stripe) await syncAffiliatePromo(stripe, affiliateId).catch((error) => console.error("[affiliates] promo sync failed", error));
  } catch (error) {
    return { ok: false, message: await affiliateError(error) };
  }
  await audit({ actorId: viewer.user.id, action: "affiliate.update", targetType: "affiliate", targetId: affiliateId });
  done();
  return { ok: true, message: t("partnerSaved") };
}

export async function deletePartnerAction(affiliateId: string): Promise<ActionResult> {
  const viewer = await requirePermission("platform.affiliates");
  const t = await getTranslations("affiliatesAdmin");
  try {
    const affiliate = await deleteAffiliateByAdmin(affiliateId);
    await audit({ actorId: viewer.user.id, action: "affiliate.delete", targetType: "affiliate", targetId: affiliateId, data: { code: affiliate.code } });
  } catch (error) {
    return { ok: false, message: await affiliateError(error) };
  }
  done();
  return { ok: true, message: t("partnerDeleted") };
}
