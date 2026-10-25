"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { dateFormats, isTimeZone, timeFormats } from "@stagedesk/core";
import { prisma, setNewsletterForUser } from "@stagedesk/db";
import type { ActionResult } from "@/lib/actions";
import { requireViewer } from "@/lib/viewer";

/** The newsletter switch on the profile page, for the signed-in person's own address. */
export async function setNewsletterAction(on: boolean) {
  const viewer = await requireViewer();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: viewer.user.id }, select: { id: true, email: true, name: true, locale: true } });
  await setNewsletterForUser({ ...user, locale: user.locale === "en" ? "en" : "nl" }, on);
}

const datePrefsSchema = z.object({
  timeZone: z.union([z.literal(""), z.string().refine(isTimeZone)]),
  dateFormat: z.union([z.literal(""), z.enum(dateFormats)]),
  timeFormat: z.union([z.literal(""), z.enum(timeFormats)]),
});

/** The signed-in person's own date and time display; "" follows their agency or the platform. */
export async function saveDatePrefsAction(input: { timeZone: string; dateFormat: string; timeFormat: string }): Promise<ActionResult> {
  const viewer = await requireViewer();
  const t = await getTranslations("dateTime");
  const parsed = datePrefsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t("invalid") };
  const { timeZone, dateFormat, timeFormat } = parsed.data;
  await prisma.user.update({ where: { id: viewer.user.id }, data: { timeZone: timeZone || null, dateFormat: dateFormat || null, timeFormat: timeFormat || null } });
  revalidatePath("/[locale]/app", "layout");
  return { ok: true, message: t("saved") };
}
