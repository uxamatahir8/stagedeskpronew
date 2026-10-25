"use server";

import { headers } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import { subscribeNewsletter } from "@stagedesk/db";
import { absoluteUrl, deliver } from "@/lib/mail";
import { allow, clientIp } from "@/lib/rate-limit";

export type SubscribeResult = { ok: true; message: string } | { ok: false; message: string };

const email = z.email().max(191);

/**
 * The box on the sign-up form. No separate confirmation mail: verifying the
 * account's email address confirms it (auth-config, afterEmailVerification),
 * so an address someone else typed in is never mailed.
 */
export async function signupNewsletterAction(raw: string, name: string) {
  const parsed = email.safeParse(raw.trim());
  if (!parsed.success) return;
  if (!(await allow(`newsletter:${clientIp(await headers())}`, 8, 600))) return;
  const locale = (await getLocale()) === "en" ? "en" : "nl";
  await subscribeNewsletter({ email: parsed.data, name: name.slice(0, 191), locale, source: "signup" });
}

/**
 * The footer form (and any public form): double opt-in, so the address only
 * starts receiving mail after the link in the confirmation email is clicked.
 */
export async function subscribeNewsletterAction(raw: string, source: "footer" | "waitlist" = "footer"): Promise<SubscribeResult> {
  const t = await getTranslations("newsletter");
  const parsed = email.safeParse(raw.trim());
  if (!parsed.success) return { ok: false, message: t("invalidEmail") };
  if (!(await allow(`newsletter:${clientIp(await headers())}`, 8, 600))) return { ok: false, message: t("tooMany") };
  const locale = (await getLocale()) === "en" ? "en" : "nl";
  const { outcome, subscriber } = await subscribeNewsletter({ email: parsed.data, locale, source });
  if (outcome === "already") return { ok: true, message: t("already") };
  deliver({ kind: "newsletterConfirm", to: subscriber.email, params: { locale, name: subscriber.name, url: absoluteUrl(locale, `/newsletter/confirm?token=${subscriber.token}`) } });
  return { ok: true, message: t("checkInbox") };
}
