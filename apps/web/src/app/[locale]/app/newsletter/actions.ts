"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import {
  audit,
  campaignAudiences,
  campaignEmailContent,
  cancelCampaign,
  deleteSubscriber,
  NewsletterError,
  prisma,
  saveCampaign,
  scheduleCampaign,
  startCampaign,
  subscribeNewsletter,
} from "@stagedesk/db";
import { previewEmailJob } from "@stagedesk/emails";
import type { ActionResult } from "@/lib/actions";
import { appUrl, deliver } from "@/lib/mail";
import { systemQueue } from "@/lib/system-queue";
import { requirePermission } from "@/lib/viewer";

const campaignSchema = z.object({
  subjectNl: z.string().trim().max(191),
  subjectEn: z.string().trim().max(191),
  bodyNl: z.string().max(20_000),
  bodyEn: z.string().max(20_000),
  articleIds: z.array(z.string().max(64)).max(12),
  audience: z.enum(campaignAudiences),
});
export type CampaignForm = z.infer<typeof campaignSchema>;

async function failure(error: unknown): Promise<ActionResult & { id?: string }> {
  const t = await getTranslations("newsletter");
  if (error instanceof NewsletterError) return { ok: false, message: t(`error_${error.code}`) };
  throw error;
}

const refresh = (id?: string) => {
  revalidatePath("/[locale]/app/newsletter", "page");
  if (id) revalidatePath("/[locale]/app/newsletter/[id]", "page");
};

export async function saveCampaignAction(id: string | null, input: CampaignForm): Promise<ActionResult & { id?: string }> {
  const viewer = await requirePermission("platform.newsletter");
  const t = await getTranslations("newsletter");
  const parsed = campaignSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t("error_empty") };
  try {
    const c = await saveCampaign(id, parsed.data, viewer.user.id);
    await audit({ actorId: viewer.user.id, action: "newsletter.save", targetType: "newsletter", targetId: c.id });
    refresh(c.id);
    return { ok: true, message: t("saved"), id: c.id };
  } catch (error) {
    return failure(error);
  }
}

/** The email exactly as a subscriber would get it, from the unsaved form, for the preview pane. */
export async function previewCampaignAction(input: CampaignForm, locale: "nl" | "en"): Promise<string> {
  await requirePermission("platform.newsletter");
  const content = await campaignEmailContent(input, locale, appUrl);
  const rendered = await previewEmailJob({ kind: "newsletter", to: "preview@stagedesk.local", params: { locale, ...content, subject: content.subject || "—", unsubscribeUrl: `${appUrl}/newsletter/unsubscribe` } });
  return rendered.html;
}

/** Sends the campaign as it is now to one address, in one language. Nothing is recorded as sent. */
export async function sendTestAction(id: string, email: string, locale: "nl" | "en"): Promise<ActionResult> {
  await requirePermission("platform.newsletter");
  const t = await getTranslations("newsletter");
  const to = z.email().safeParse(email.trim());
  if (!to.success) return { ok: false, message: t("invalidEmail") };
  const campaign = await prisma.newsletterCampaign.findUnique({ where: { id } });
  if (!campaign) return { ok: false, message: t("error_not_found") };
  const content = await campaignEmailContent(campaign, locale, appUrl);
  deliver({ kind: "newsletter", to: to.data, params: { locale, ...content, subject: `[TEST] ${content.subject}`, unsubscribeUrl: `${appUrl}/newsletter/unsubscribe?token=test` } });
  return { ok: true, message: t("testSent", { email: to.data }) };
}

/** Freezes the recipient list and hands the sending to the worker. */
export async function sendNowAction(id: string): Promise<ActionResult> {
  const viewer = await requirePermission("platform.newsletter");
  const t = await getTranslations("newsletter");
  try {
    const c = await startCampaign(id);
    await audit({ actorId: viewer.user.id, action: "newsletter.send", targetType: "newsletter", targetId: id, data: { recipients: c.recipients } });
    // The worker's minute job also picks up anything still "sending", so nothing is lost if this fails.
    await systemQueue.add("newsletter-send", { campaignId: id }, { removeOnComplete: 100, removeOnFail: 500 }).catch((e) => console.error("[newsletter] queue", e));
    refresh(id);
    return { ok: true, message: t("sendingStarted") };
  } catch (error) {
    return failure(error);
  }
}

/** `at` is an ISO date-time from the form, or null to go back to draft. */
export async function scheduleAction(id: string, at: string | null): Promise<ActionResult> {
  const viewer = await requirePermission("platform.newsletter");
  const t = await getTranslations("newsletter");
  const when = at ? new Date(at) : null;
  if (when && Number.isNaN(when.getTime())) return { ok: false, message: t("error_in_past") };
  try {
    await scheduleCampaign(id, when);
    await audit({ actorId: viewer.user.id, action: "newsletter.schedule", targetType: "newsletter", targetId: id, data: { at } });
    refresh(id);
    return { ok: true, message: when ? t("scheduled", { date: when.toLocaleString() }) : t("unscheduled") };
  } catch (error) {
    return failure(error);
  }
}

export async function cancelAction(id: string): Promise<ActionResult> {
  const viewer = await requirePermission("platform.newsletter");
  const t = await getTranslations("newsletter");
  try {
    await cancelCampaign(id);
    await audit({ actorId: viewer.user.id, action: "newsletter.cancel", targetType: "newsletter", targetId: id });
    refresh(id);
    return { ok: true, message: t("cancelled") };
  } catch (error) {
    return failure(error);
  }
}

const subscriberSchema = z.object({ email: z.email().max(191), name: z.string().trim().max(191), locale: z.enum(["nl", "en"]) });

/** Adding by hand is for people who already gave permission, so they're subscribed right away. */
export async function addSubscriberAction(input: z.input<typeof subscriberSchema>): Promise<ActionResult> {
  const viewer = await requirePermission("platform.newsletter");
  const t = await getTranslations("newsletter");
  const parsed = subscriberSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t("invalidEmail") };
  const { outcome } = await subscribeNewsletter({ ...parsed.data, source: "admin", confirmed: true });
  await audit({ actorId: viewer.user.id, action: "newsletter.subscriber", targetType: "subscriber", targetId: parsed.data.email, data: { added: true } });
  refresh();
  return { ok: true, message: outcome === "already" ? t("already") : t("added") };
}

export async function unsubscribeSubscriberAction(id: string): Promise<ActionResult> {
  const viewer = await requirePermission("platform.newsletter");
  const t = await getTranslations("newsletter");
  await prisma.newsletterSubscriber.update({ where: { id }, data: { status: "unsubscribed", unsubscribedAt: new Date() } });
  await audit({ actorId: viewer.user.id, action: "newsletter.subscriber", targetType: "subscriber", targetId: id, data: { unsubscribed: true } });
  refresh();
  return { ok: true, message: t("unsubscribedAction") };
}

export async function deleteSubscriberAction(id: string): Promise<ActionResult> {
  const viewer = await requirePermission("platform.newsletter");
  const t = await getTranslations("newsletter");
  await deleteSubscriber(id);
  await audit({ actorId: viewer.user.id, action: "newsletter.subscriber", targetType: "subscriber", targetId: id, data: { deleted: true } });
  refresh();
  return { ok: true, message: t("deleted") };
}
