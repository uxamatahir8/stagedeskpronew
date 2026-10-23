"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { audit, createPlatformAdmin, deleteUserByAdmin, prisma, signOutEverywhere, updateUserByAdmin, UserAdminError } from "@stagedesk/db";
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

async function userError(error: unknown) {
  const t = await getTranslations("users");
  if (error instanceof UserAdminError) return t(`error_${error.code}`);
  throw error;
}

const adminSchema = z.object({ name: z.string().trim().min(2).max(191), email: z.email().max(191), locale: z.enum(["nl", "en"]) });

/** A new platform admin (or an existing account promoted). They sign in with an email code. */
export async function createPlatformAdminAction(input: z.input<typeof adminSchema>): Promise<ActionResult> {
  const viewer = await requirePermission("platform.users");
  const t = await getTranslations("users");
  const parsed = adminSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t("invalid") };
  try {
    const user = await createPlatformAdmin(parsed.data);
    await audit({ actorId: viewer.user.id, action: "user.create_admin", targetType: "user", targetId: user.id, data: { email: user.email }, ip: clientIp(await headers()) });
    revalidatePath("/[locale]/app/users", "page");
    return { ok: true, message: t("adminCreated", { name: user.name }) };
  } catch (error) {
    return { ok: false, message: await userError(error) };
  }
}

const editSchema = z.object({
  name: z.string().trim().min(2).max(191),
  email: z.email().max(191),
  phone: z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim() : null), z.string().max(32).nullable()),
});

export async function updateUserAction(userId: string, input: z.input<typeof editSchema>): Promise<ActionResult> {
  const viewer = await requirePermission("platform.users");
  const t = await getTranslations("users");
  const parsed = editSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t("invalid") };
  try {
    await updateUserByAdmin(userId, parsed.data);
    await audit({ actorId: viewer.user.id, action: "user.update", targetType: "user", targetId: userId, data: { email: parsed.data.email }, ip: clientIp(await headers()) });
    revalidatePath("/[locale]/app/users", "page");
    return { ok: true, message: t("saved") };
  } catch (error) {
    return { ok: false, message: await userError(error) };
  }
}

export async function signOutEverywhereAction(userId: string): Promise<ActionResult> {
  const viewer = await requirePermission("platform.users");
  const t = await getTranslations("users");
  const count = await signOutEverywhere(userId);
  await audit({ actorId: viewer.user.id, action: "user.sign_out", targetType: "user", targetId: userId, data: { sessions: count }, ip: clientIp(await headers()) });
  revalidatePath("/[locale]/app/users", "page");
  return { ok: true, message: t("signedOut", { count }) };
}

/** Only for accounts without history; the rest are disabled instead. */
export async function deleteUserAction(userId: string): Promise<ActionResult> {
  const viewer = await requirePermission("platform.users");
  const t = await getTranslations("users");
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    await deleteUserByAdmin(userId, viewer.user.id);
    await audit({ actorId: viewer.user.id, action: "user.delete", targetType: "user", targetId: userId, data: { email: user?.email }, ip: clientIp(await headers()) });
    revalidatePath("/[locale]/app/users", "page");
    return { ok: true, message: t("deleted") };
  } catch (error) {
    return { ok: false, message: await userError(error) };
  }
}
