"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { forbidden } from "next/navigation";
import { getLocale } from "next-intl/server";
import { audit, prisma } from "@stagedesk/db";
import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { clientIp } from "./rate-limit";
import { getSession } from "./viewer";

/**
 * Support mode: a platform admin works inside one agency as an agency admin.
 * It's stored on their own session row, so it can't be set from the browser
 * and ends when they sign out. Starting and leaving are audited; changes made
 * meanwhile carry the admin as actor.
 */
async function adminSession() {
  const session = await getSession();
  // The viewer's role is agency_admin while supporting, so check the account itself.
  if (!session || session.user.platformRole !== "platform_admin") forbidden();
  return session;
}

/** The role, sidebar and banner live in the dashboard layout, which client navigation keeps; refresh it. */
const refreshShell = () => revalidatePath("/[locale]/app", "layout");

/** Only paths inside the dashboard, so the parameter can't send the admin elsewhere. */
const safeNext = (next: string | undefined) => (next && /^\/app(\/[\w\-/]*)?$/.test(next) ? next : "/app");

export async function startSupportAction(organizationId: string, next?: string) {
  const session = await adminSession();
  const agency = await prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true } });
  if (!agency) forbidden();
  await prisma.session.update({ where: { id: session.session.id }, data: { supportOrganizationId: agency.id } });
  await audit({ actorId: session.user.id, action: "support.start", agencyId: agency.id, ip: clientIp(await headers()) });
  refreshShell();
  redirect({ href: safeNext(next), locale: (await getLocale()) as Locale });
}

export async function stopSupportAction() {
  const session = await adminSession();
  const agencyId = session.session.supportOrganizationId;
  await prisma.session.update({ where: { id: session.session.id }, data: { supportOrganizationId: null } });
  if (agencyId) await audit({ actorId: session.user.id, action: "support.stop", agencyId, ip: clientIp(await headers()) });
  refreshShell();
  redirect({ href: agencyId ? `/app/agencies/${agencyId}` : "/app/agencies", locale: (await getLocale()) as Locale });
}
