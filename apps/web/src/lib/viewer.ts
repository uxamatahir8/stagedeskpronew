import "server-only";
import { headers } from "next/headers";
import { forbidden } from "next/navigation";
import { getLocale } from "next-intl/server";
import { cache } from "react";
import { can, isRole, type Permission, type Role } from "@stagedesk/core";
import { prisma, tenantDb } from "@stagedesk/db";
import { redirect } from "@/i18n/navigation";
import { auth } from "./auth";

export interface ViewerOrganization {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  role: Role;
}

export interface Viewer {
  user: { id: string; name: string; email: string; image: string | null; twoFactorEnabled: boolean };
  /** null until the user has created or joined an agency. */
  role: Role | null;
  /** The active agency; null for platform-level roles. */
  organization: ViewerOrganization | null;
  memberships: ViewerOrganization[];
  /**
   * Set when a platform admin works inside an agency as support: they act as an
   * agency admin there (no billing), behind a banner, until they leave.
   */
  support?: { organizationId: string; name: string };
}

export const getSession = cache(async () => auth.api.getSession({ headers: await headers() }));

/** The signed-in user with their active agency and role, or null when signed out. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const session = await getSession();
  if (!session) return null;

  const rows = await prisma.member.findMany({
    where: { userId: session.user.id },
    include: { organization: { select: { id: true, name: true, slug: true, logo: true } } },
    orderBy: { createdAt: "asc" },
  });
  const memberships: ViewerOrganization[] = rows
    .filter((m) => isRole(m.role))
    .map((m) => ({ ...m.organization, role: m.role as Role }));

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
    const agency = supportId ? await prisma.organization.findUnique({ where: { id: supportId }, select: { id: true, name: true, slug: true, logo: true } }) : null;
    if (agency) {
      return { user, role: "agency_admin", organization: { ...agency, role: "agency_admin" }, memberships, support: { organizationId: agency.id, name: agency.name } };
    }
    return { user, role: "platform_admin", organization: null, memberships };
  }

  const active =
    memberships.find((m) => m.id === session.session.activeOrganizationId) ?? memberships[0] ?? null;
  if (active) return { user, role: active.role, organization: active, memberships };

  if (platformRole === "affiliate") return { user, role: "affiliate", organization: null, memberships };
  return { user, role: null, organization: null, memberships };
});

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
  if (!can(viewer.role, permission)) forbidden();
  return viewer;
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
