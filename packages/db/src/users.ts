import { randomUUID } from "node:crypto";
import { prisma } from "./client";
import type { Prisma } from "./generated/prisma/client";

export class UserAdminError extends Error {
  constructor(readonly code: "email_taken" | "not_found" | "has_history" | "is_self") {
    super(`User: ${code}`);
    this.name = "UserAdminError";
  }
}

/** Filters on the platform users list. Roles come from `platformRole` and memberships. */
export const userFilters = ["all", "platform_admin", "affiliate", "agency", "artist", "customer", "disabled", "unverified"] as const;
export type UserFilter = (typeof userFilters)[number];

function filterWhere(filter: UserFilter): Prisma.UserWhereInput {
  switch (filter) {
    case "platform_admin":
    case "affiliate":
      return { platformRole: filter };
    case "agency":
      return { members: { some: { role: { in: ["agency_owner", "agency_admin", "agency_staff"] } } } };
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
 * platform role. They sign in with an email code and can set a password later.
 */
export async function createPlatformAdmin(input: { name: string; email: string; locale?: string }) {
  const email = input.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true, platformRole: true } });
  if (existing?.platformRole) throw new UserAdminError("email_taken");
  if (existing) return prisma.user.update({ where: { id: existing.id }, data: { platformRole: "platform_admin" } });
  return prisma.user.create({ data: { id: randomUUID(), name: input.name.trim(), email, locale: input.locale ?? "en", platformRole: "platform_admin" } });
}

/** Name, email and phone. A new email address has to be confirmed again by the user. */
export async function updateUserByAdmin(id: string, input: { name: string; email: string; phone?: string | null }) {
  const user = await prisma.user.findUnique({ where: { id }, select: { email: true } });
  if (!user) throw new UserAdminError("not_found");
  const email = input.email.trim().toLowerCase();
  if (email !== user.email && (await prisma.user.findUnique({ where: { email }, select: { id: true } }))) throw new UserAdminError("email_taken");
  return prisma.user.update({
    where: { id },
    data: { name: input.name.trim(), email, phone: input.phone?.trim() || null, ...(email !== user.email ? { emailVerified: false } : {}) },
  });
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
