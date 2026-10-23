import { randomBytes, randomUUID } from "node:crypto";
import { prisma } from "./client";
import { notify, platformAdminIds } from "./notifications";

export const ticketCategories = ["billing", "bookings", "payments", "account", "other"] as const;
export type TicketCategory = (typeof ticketCategories)[number];

const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const newReference = () => `T-${Array.from(randomBytes(6), (b) => alphabet[b % alphabet.length]).join("")}`;

/** Opens a ticket with its first message and tells the platform admins. */
export async function openTicket(input: { userId: string; agencyId: string | null; subject: string; category: TicketCategory; body: string }) {
  const id = randomUUID();
  const now = new Date();
  let reference = newReference();
  while (await prisma.supportTicket.findUnique({ where: { reference }, select: { id: true } })) reference = newReference();
  const ticket = await prisma.supportTicket.create({
    data: {
      id,
      reference,
      userId: input.userId,
      agencyId: input.agencyId,
      subject: input.subject.trim().slice(0, 191),
      category: input.category,
      lastMessageAt: now,
      messages: { create: { id: randomUUID(), authorId: input.userId, body: input.body.trim().slice(0, 10_000), createdAt: now } },
    },
  });
  await notify(await platformAdminIds(), { type: "ticket_new", data: { subject: ticket.subject, ref: reference }, url: `/app/support/${reference}` }, input.userId);
  return ticket;
}

/**
 * Adds a reply. A staff reply marks the ticket answered and notifies the
 * requester (who also gets an email); a requester reply reopens it for staff.
 */
export async function replyToTicket(input: { reference: string; authorId: string; fromStaff: boolean; body: string }) {
  const ticket = await prisma.supportTicket.findUniqueOrThrow({ where: { reference: input.reference }, include: { user: { select: { id: true, email: true, name: true, locale: true } } } });
  const now = new Date();
  await prisma.$transaction([
    prisma.ticketMessage.create({ data: { id: randomUUID(), ticketId: ticket.id, authorId: input.authorId, fromStaff: input.fromStaff, body: input.body.trim().slice(0, 10_000), createdAt: now } }),
    prisma.supportTicket.update({ where: { id: ticket.id }, data: { status: input.fromStaff ? "answered" : "open", lastMessageAt: now, closedAt: null } }),
  ]);
  const url = `/app/support/${ticket.reference}`;
  if (input.fromStaff) {
    await notify([ticket.userId], { type: "ticket_reply", data: { subject: ticket.subject, ref: ticket.reference }, url }, input.authorId);
  } else {
    await notify(await platformAdminIds(), { type: "ticket_new", data: { subject: ticket.subject, ref: ticket.reference }, url }, input.authorId);
  }
  return ticket;
}

export function setTicketStatus(reference: string, status: "open" | "closed") {
  return prisma.supportTicket.update({ where: { reference }, data: { status, closedAt: status === "closed" ? new Date() : null } });
}
