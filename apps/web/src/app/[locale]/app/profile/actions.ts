"use server";

import { prisma, setNewsletterForUser } from "@stagedesk/db";
import { requireViewer } from "@/lib/viewer";

/** The newsletter switch on the profile page, for the signed-in person's own address. */
export async function setNewsletterAction(on: boolean) {
  const viewer = await requireViewer();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: viewer.user.id }, select: { id: true, email: true, name: true, locale: true } });
  await setNewsletterForUser({ ...user, locale: user.locale === "en" ? "en" : "nl" }, on);
}
