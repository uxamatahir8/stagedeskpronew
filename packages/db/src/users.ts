import { deskRoles } from "@stagedesk/core";
import { randomUUID } from "node:crypto";
import { addStaffMemberWithinSeats } from "./billing";
import { prisma } from "./client";
import type { Prisma } from "./generated/prisma/client";

export class UserAdminError extends Error {
  constructor(readonly code: "email_taken" | "not_found" | "has_history" | "is_self" | "already_member" | "not_allowed" | "seats_full") {
    super(`User: ${code}`);
    this.name = "UserAdminError";
  }
}

/** Filters on the platform users list. Roles come from `platformRole` and memberships. */
export const userFilters = ["all", "platform_admin", "affiliate", "agency", "independent", "artist", "customer", "disabled", "unverified"] as const;
export type UserFilter = (typeof userFilters)[number];

function filterWhere(filter: UserFilter): Prisma.UserWhereInput {
  switch (filter) {
    case "platform_admin":
    case "affiliate":
      return { platformRole: filter };
    // Agency teams; independent artists have their own filter.
    case "agency":
      return { members: { some: { role: { in: deskRoles.filter((r) => r !== "solo_artist") } } } };
    case "independent":
      return { members: { some: { role: "solo_artist" } } };
    case "artist":
    case "customer":
      return { members: { some: { role: filter } } };
    case "disabled":
      return { disabledAt: { not: null } };
    case "unverified":
      return { emailVerified: false };
    default:
      return {};
  }
}

/** Platform-wide user list: deliberately not tenant-scoped. */
export async function listUsers({
  q = "",
  filter = "all",
  page = 1,
  pageSize = 25,
  sort = "created",
  dir = "desc",
}: {
  q?: string;
  filter?: UserFilter;
  page?: number;
  pageSize?: number;
  sort?: "created" | "name" | "email";
  dir?: "asc" | "desc";
}) {
  const search = q.trim();
  const where: Prisma.UserWhereInput = {
    AND: [search ? { OR: [{ email: { contains: search } }, { name: { contains: search } }, { phone: { contains: search } }] } : {}, filterWhere(filter)],
  };
  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: sort === "name" ? { name: dir } : sort === "email" ? { email: dir } : { createdAt: dir },
      skip: (Math.max(1, page) - 1) * pageSize,
      take: pageSize,
      include: {
        members: { include: { organization: { select: { id: true, name: true } } } },
        sessions: { orderBy: { updatedAt: "desc" }, take: 1, select: { updatedAt: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);
  return { rows, total, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

/**
 * Makes someone a platform admin: a new account, or an existing one without a
 * platform role. A new account has no password: the web action emails a
 * one-time link to choose one (an emailed sign-in code works too).
 */
export async function createPlatformAdmin(input: { name: string; email: string; locale?: string }) {
  const email = input.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true, platformRole: true } });
  if (existing?.platformRole) throw new UserAdminError("email_taken");
  if (existing) return prisma.user.update({ where: { id: existing.id }, data: { platformRole: "platform_admin" } });
  return prisma.user.create({ data: { id: randomUUID(), name: input.name.trim(), email, locale: input.locale ?? "en", platformRole: "platform_admin" } });
}

/**
 * Name, email and phone. A new email address has to be confirmed again by the
 * user, and password links sent to the old address stop working (using one
 * confirms the account's address, which is no longer the one it went to).
 */
export async function updateUserByAdmin(id: string, input: { name: string; email: string; phone?: string | null }) {
  const user = await prisma.user.findUnique({ where: { id }, select: { email: true } });
  if (!user) throw new UserAdminError("not_found");
  const email = input.email.trim().toLowerCase();
  const changed = email !== user.email;
  if (changed && (await prisma.user.findUnique({ where: { email }, select: { id: true } }))) throw new UserAdminError("email_taken");
  const [updated] = await prisma.$transaction([
    prisma.user.update({
      where: { id },
      data: { name: input.name.trim(), email, phone: input.phone?.trim() || null, ...(changed ? { emailVerified: false } : {}) },
    }),
    ...(changed ? [prisma.verification.deleteMany({ where: { identifier: { startsWith: "reset-password:" }, value: id } })] : []),
  ]);
  return updated;
}

/** Ends every session of the user; they have to sign in again. */
export async function signOutEverywhere(id: string) {
  return (await prisma.session.deleteMany({ where: { userId: id } })).count;
}

/**
 * Deletes an account that has no history: no memberships, bookings, reviews,
 * messages, tickets or partner account. Anyone else is disabled instead, so
 * bookings and money trails stay intact.
 */
export async function deleteUserByAdmin(id: string, actorId: string) {
  if (id === actorId) throw new UserAdminError("is_self");
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      _count: { select: { members: true, bookings: true, reviews: true, bookingMessages: true, supportTickets: true, ticketMessages: true, artistProfiles: true } },
      affiliate: { select: { id: true } },
    },
  });
  if (!user) throw new UserAdminError("not_found");
  if (user.affiliate || Object.values(user._count).some((n) => n > 0)) throw new UserAdminError("has_history");
  // Sessions, sign-in methods, notifications and acceptances cascade with the user.
  await prisma.user.delete({ where: { id } });
}

/**
 * Finds the account for an email or makes one without a password (the web
 * action emails a setup link). Platform admins and disabled accounts can't be
 * given an agency role this way.
 */
async function accountFor(input: { name: string; email: string; locale: "nl" | "en"; phone?: string | null }) {
  const email = input.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true, email: true, platformRole: true, disabledAt: true } });
  if (existing && (existing.platformRole === "platform_admin" || existing.disabledAt)) throw new UserAdminError("not_allowed");
  if (existing) return { user: existing, newUser: false };
  const user = await prisma.user.create({
    data: { id: randomUUID(), name: input.name.trim(), email, locale: input.locale, phone: input.phone ?? null },
    select: { id: true, name: true, email: true, platformRole: true, disabledAt: true },
  });
  return { user, newUser: true };
}

/**
 * A platform admin adds someone to an agency's team (admin or staff) without
 * an invitation. Staff seats count as for an invitation; someone already in
 * the agency in any role is refused (change their role in the team instead).
 */
export async function addAgencyMemberByAdmin(input: { organizationId: string; name: string; email: string; role: "agency_admin" | "agency_staff"; locale: "nl" | "en" }) {
  const agency = await prisma.organization.findFirst({ where: { id: input.organizationId, kind: "agency" }, select: { id: true, name: true } });
  if (!agency) throw new UserAdminError("not_found");
  const { user, newUser } = await accountFor(input);
  const undo = async () => {
    if (newUser) await prisma.user.deleteMany({ where: { id: user.id } });
  };
  if (await prisma.member.count({ where: { organizationId: agency.id, userId: user.id } })) {
    await undo();
    throw new UserAdminError("already_member");
  }
  if (!(await addStaffMemberWithinSeats(agency.id, user.id, input.role))) {
    await undo();
    throw new UserAdminError("seats_full");
  }
  return { user: { id: user.id, name: user.name, email: user.email }, agency, newUser };
}

/** A platform admin adds a customer to an agency (the agency's own "add customer" does the same). */
export async function addAgencyCustomerByAdmin(input: { organizationId: string; name: string; email: string; phone: string | null; locale: "nl" | "en" }) {
  const agency = await prisma.organization.findFirst({ where: { id: input.organizationId, kind: { in: ["agency", "solo"] } }, select: { id: true, name: true } });
  if (!agency) throw new UserAdminError("not_found");
  const { user, newUser } = await accountFor(input);
  const membership = await prisma.member.findFirst({ where: { organizationId: agency.id, userId: user.id }, select: { role: true } });
  if (membership) {
    if (newUser) await prisma.user.deleteMany({ where: { id: user.id } });
    throw new UserAdminError("already_member");
  }
  await prisma.member.create({ data: { id: randomUUID(), organizationId: agency.id, userId: user.id, role: "customer" } });
  return { user: { id: user.id, name: user.name, email: user.email }, agency, newUser };
}
