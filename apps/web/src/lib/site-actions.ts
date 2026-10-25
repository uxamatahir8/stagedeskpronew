"use server";

import { randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import { isCurrency, parseViaCookie, viaCookie } from "@stagedesk/core";
import { notify, platformAdminIds, prisma, publishedArticle } from "@stagedesk/db";
import { DISPLAY_CURRENCY_COOKIE } from "@/lib/display-currency";
import { deliver, userLocale } from "@/lib/mail";
import { allow, clientIp } from "@/lib/rate-limit";
import { siteSettings } from "@/lib/site";
import { verifyTurnstile } from "@/lib/turnstile";
import { getSession } from "@/lib/viewer";

export type FormResult = { ok: true } | { ok: false; message: string };

/** Shared checks for public forms: rate limit per IP, the bot trap, and Turnstile. */
async function guard(form: FormData, key: string, max: number): Promise<string | null> {
  const t = await getTranslations("site.forms");
  const ip = clientIp(await headers());
  if (!(await allow(`${key}:${ip}`, max, 3600))) return t("tooMany");
  // Bots fill every field; people never see this one.
  if (String(form.get("website") ?? "") !== "") return "bot";
  const token = form.get("cf-turnstile-response");
  if (!(await verifyTurnstile(typeof token === "string" ? token : null, ip))) return t("captcha");
  return null;
}

const waitlistSchema = z.object({
  email: z.email().max(191),
  name: z.string().trim().max(120).optional(),
  role: z.enum(["agency", "artist", "other"]).default("agency"),
  company: z.string().trim().max(191).optional(),
});

export async function joinWaitlistAction(form: FormData): Promise<FormResult> {
  const t = await getTranslations("site.forms");
  const blocked = await guard(form, "waitlist", 10);
  // A bot gets the same thank-you as a person, so it learns nothing.
  if (blocked === "bot") return { ok: true };
  if (blocked) return { ok: false, message: blocked };
  const parsed = waitlistSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: t("invalidEmail") };
  const via = parseViaCookie((await cookies()).get(viaCookie)?.value);
  await prisma.waitlistEntry.upsert({
    where: { email: parsed.data.email.toLowerCase() },
    update: {},
    create: {
      id: randomUUID(),
      email: parsed.data.email.toLowerCase(),
      name: parsed.data.name || null,
      role: parsed.data.role,
      company: parsed.data.company || null,
      locale: userLocale(await getLocale()),
      source: via ? [via.code, via.campaign].filter(Boolean).join(":") : null,
    },
  });
  return { ok: true };
}

const contactSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.email().max(191),
  company: z.string().trim().max(191).optional(),
  message: z.string().trim().min(10).max(5000),
});

/** Sends the message to the support address set in Settings. */
export async function contactAction(form: FormData): Promise<FormResult> {
  const t = await getTranslations("site.forms");
  const blocked = await guard(form, "contact", 5);
  if (blocked === "bot") return { ok: true };
  if (blocked) return { ok: false, message: blocked };
  const parsed = contactSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: t("invalidContact") };
  const { site } = await siteSettings();
  deliver({ kind: "contactMessage", to: site.supportEmail, params: { locale: "en", ...parsed.data, company: parsed.data.company || "" } });
  return { ok: true };
}

const commentSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{1,120}$/),
  name: z.string().trim().min(2).max(120),
  email: z.email().max(191),
  body: z.string().trim().min(3).max(3000),
});

/** A reader's comment; it appears once a platform admin approves it. */
export async function commentAction(form: FormData): Promise<FormResult> {
  const t = await getTranslations("site.forms");
  const blocked = await guard(form, "comment", 10);
  if (blocked === "bot") return { ok: true };
  if (blocked) return { ok: false, message: blocked };
  const parsed = commentSchema.safeParse(Object.fromEntries(form));
  // Comments only on posts that are live.
  if (!parsed.success || !(await publishedArticle("blog", parsed.data.slug))) return { ok: false, message: t("invalidComment") };
  const session = await getSession();
  await prisma.blogComment.create({
    data: {
      id: randomUUID(),
      postSlug: parsed.data.slug,
      locale: userLocale(await getLocale()),
      authorName: parsed.data.name,
      authorEmail: parsed.data.email.toLowerCase(),
      userId: session?.user.id ?? null,
      body: parsed.data.body,
    },
  });
  await notify(await platformAdminIds(), { type: "comment_new", data: { name: parsed.data.name, slug: parsed.data.slug }, url: "/app/pages?tab=comments" });
  return { ok: true };
}

/** Remembers the currency a visitor wants to see prices in, for a year. */
export async function setDisplayCurrencyAction(currency: string) {
  if (!isCurrency(currency)) return;
  (await cookies()).set(DISPLAY_CURRENCY_COOKIE, currency, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
}
