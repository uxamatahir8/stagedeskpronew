"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { agencyPermissions, sanitizeRolePermissions } from "@stagedesk/core";
import { audit, Prisma, prisma } from "@stagedesk/db";
import { auth } from "@/lib/auth";
import { clientIp } from "@/lib/rate-limit";
import { requireAgency } from "@/lib/viewer";

/**
 * Team changes go through the server so the agency's own permission settings
 * apply: only people with "manage the team" can invite, change or remove.
 * Better Auth still checks its own rules underneath.
 */
type Result = { error: { message: string } | null };

async function run(task: () => Promise<unknown>): Promise<Result> {
  try {
    await task();
    revalidatePath("/[locale]/app/team", "page");
    return { error: null };
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : (await getTranslations("auth"))("generic");
    return { error: { message } };
  }
}

export async function inviteMemberAction(email: string, role: "agency_admin" | "agency_staff" | "artist"): Promise<Result> {
  const { organization } = await requireAgency("agency.team.manage");
  return run(async () => auth.api.createInvitation({ headers: await headers(), body: { email, role, organizationId: organization.id, resend: true } }));
}

export async function updateMemberRoleAction(memberId: string, role: string): Promise<Result> {
  const { organization } = await requireAgency("agency.team.manage");
  return run(async () => auth.api.updateMemberRole({ headers: await headers(), body: { memberId, role, organizationId: organization.id } }));
}

export async function removeMemberAction(memberId: string): Promise<Result> {
  const { organization } = await requireAgency("agency.team.manage");
  return run(async () => auth.api.removeMember({ headers: await headers(), body: { memberIdOrEmail: memberId, organizationId: organization.id } }));
}

export async function cancelInvitationAction(invitationId: string): Promise<Result> {
  const { organization } = await requireAgency("agency.team.manage");
  // Only invitations of this agency.
  const invitation = await prisma.invitation.findFirst({ where: { id: invitationId, organizationId: organization.id }, select: { id: true } });
  if (!invitation) return { error: { message: (await getTranslations("auth"))("generic") } };
  return run(async () => auth.api.cancelInvitation({ headers: await headers(), body: { invitationId } }));
}

/** The owner decides what admins and staff may do; null goes back to the defaults. */
export async function savePermissionsAction(input: unknown | null): Promise<{ ok: boolean; message: string }> {
  const { viewer, organization } = await requireAgency("agency.permissions");
  const t = await getTranslations("permissions");
  const clean = input === null ? null : { ...sanitizeRolePermissions(input), known: [...agencyPermissions] };
  // DbNull clears the column, so the defaults apply again.
  await prisma.organization.update({ where: { id: organization.id }, data: { rolePermissions: clean ?? Prisma.DbNull } });
  await audit({ actorId: viewer.user.id, action: clean ? "team.permissions" : "team.permissions_reset", agencyId: organization.id, data: clean ?? {}, ip: clientIp(await headers()) });
  revalidatePath("/[locale]/app", "layout");
  return { ok: true, message: clean ? t("saved") : t("resetDone") };
}
