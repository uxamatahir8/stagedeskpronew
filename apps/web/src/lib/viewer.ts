import "server-only";
import { cookies, headers } from "next/headers";
import { connection } from "next/server";
import { forbidden } from "next/navigation";
import { getLocale } from "next-intl/server";
import { cache } from "react";
import { isRole, type Permission, permissionsFor, type Role, sanitizeRolePermissions } from "@stagedesk/core";
import { prisma, setImpersonatorLookup, tenantDb } from "@stagedesk/db";
import { redirect } from "@/i18n/navigation";
import { auth } from "./auth";

export interface ViewerOrganization {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  /** ISO 4217; what new bookings and the agency's totals are in. */
  currency: string;
  /** The owner's choices for admins and staff (cleaned), or null for the defaults. */
  rolePermissions: ReturnType<typeof sanitizeRolePermissions> | null;
  role: Role;
}

export interface Viewer {
  user: { id: string; name: string; email: string; image: string | null; twoFactorEnabled: boolean };
  /** null until the user has created or joined an agency. */
  role: Role | null;
  /** The active agency; null for platform-level roles. */
  organization: ViewerOrganization | null;
  memberships: ViewerOrganization[];
  /** Everything this person may do here: their role, adjusted by the agency's own settings. */
  permissions: Permission[];
  /**
   * Set when a platform admin works inside an agency as support: they act as an
   * agency admin there (no billing), behind a banner, until they leave.
   */
  support?: { organizationId: string; name: string };
  /** The platform admin's user id when an admin is logged in as this user ("log in as"); null otherwise. */
  impersonatedBy: string | null;
}

/**
 * The session is request data: `connection()` says so up front, so Next.js
 * never tries to prerender past it (Better Auth checks expiry with Date.now()).
 */
export const getSession = cache(async () => {
  await connection();
  return auth.api.getSession({ headers: await headers() });
});

/**
 * Changes made while an admin is logged in as someone else name the admin in the audit log too.
 * This reads the session row straight from the cookie: asking Better Auth instead (getSession)
 * inside the action that swaps sessions would see the request's old, deleted session and clear
 * the new cookie.
 */
setImpersonatorLookup(async () => {
  const store = await cookies();
  const signed = store.get("__Secure-better-auth.session_token")?.value ?? store.get("better-auth.session_token")?.value;
  // The cookie is "<token>.<signature>"; the token alone finds the session.
  const token = signed ? decodeURIComponent(signed).split(".")[0] : null;
  if (!token) return null;
  return (await prisma.session.findUnique({ where: { token }, select: { impersonatedBy: true } }))?.impersonatedBy ?? null;
});

/** The signed-in user with their active agency and role, or null when signed out. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const session = await getSession();
  if (!session) return null;
  const viewer = await resolveViewer(session);
  return { ...viewer, impersonatedBy: session.session.impersonatedBy ?? null };
});

async function resolveViewer(session: NonNullable<Awaited<ReturnType<typeof getSession>>>): Promise<Omit<Viewer, "impersonatedBy">> {

  const rows = await prisma.member.findMany({
    where: { userId: session.user.id },
    include: { organization: { select: { id: true, name: true, slug: true, logo: true, currency: true, rolePermissions: true } } },
    orderBy: { createdAt: "asc" },
  });
  const memberships: ViewerOrganization[] = rows
    .filter((m) => isRole(m.role))
    .map((m) => ({ ...m.organization, rolePermissions: m.organization.rolePermissions ? sanitizeRolePermissions(m.organization.rolePermissions) : null, role: m.role as Role }));

  const user = {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    image: session.user.image ?? null,
    twoFactorEnabled: Boolean(session.user.twoFactorEnabled),
  };

  const platformRole = session.user.platformRole;
  if (platformRole === "platform_admin") {
    const supportId = session.session.supportOrganizationId;
    const agency = supportId ? await prisma.organization.findUnique({ where: { id: supportId }, select: { id: true, name: true, slug: true, logo: true, currency: true } }) : null;
    // Support works with the default admin rights, whatever the agency chose for its own admins.
    if (agency) {
      return { user, role: "agency_admin", organization: { ...agency, rolePermissions: null, role: "agency_admin" }, memberships, permissions: permissionsFor("agency_admin"), support: { organizationId: agency.id, name: agency.name } };
    }
    return { user, role: "platform_admin", organization: null, memberships, permissions: permissionsFor("platform_admin") };
  }

  const active =
    memberships.find((m) => m.id === session.session.activeOrganizationId) ?? memberships[0] ?? null;
  if (active) return { user, role: active.role, organization: active, memberships, permissions: permissionsFor(active.role, active.rolePermissions) };

  if (platformRole === "affiliate") return { user, role: "affiliate", organization: null, memberships, permissions: permissionsFor("affiliate") };
  return { user, role: null, organization: null, memberships, permissions: [] };
}

async function goTo(href: string): Promise<never> {
  redirect({ href, locale: (await getLocale()) as "nl" | "en" });
  throw new Error("unreachable");
}

/** For pages that need a signed-in user with a role. Sends others to sign-in or onboarding. */
export async function requireViewer(): Promise<Viewer & { role: Role }> {
  const viewer = await getViewer();
  if (!viewer) return goTo("/sign-in");
  if (!viewer.role) return goTo("/onboarding");
  return viewer as Viewer & { role: Role };
}

/** Like requireViewer, and answers 403 when the role lacks the permission. */
export async function requirePermission(permission: Permission) {
  const viewer = await requireViewer();
  if (!viewer.permissions.includes(permission)) forbidden();
  return viewer;
}

/** Whether the signed-in person may do something here (for showing or hiding controls). */
export function viewerCan(viewer: Pick<Viewer, "permissions">, permission: Permission) {
  return viewer.permissions.includes(permission);
}

/**
 * The active agency with a database client scoped to it. Use this for every
 * read or write of agency data so another agency's rows are unreachable.
 */
export async function requireAgency(permission: Permission) {
  const viewer = await requirePermission(permission);
  if (!viewer.organization) forbidden();
  return { viewer, organization: viewer.organization, db: tenantDb(viewer.organization.id) };
}
