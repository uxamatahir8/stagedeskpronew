import { randomUUID } from "node:crypto";
import type { Role } from "@stagedesk/core";
import { prisma } from "./client";
import type { Prisma } from "./generated/prisma/client";

export type NotificationType =
  | "new_inquiry"
  | "quote_accepted"
  | "gig_request"
  | "gig_response"
  | "payment_received"
  | "message"
  | "ticket_new"
  | "ticket_reply"
  | "reminder_event"
  | "commission_approved"
  | "comment_new";

export interface NotificationInput {
  type: NotificationType;
  /** Values for the text, e.g. { name: "Sanne", code: "K7Q2M9XA" }. */
  data: Record<string, string | number>;
  url?: string | null;
}

/** Notifies each user once (duplicates and the actor are skipped). */
export async function notify(userIds: (string | null | undefined)[], input: NotificationInput, exceptUserId?: string | null) {
  const ids = [...new Set(userIds.filter((id): id is string => Boolean(id) && id !== exceptUserId))];
  if (ids.length === 0) return 0;
  await prisma.notification.createMany({
    data: ids.map((userId) => ({ id: randomUUID(), userId, type: input.type, data: input.data as Prisma.InputJsonValue, url: input.url ?? null })),
  });
  return ids.length;
}

const deskRoles: Role[] = ["agency_owner", "agency_admin", "agency_staff"];

/** The people who run an agency's bookings (owner, admins, staff), or a narrower set of roles. */
export async function agencyDeskUserIds(organizationId: string, roles: Role[] = deskRoles) {
  const members = await prisma.member.findMany({ where: { organizationId, role: { in: roles } }, select: { userId: true } });
  return members.map((m) => m.userId);
}

export async function platformAdminIds() {
  const admins = await prisma.user.findMany({ where: { platformRole: "platform_admin", disabledAt: null }, select: { id: true } });
  return admins.map((a) => a.id);
}

export async function latestNotifications(userId: string, take = 12) {
  const [items, unread] = await Promise.all([
    prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);
  return { items, unread };
}

export async function markNotificationsRead(userId: string, ids: string[] | "all") {
  return prisma.notification.updateMany({
    where: { userId, readAt: null, ...(ids === "all" ? {} : { id: { in: ids } }) },
    data: { readAt: new Date() },
  });
}

/** One page of a user's notifications for the notifications page, newest first. */
export async function listNotifications(userId: string, { unreadOnly = false, page = 1, pageSize = 30 }: { unreadOnly?: boolean; page?: number; pageSize?: number } = {}) {
  const where = { userId, ...(unreadOnly ? { readAt: null } : {}) };
  const [items, total, unread] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, skip: (Math.max(1, page) - 1) * pageSize, take: pageSize }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);
  return { items, total, unread, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

/** Removes the user's notifications that are already read. */
export async function clearReadNotifications(userId: string) {
  return (await prisma.notification.deleteMany({ where: { userId, readAt: { not: null } } })).count;
}
