"use server";

import { getTranslations } from "next-intl/server";
import { emailSamples, type EmailJob, type EmailKind } from "@stagedesk/emails";
import type { ActionResult } from "@/lib/actions";
import { appUrl, deliver } from "@/lib/mail";
import { allow } from "@/lib/rate-limit";
import { requirePermission } from "@/lib/viewer";

/** Sends the sample of one email to the admin's own address, through the normal queue. */
export async function sendTestEmailAction(kind: string, lang: "nl" | "en"): Promise<ActionResult> {
  const viewer = await requirePermission("platform.settings");
  const t = await getTranslations("emailPreviews");
  const samples = emailSamples(lang === "en" ? "en" : "nl", appUrl);
  if (!(kind in samples)) return { ok: false, message: t("unknown") };
  if (!(await allow(`email-test:${viewer.user.id}`, 10, 600))) return { ok: false, message: t("tooMany") };
  deliver({ kind, to: viewer.user.email, params: samples[kind as EmailKind] } as EmailJob);
  return { ok: true, message: t("sent", { email: viewer.user.email }) };
}
