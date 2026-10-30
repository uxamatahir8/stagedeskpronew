"use server";

import { APIError } from "better-auth/api";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import { audit } from "@stagedesk/db";
import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import type { ActionResult } from "./actions";
import { auth } from "./auth";
import { clientIp } from "./rate-limit";
import { getSession, requirePermission } from "./viewer";

/**
 * "Log in as": a platform admin continues as another user, with that user's
 * rights, until they return or an hour passes. The auth plugin
 * (impersonation-plugin.ts) does the session swap and refuses everyone but
 * platform admins; starting and returning are audited.
 */

const errorKeys: Record<string, "impersonateDisabled" | "notFound" | "notYourself" | "impersonateAlready"> = {
  ACCOUNT_DISABLED: "impersonateDisabled",
  USER_NOT_FOUND: "notFound",
  SELF: "notYourself",
  ALREADY_IMPERSONATING: "impersonateAlready",
};

export async function startImpersonationAction(userId: string): Promise<ActionResult> {
  const viewer = await requirePermission("platform.users");
  const t = await getTranslations("users");
  const requestHeaders = await headers();
  try {
    await auth.api.startImpersonation({ body: { userId }, headers: requestHeaders });
  } catch (error) {
    if (!(error instanceof APIError)) throw error;
    const key = errorKeys[String(error.body?.code ?? "")];
    return { ok: false, message: key ? t(key) : (await getTranslations("auth"))("generic") };
  }
  await audit({ actorId: viewer.user.id, action: "impersonation.start", targetType: "user", targetId: userId, ip: clientIp(requestHeaders) });
  revalidatePath("/[locale]/app", "layout");
  redirect({ href: "/app", locale: (await getLocale()) as Locale });
  return { ok: true };
}

/** Back to the admin's own account (or signed out, if that session ended meanwhile). */
export async function stopImpersonationAction() {
  const session = await getSession();
  const locale = (await getLocale()) as Locale;
  const adminId = session?.session.impersonatedBy;
  if (!session || !adminId) return redirect({ href: "/app", locale });
  const requestHeaders = await headers();
  const { restored } = await auth.api.stopImpersonation({ headers: requestHeaders });
  await audit({ actorId: adminId, action: "impersonation.stop", targetType: "user", targetId: session.user.id, ip: clientIp(requestHeaders) });
  revalidatePath("/[locale]/app", "layout");
  redirect({ href: restored ? `/app/users?q=${encodeURIComponent(session.user.email)}` : "/sign-in", locale });
}
