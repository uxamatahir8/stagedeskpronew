"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { audit, prisma } from "@stagedesk/db";
import type { ActionResult } from "@/lib/actions";
import { clientIp } from "@/lib/rate-limit";
import { requirePermission } from "@/lib/viewer";

/**
 * Disables or re-enables an account. Disabling ends every session at once;
 * the auth hook refuses new ones. Data is kept.
 */
export async function setUserDisabledAction(userId: string, disabled: boolean): Promise<ActionResult> {
  const viewer = await requirePermission("platform.users");
  const t = await getTranslations("users");
  if (userId === viewer.user.id) return { ok: false, message: t("notYourself") };
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) return { ok: false, message: t("notFound") };
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { disabledAt: disabled ? new Date() : null } }),
    ...(disabled ? [prisma.session.deleteMany({ where: { userId } })] : []),
  ]);
  await audit({ actorId: viewer.user.id, action: disabled ? "user.disable" : "user.enable", targetType: "user", targetId: userId, ip: clientIp(await headers()) });
  revalidatePath("/[locale]/app/users", "page");
  return { ok: true, message: t(disabled ? "disabled" : "enabled") };
}

/** For someone who can't receive the confirmation email (support confirmed their address another way). */
export async function markVerifiedAction(userId: string): Promise<ActionResult> {
  const viewer = await requirePermission("platform.users");
  const t = await getTranslations("users");
  await prisma.user.updateMany({ where: { id: userId }, data: { emailVerified: true } });
  await audit({ actorId: viewer.user.id, action: "user.verify_email", targetType: "user", targetId: userId, ip: clientIp(await headers()) });
  revalidatePath("/[locale]/app/users", "page");
  return { ok: true, message: t("verified") };
}

/** Removes two-factor sign-in for a user who lost their device (after support checked who they are). */
export async function resetTwoFactorAction(userId: string): Promise<ActionResult> {
  const viewer = await requirePermission("platform.users");
  const t = await getTranslations("users");
  await prisma.$transaction([
    prisma.twoFactor.deleteMany({ where: { userId } }),
    prisma.user.update({ where: { id: userId }, data: { twoFactorEnabled: false } }),
  ]);
  await audit({ actorId: viewer.user.id, action: "user.reset_2fa", targetType: "user", targetId: userId, ip: clientIp(await headers()) });
  revalidatePath("/[locale]/app/users", "page");
  return { ok: true, message: t("twoFactorReset") };
}
