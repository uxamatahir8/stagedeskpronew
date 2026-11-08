import { randomUUID } from "node:crypto";
import { AGENCY_INVITE_REPEAT_DAYS, AGENCY_INVITES_PER_DAY, type AgencyInviteKind, type CancellationReason } from "@stagedesk/core";
import { prisma } from "./client";

/**
 * Growth records that sit above the agencies: invites to join StageDesk and
 * the reasons agencies give when they cancel. Both use agencyId-style fields,
 * so they stay out of tenantDb.
 */

/** Stores why an agency cancelled; one row per cancellation. */
export async function recordCancellationFeedback(input: { agencyId: string; userId: string | null; reason: CancellationReason; note: string | null }) {
  return prisma.cancellationFeedback.create({
    data: { id: randomUUID(), agencyId: input.agencyId, userId: input.userId, reason: input.reason, note: input.note?.trim() || null },
  });
}

export class AgencyInviteError extends Error {
  constructor(readonly code: "self" | "already_on" | "already_invited" | "limit") {
    super(`Agency invite: ${code}`);
    this.name = "AgencyInviteError";
  }
}

/**
 * Records an invite for someone to start an agency on StageDesk. Refuses
 * the inviter's own address, someone who already runs an agency here, a
 * repeat to the same address within AGENCY_INVITE_REPEAT_DAYS and more than
 * AGENCY_INVITES_PER_DAY a day. The caller sends the email.
 */
export async function createAgencyInvite(input: { email: string; kind: AgencyInviteKind; inviterUserId: string; inviterAgencyId: string | null }, now = new Date()) {
  const email = input.email.trim().toLowerCase();
  const inviter = await prisma.user.findUniqueOrThrow({ where: { id: input.inviterUserId }, select: { email: true } });
  if (inviter.email.toLowerCase() === email) throw new AgencyInviteError("self");
  const runsAgency = await prisma.member.findFirst({
    where: { user: { email }, role: { in: ["agency_owner", "agency_admin"] }, organization: { kind: "agency" } },
    select: { id: true },
  });
  if (runsAgency) throw new AgencyInviteError("already_on");
  const [today, repeat] = await Promise.all([
    prisma.agencyInvite.count({ where: { inviterUserId: input.inviterUserId, createdAt: { gte: new Date(now.getTime() - 86_400_000) } } }),
    prisma.agencyInvite.findFirst({
      where: { inviterUserId: input.inviterUserId, email, createdAt: { gte: new Date(now.getTime() - AGENCY_INVITE_REPEAT_DAYS * 86_400_000) } },
      select: { id: true },
    }),
  ]);
  if (repeat) throw new AgencyInviteError("already_invited");
  if (today >= AGENCY_INVITES_PER_DAY) throw new AgencyInviteError("limit");
  return prisma.agencyInvite.create({
    data: { id: randomUUID(), email, kind: input.kind, inviterUserId: input.inviterUserId, inviterAgencyId: input.inviterAgencyId, createdAt: now },
  });
}

/** Marks open invites to this address as joined by the new agency (called when an agency is created). */
export async function markInvitesJoined(email: string, agencyId: string, now = new Date()) {
  const { count } = await prisma.agencyInvite.updateMany({
    where: { email: email.trim().toLowerCase(), joinedAgencyId: null, joinedAt: null },
    data: { joinedAgencyId: agencyId, joinedAt: now },
  });
  return count;
}

/** The latest invites someone sent, for their own page (an agency's, or an artist's own). */
export async function invitesSent(where: { inviterAgencyId: string } | { inviterUserId: string; kind: AgencyInviteKind }) {
  return prisma.agencyInvite.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, email: true, createdAt: true, joinedAt: true, joinedAgency: { select: { name: true } } },
  });
}
