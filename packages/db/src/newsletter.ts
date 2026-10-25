import { localePrefix } from "@stagedesk/core";
import { randomBytes, randomUUID } from "node:crypto";
import { prisma } from "./client";
import type { Prisma } from "./generated/prisma/client";

export const subscriberStatuses = ["pending", "subscribed", "unsubscribed"] as const;
export const subscriberSources = ["footer", "signup", "profile", "admin", "waitlist"] as const;
export const campaignStatuses = ["draft", "scheduled", "sending", "sent", "cancelled"] as const;
export const campaignAudiences = ["all", "nl", "en"] as const;
export type SubscriberSource = (typeof subscriberSources)[number];
export type CampaignAudience = (typeof campaignAudiences)[number];

export class NewsletterError extends Error {
  constructor(readonly code: "not_found" | "not_editable" | "no_recipients" | "in_past" | "empty") {
    super(`Newsletter: ${code}`);
    this.name = "NewsletterError";
  }
}

const newToken = () => randomBytes(24).toString("base64url");
const normal = (email: string) => email.trim().toLowerCase();

/**
 * Adds someone to the list. Double opt-in: they stay pending until they confirm,
 * unless `confirmed` (a signed-in person with a verified address asking for it).
 * Returns what happened, so the caller knows whether to send a confirmation email.
 */
export async function subscribeNewsletter(input: { email: string; name?: string | null; locale: "nl" | "en"; source: SubscriberSource; userId?: string | null; confirmed?: boolean }) {
  const email = normal(input.email);
  const existing = await prisma.newsletterSubscriber.findUnique({ where: { email } });
  const now = new Date();
  if (existing?.status === "subscribed") return { outcome: "already" as const, subscriber: existing };
  const data = {
    name: input.name?.trim() || existing?.name || null,
    locale: input.locale,
    userId: input.userId ?? existing?.userId ?? null,
    status: input.confirmed ? "subscribed" : "pending",
    confirmedAt: input.confirmed ? now : null,
    unsubscribedAt: null,
  };
  const subscriber = existing
    ? await prisma.newsletterSubscriber.update({ where: { id: existing.id }, data: { ...data, source: existing.status === "unsubscribed" ? input.source : existing.source, token: existing.status === "unsubscribed" ? newToken() : existing.token } })
    : await prisma.newsletterSubscriber.create({ data: { ...data, id: randomUUID(), email, source: input.source, token: newToken() } });
  return { outcome: input.confirmed ? ("subscribed" as const) : ("pending" as const), subscriber };
}

/** The link in the confirmation email. Confirming twice is fine. */
export async function confirmNewsletter(token: string) {
  const s = await prisma.newsletterSubscriber.findUnique({ where: { token } });
  if (!s) return null;
  if (s.status === "subscribed") return s;
  return prisma.newsletterSubscriber.update({ where: { id: s.id }, data: { status: "subscribed", confirmedAt: new Date(), unsubscribedAt: null } });
}

/** One click from any newsletter. */
export async function unsubscribeNewsletter(token: string) {
  const s = await prisma.newsletterSubscriber.findUnique({ where: { token } });
  if (!s) return null;
  if (s.status === "unsubscribed") return s;
  return prisma.newsletterSubscriber.update({ where: { id: s.id }, data: { status: "unsubscribed", unsubscribedAt: new Date() } });
}

/** A sign-up that asked for the newsletter is confirmed by verifying the email address. */
export async function confirmPendingForEmail(email: string, userId: string) {
  return prisma.newsletterSubscriber.updateMany({
    where: { email: normal(email), status: "pending", source: "signup" },
    data: { status: "subscribed", confirmedAt: new Date(), userId },
  });
}

export async function newsletterStatusForEmail(email: string) {
  return (await prisma.newsletterSubscriber.findUnique({ where: { email: normal(email) }, select: { status: true } }))?.status ?? null;
}

/** Signed-in toggle (profile): on subscribes right away (address is verified), off unsubscribes. */
export async function setNewsletterForUser(user: { id: string; email: string; name: string; locale: "nl" | "en" }, on: boolean) {
  if (on) return subscribeNewsletter({ email: user.email, name: user.name, locale: user.locale, source: "profile", userId: user.id, confirmed: true });
  const s = await prisma.newsletterSubscriber.findUnique({ where: { email: normal(user.email) } });
  if (s && s.status !== "unsubscribed") await prisma.newsletterSubscriber.update({ where: { id: s.id }, data: { status: "unsubscribed", unsubscribedAt: new Date() } });
  return null;
}

export async function listSubscribers(input: { q?: string; status?: string; locale?: string; source?: string; sort?: string; dir?: "asc" | "desc"; skip: number; take: number }) {
  const where: Prisma.NewsletterSubscriberWhereInput = {
    ...(input.status ? { status: input.status } : {}),
    ...(input.locale ? { locale: input.locale } : {}),
    ...(input.source ? { source: input.source } : {}),
    ...(input.q ? { OR: [{ email: { contains: input.q } }, { name: { contains: input.q } }] } : {}),
  };
  const dir = input.dir ?? "desc";
  const orderBy: Prisma.NewsletterSubscriberOrderByWithRelationInput = input.sort === "email" ? { email: dir } : input.sort === "name" ? { name: dir } : input.sort === "confirmed" ? { confirmedAt: dir } : { createdAt: dir };
  const [rows, total, counts] = await Promise.all([
    prisma.newsletterSubscriber.findMany({ where, orderBy, skip: input.skip, take: input.take }),
    prisma.newsletterSubscriber.count({ where }),
    prisma.newsletterSubscriber.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  return { rows, total, counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])) as Partial<Record<string, number>> };
}

export async function deleteSubscriber(id: string) {
  await prisma.newsletterSubscriber.delete({ where: { id } });
}

/** Confirmed subscribers a campaign goes to. */
export function audienceWhere(audience: string): Prisma.NewsletterSubscriberWhereInput {
  return { status: "subscribed", ...(audience === "nl" || audience === "en" ? { locale: audience } : {}) };
}

export async function audienceSize(audience: string) {
  return prisma.newsletterSubscriber.count({ where: audienceWhere(audience) });
}

export interface CampaignInput {
  subjectNl: string;
  subjectEn: string;
  bodyNl: string;
  bodyEn: string;
  articleIds: string[];
  audience: CampaignAudience;
}

/** Creates or edits a campaign; only drafts and scheduled ones can change. */
export async function saveCampaign(id: string | null, input: CampaignInput, actorId: string) {
  if (!input.subjectNl.trim() || !input.subjectEn.trim()) throw new NewsletterError("empty");
  if (!input.bodyNl.trim() && !input.bodyEn.trim() && input.articleIds.length === 0) throw new NewsletterError("empty");
  const data = { ...input, articleIds: input.articleIds.slice(0, 12) };
  if (!id) return prisma.newsletterCampaign.create({ data: { ...data, id: randomUUID(), createdById: actorId } });
  const current = await prisma.newsletterCampaign.findUnique({ where: { id } });
  if (!current) throw new NewsletterError("not_found");
  if (!["draft", "scheduled"].includes(current.status)) throw new NewsletterError("not_editable");
  return prisma.newsletterCampaign.update({ where: { id }, data });
}

export async function scheduleCampaign(id: string, at: Date | null, now = new Date()) {
  const c = await prisma.newsletterCampaign.findUnique({ where: { id } });
  if (!c) throw new NewsletterError("not_found");
  if (!["draft", "scheduled"].includes(c.status)) throw new NewsletterError("not_editable");
  if (at && at.getTime() < now.getTime() - 60_000) throw new NewsletterError("in_past");
  return prisma.newsletterCampaign.update({ where: { id }, data: at ? { status: "scheduled", scheduledAt: at } : { status: "draft", scheduledAt: null } });
}

export async function cancelCampaign(id: string) {
  const c = await prisma.newsletterCampaign.findUnique({ where: { id } });
  if (!c) throw new NewsletterError("not_found");
  if (c.status !== "scheduled" && c.status !== "draft") throw new NewsletterError("not_editable");
  return prisma.newsletterCampaign.update({ where: { id }, data: { status: "cancelled", scheduledAt: null } });
}

/**
 * Freezes the recipient list: one delivery row per confirmed subscriber in the
 * audience, then the campaign is "sending". Safe to call twice.
 */
export async function startCampaign(id: string, now = new Date()) {
  const c = await prisma.newsletterCampaign.findUnique({ where: { id } });
  if (!c) throw new NewsletterError("not_found");
  if (c.status === "sending" || c.status === "sent") return c;
  if (!["draft", "scheduled"].includes(c.status)) throw new NewsletterError("not_editable");
  const recipients = await prisma.newsletterSubscriber.findMany({ where: audienceWhere(c.audience), select: { id: true } });
  if (recipients.length === 0) throw new NewsletterError("no_recipients");
  await prisma.newsletterDelivery.createMany({ data: recipients.map((r) => ({ id: randomUUID(), campaignId: id, subscriberId: r.id })), skipDuplicates: true });
  return prisma.newsletterCampaign.update({ where: { id }, data: { status: "sending", startedAt: now, scheduledAt: c.scheduledAt ?? now, recipients: recipients.length } });
}

/** The next batch still to send for a campaign, with what the email needs. */
export async function nextDeliveries(campaignId: string, take = 50) {
  return prisma.newsletterDelivery.findMany({
    where: { campaignId, status: "queued" },
    take,
    include: { subscriber: { select: { email: true, name: true, locale: true, token: true, status: true } } },
  });
}

export async function markDelivery(id: string, campaignId: string, result: { ok: true } | { ok: false; error: string }) {
  await prisma.$transaction([
    prisma.newsletterDelivery.update({ where: { id }, data: result.ok ? { status: "sent", sentAt: new Date(), error: null } : { status: "failed", error: result.error.slice(0, 500) } }),
    prisma.newsletterCampaign.update({ where: { id: campaignId }, data: result.ok ? { sentCount: { increment: 1 } } : { failedCount: { increment: 1 } } }),
  ]);
}

/** Marks the campaign sent once nothing is queued any more. */
export async function finishCampaignIfDone(campaignId: string) {
  const left = await prisma.newsletterDelivery.count({ where: { campaignId, status: "queued" } });
  if (left > 0) return false;
  await prisma.newsletterCampaign.updateMany({ where: { id: campaignId, status: "sending" }, data: { status: "sent", sentAt: new Date() } });
  return true;
}

/** Scheduled campaigns whose time has come. */
export async function dueCampaigns(now = new Date()) {
  return prisma.newsletterCampaign.findMany({ where: { OR: [{ status: "scheduled", scheduledAt: { lte: now } }, { status: "sending" }] }, select: { id: true } });
}

type ArticleText = { title?: string; excerpt?: string } | null;

/**
 * What a campaign email says in one language: subject, intro (English falls
 * back to Dutch) and the chosen posts as cards, in the admin's order.
 */
export async function campaignEmailContent(campaign: { subjectNl: string; subjectEn: string; bodyNl: string; bodyEn: string; articleIds: unknown }, locale: "nl" | "en", appUrl: string) {
  const ids = Array.isArray(campaign.articleIds) ? (campaign.articleIds as string[]) : [];
  const rows = ids.length ? await prisma.contentArticle.findMany({ where: { id: { in: ids } }, select: { id: true, slug: true, nl: true, en: true, coverImage: true } }) : [];
  const articles = ids.flatMap((id) => {
    const a = rows.find((r) => r.id === id);
    if (!a) return [];
    const text = ((locale === "en" ? (a.en as ArticleText) : null) ?? (a.nl as ArticleText)) || {};
    return [{ title: text.title ?? a.slug, excerpt: text.excerpt ?? "", url: `${appUrl}${localePrefix(locale)}/blog/${a.slug}`, cover: a.coverImage }];
  });
  return {
    subject: locale === "en" ? campaign.subjectEn : campaign.subjectNl,
    body: locale === "en" ? campaign.bodyEn || campaign.bodyNl : campaign.bodyNl,
    articles,
  };
}

/** Published blog posts to pick from, newest first. */
export async function campaignArticleChoices() {
  return prisma.contentArticle.findMany({
    where: { kind: "blog", status: "published", publishedAt: { lte: new Date() } },
    orderBy: { publishedAt: "desc" },
    take: 200,
    select: { id: true, slug: true, nl: true, en: true, coverImage: true, publishedAt: true },
  });
}
