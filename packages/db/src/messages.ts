import { randomUUID } from "node:crypto";
import { prisma } from "./client";
import { agencyDeskUserIds, notify } from "./notifications";

export type MessageChannel = "customer" | "artist";
export const messageChannels: MessageChannel[] = ["customer", "artist"];

/** The artist user on a booking's current assignment (pending or accepted). */
async function assignedArtistUserId(bookingId: string) {
  const assignment = await prisma.bookingAssignment.findFirst({
    where: { bookingId, status: { in: ["pending", "accepted"] } },
    orderBy: { createdAt: "desc" },
    select: { artist: { select: { userId: true } } },
  });
  return assignment?.artist.userId ?? null;
}

/** Everyone in a conversation: the agency desk plus the customer or the assigned artist. */
export async function threadParticipants(bookingId: string, channel: MessageChannel) {
  const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId }, select: { organizationId: true, customerId: true } });
  const desk = await agencyDeskUserIds(booking.organizationId);
  const other = channel === "customer" ? booking.customerId : await assignedArtistUserId(bookingId);
  return { desk, other };
}

/**
 * Posts a message, marks the conversation read for the author and notifies
 * the other side. Returns the users outside the agency who should also get
 * an email (customers and artists don't watch the dashboard all day).
 */
export async function postMessage(input: { bookingId: string; channel: MessageChannel; authorId: string; body: string }, now = new Date()) {
  const body = input.body.trim().slice(0, 5000);
  if (!body) return null;
  const booking = await prisma.booking.findUniqueOrThrow({ where: { id: input.bookingId }, select: { organizationId: true, trackingCode: true } });
  const message = await prisma.bookingMessage.create({
    data: { id: randomUUID(), organizationId: booking.organizationId, bookingId: input.bookingId, channel: input.channel, authorId: input.authorId, body, createdAt: now },
    include: { author: { select: { name: true } } },
  });
  await markThreadRead(input.authorId, input.bookingId, input.channel, now);

  const { desk, other } = await threadParticipants(input.bookingId, input.channel);
  const fromDesk = desk.includes(input.authorId);
  const recipients = fromDesk ? [other] : desk;
  const author = message.author?.name ?? "";
  await notify(
    recipients,
    {
      type: "message",
      data: { name: author, code: booking.trackingCode },
      url: `/app/messages/${booking.trackingCode}?channel=${input.channel}`,
    },
    input.authorId,
  );
  const emailTo = fromDesk && other ? await prisma.user.findUnique({ where: { id: other }, select: { id: true, email: true, name: true, locale: true } }) : null;
  return { message, emailTo, trackingCode: booking.trackingCode };
}

export function threadMessages(bookingId: string, channel: MessageChannel) {
  return prisma.bookingMessage.findMany({
    where: { bookingId, channel },
    orderBy: { createdAt: "asc" },
    take: 500,
    include: { author: { select: { id: true, name: true, image: true } } },
  });
}

export async function markThreadRead(userId: string, bookingId: string, channel: MessageChannel, at = new Date()) {
  await prisma.messageRead.upsert({
    where: { userId_bookingId_channel: { userId, bookingId, channel } },
    update: { lastReadAt: at },
    create: { userId, bookingId, channel, lastReadAt: at },
  });
}

export interface ConversationScope {
  userId: string;
  /** Agency desk: every conversation of the agency. */
  agencyId?: string;
  /** Artist: the artist conversations of bookings they're assigned to. */
  artistUserId?: string;
  /** Customer: the customer conversations of their own bookings. */
  customerId?: string;
}

/** Conversations someone can see, newest first, with unread counts. */
export async function conversations(scope: ConversationScope, take = 50) {
  const where = scope.agencyId
    ? { organizationId: scope.agencyId }
    : scope.artistUserId
      ? { channel: "artist", booking: { assignments: { some: { status: { in: ["pending", "accepted"] }, artist: { userId: scope.artistUserId } } } } }
      : { channel: "customer", booking: { customerId: scope.customerId ?? "-" } };
  const threads = await prisma.bookingMessage.groupBy({
    by: ["bookingId", "channel"],
    where,
    _max: { createdAt: true },
    orderBy: { _max: { createdAt: "desc" } },
    take,
  });
  if (threads.length === 0) return [];

  const bookingIds = [...new Set(threads.map((t) => t.bookingId))];
  const [bookings, reads, lastMessages] = await Promise.all([
    prisma.booking.findMany({
      where: { id: { in: bookingIds } },
      select: { id: true, trackingCode: true, eventType: true, eventDate: true, customer: { select: { name: true } }, organization: { select: { name: true } } },
    }),
    prisma.messageRead.findMany({ where: { userId: scope.userId, bookingId: { in: bookingIds } } }),
    Promise.all(
      threads.map((t) =>
        prisma.bookingMessage.findFirst({
          where: { bookingId: t.bookingId, channel: t.channel },
          orderBy: { createdAt: "desc" },
          select: { body: true, createdAt: true, authorId: true, author: { select: { name: true } } },
        }),
      ),
    ),
  ]);
  const unread = await Promise.all(
    threads.map((t) => {
      const read = reads.find((r) => r.bookingId === t.bookingId && r.channel === t.channel);
      return prisma.bookingMessage.count({
        where: { bookingId: t.bookingId, channel: t.channel, authorId: { not: scope.userId }, ...(read ? { createdAt: { gt: read.lastReadAt } } : {}) },
      });
    }),
  );
  return threads.flatMap((t, i) => {
    const booking = bookings.find((b) => b.id === t.bookingId);
    const last = lastMessages[i];
    return booking && last ? [{ booking, channel: t.channel as MessageChannel, last, unread: unread[i] ?? 0 }] : [];
  });
}

/** Unread messages across someone's conversations, for the sidebar badge. */
export async function unreadMessageCount(scope: ConversationScope) {
  return (await conversations(scope, 100)).reduce((sum, c) => sum + c.unread, 0);
}
