"use server";

import { getLocale, getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { z } from "zod";
import { affiliateCodePattern } from "@stagedesk/core";
import { applyForAffiliate, getSetting, prisma } from "@stagedesk/db";
import { auth } from "@/lib/auth";
import { localePath } from "@/lib/paths";
import { allow, clientIp } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";
import { getViewer } from "@/lib/viewer";

export type ApplyResult = { ok: true; checkEmail: string | null } | { ok: false; message: string };

const text = (max: number) => z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim() : null), z.string().max(max).nullable());
const schema = z.object({
  name: z.string().trim().min(2).max(191),
  email: z.email().max(191).optional(),
  password: z.string().min(10).max(128).optional(),
  website: text(191),
  pitch: z.string().trim().min(20).max(2000),
  code: z.preprocess((v) => (typeof v === "string" ? v.trim().toLowerCase() : v), z.string().regex(affiliateCodePattern).or(z.literal(""))),
});

/**
 * Partner application. A visitor gets a new account (email confirmation as
 * usual); a signed-in user without any role applies with their account.
 */
export async function applyAction(form: FormData): Promise<ApplyResult> {
  const t = await getTranslations("partners");
  const program = await getSetting("affiliates.program");
  if (!program.enabled) return { ok: false, message: t("closed") };

  const ip = clientIp(await headers());
  if (!(await allow(`partner-apply:${ip}`, 5, 3600))) return { ok: false, message: t("errorRate") };
  const fields = Object.fromEntries(form);
  if (!(await verifyTurnstile(typeof fields["cf-turnstile-response"] === "string" ? fields["cf-turnstile-response"] : null, ip))) {
    return { ok: false, message: t("errorCaptcha") };
  }
  const parsed = schema.safeParse(fields);
  if (!parsed.success) return { ok: false, message: t("errorFields") };
  const d = parsed.data;

  const viewer = await getViewer();
  let userId: string;
  let checkEmail: string | null = null;
  if (viewer) {
    if (await prisma.affiliate.findUnique({ where: { userId: viewer.user.id }, select: { id: true } })) return { ok: false, message: t("alreadyApplied") };
    // Agency members and customers see their own dashboard; partners need a separate account.
    if (viewer.role) return { ok: false, message: t("useOtherAccount") };
    userId = viewer.user.id;
  } else {
    if (!d.email || !d.password) return { ok: false, message: t("errorFields") };
    if (await prisma.user.findUnique({ where: { email: d.email.toLowerCase() }, select: { id: true } })) return { ok: false, message: t("emailTaken") };
    const locale = await getLocale();
    const result = await auth.api.signUpEmail({ body: { name: d.name, email: d.email, password: d.password, locale, callbackURL: localePath(locale, "/app") } });
    userId = result.user.id;
    checkEmail = d.email;
  }

  await applyForAffiliate({ userId, name: d.name, website: d.website, pitch: d.pitch, wantedCode: d.code || null });
  return { ok: true, checkEmail };
}
