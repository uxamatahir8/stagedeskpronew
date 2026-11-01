import { randomUUID } from "node:crypto";
import {
  type FeeRule,
  feeRuleSchema,
  type FeeSnapshot,
  fallbackLimits,
  soloLimits,
  parseLimits,
  type PlanLimits,
  resolveFeeRule,
  feeRuleInCurrency,
  subscriptionAccess,
  type SubscriptionAccess,
} from "@stagedesk/core";
import { prisma } from "./client";
import { Prisma } from "./generated/prisma/client";
import { exchangeRates } from "./rates";
import { getSetting } from "./settings";
import { tenantDb } from "./tenant";

const parseFeeRule = (value: unknown): FeeRule | null => {
  const result = feeRuleSchema.safeParse(value);
  return value && result.success ? result.data : null;
};

/** Plans on offer: agency plans by default, or the Artist plans for independent artists. */
export async function activePlans(audience: "agency" | "artist" = "agency") {
  return prisma.plan.findMany({ where: { active: true, audience }, orderBy: [{ position: "asc" }, { monthlyPriceCents: "asc" }] });
}

export interface AgencyBilling {
  subscription: Awaited<ReturnType<typeof prisma.subscription.findUnique>>;
  plan: Awaited<ReturnType<typeof prisma.plan.findUnique>>;
  limits: PlanLimits;
  access: SubscriptionAccess;
}

/** The agency's plan, limits and what its subscription allows right now. */
export async function agencyBilling(organizationId: string, now = new Date()): Promise<AgencyBilling> {
  const [subscription, { graceDays }, org] = await Promise.all([
    prisma.subscription.findUnique({ where: { organizationId }, include: { plan: true } }),
    getSetting("billing.defaults"),
    prisma.organization.findUnique({ where: { id: organizationId }, select: { kind: true } }),
  ]);
  const access = subscriptionAccess(subscription, now, graceDays);
  // An independent artist works for free; their plan only adds the public profile and direct booking.
  if (org?.kind === "solo") {
    return { subscription, plan: subscription?.plan ?? null, limits: soloLimits, access: access.level === "full" ? access : { level: "full", reason: "free", until: null } };
  }
  return {
    subscription,
    plan: subscription?.plan ?? null,
    limits: subscription ? parseLimits(subscription.plan.limits) : fallbackLimits,
    access,
  };
}

/** Roles that take a staff seat (`maxStaff`). Artists and customers don't. */
export const staffSeatRoles = ["agency_owner", "agency_admin", "agency_staff"] as const;
const seatRoles: readonly string[] = staffSeatRoles;
export const takesStaffSeat = (role: string) => seatRoles.includes(role);

/** Staff seats in use: staff members plus pending staff invitations, so seats can't be overrun by inviting. */
async function staffSeatsUsed(db: Pick<Prisma.TransactionClient, "member" | "invitation">, organizationId: string, now: Date) {
  const [staff, invites] = await Promise.all([
    db.member.count({ where: { organizationId, role: { in: [...staffSeatRoles] } } }),
    db.invitation.count({ where: { organizationId, status: "pending", role: { in: ["agency_admin", "agency_staff"] }, expiresAt: { gt: now } } }),
  ]);
  return staff + invites;
}

/** Counts used by plan limits. */
export async function agencyUsage(organizationId: string, now = new Date()) {
  const db = tenantDb(organizationId);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [maxArtists, maxStaff, maxBookingsPerMonth] = await Promise.all([
    db.artist.count({ where: { active: true } }),
    staffSeatsUsed(prisma, organizationId, now),
    db.booking.count({ where: { createdAt: { gte: monthStart }, source: "manual" } }),
  ]);
  return { maxArtists, maxStaff, maxBookingsPerMonth, storageGb: 0 };
}

export class SeatLimitError extends Error {
  constructor(readonly max: number) {
    super(`Staff seats: all ${max} in use`);
    this.name = "SeatLimitError";
  }
}

/**
 * Seat changes for one agency run one at a time: each locks the agency row,
 * counts at READ COMMITTED (so it sees what the one before it committed) and
 * writes before letting go. Two promotions, or a promotion and an invitation,
 * can't both take the last seat.
 */
async function withSeatLock<T>(organizationId: string, fn: (tx: Prisma.TransactionClient, used: number, max: number | null) => Promise<T>, now = new Date()) {
  const { limits } = await agencyBilling(organizationId, now);
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${organizationId} FOR UPDATE`;
      return fn(tx, await staffSeatsUsed(tx, organizationId, now), limits.maxStaff);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 20_000 },
  );
}

/**
 * Changes a member's role, checking staff seats when the change takes one
 * (artist to staff, admin or owner). Moving between staff roles keeps the
 * seat; becoming an artist frees it. Throws SeatLimitError when all are in use.
 */
export async function changeMemberRoleWithinSeats(organizationId: string, memberId: string, role: string, now = new Date()) {
  return withSeatLock(
    organizationId,
    async (tx, used, max) => {
      const member = await tx.member.findFirst({ where: { id: memberId, organizationId }, select: { role: true } });
      if (!member) return null;
      if (takesStaffSeat(role) && !takesStaffSeat(member.role) && max !== null && used >= max) throw new SeatLimitError(max);
      return tx.member.update({ where: { id: memberId }, data: { role } });
    },
    now,
  );
}

/**
 * Re-counts seats once a staff invitation exists: the check before creating
 * it can't see an invitation or promotion that's being made at the same time.
 * Over the limit, the invitation is canceled and this returns false.
 */
export async function confirmInvitationSeat(organizationId: string, invitationId: string, now = new Date()) {
  return withSeatLock(
    organizationId,
    async (tx, used, max) => {
      const invitation = await tx.invitation.findFirst({ where: { id: invitationId, organizationId }, select: { role: true, status: true } });
      if (!invitation || invitation.status !== "pending") return false;
      if (!takesStaffSeat(invitation.role ?? "") || max === null || used <= max) return true;
      await tx.invitation.update({ where: { id: invitationId }, data: { status: "canceled" } });
      return false;
    },
    now,
  );
}

/**
 * A trial the platform admin grants by hand, on the configured plan. New
 * agencies don't get one automatically: they choose a plan, and only plans
 * with a trial start with free days. Safe to call twice.
 */
export async function startTrial(organizationId: string, now = new Date()) {
  const existing = await prisma.subscription.findUnique({ where: { organizationId }, select: { id: true } });
  if (existing) return existing;
  const { trialPlanKey } = await getSetting("billing.defaults");
  const plan = (await prisma.plan.findUnique({ where: { key: trialPlanKey } })) ?? (await activePlans())[0];
  if (!plan) return null;
  await markTrialUsed(organizationId, now);
  return prisma.subscription.create({
    data: {
      id: randomUUID(),
      organizationId,
      planId: plan.id,
      status: "trialing",
      trialEndsAt: new Date(now.getTime() + Math.max(1, plan.trialDays) * 86_400_000),
    },
  });
}

/** An agency gets one trial: none after a previous trial or a paid subscription. */
export async function trialEligible(organizationId: string) {
  const [org, sub] = await Promise.all([
    prisma.organization.findUnique({ where: { id: organizationId }, select: { trialUsedAt: true } }),
    prisma.subscription.findUnique({ where: { organizationId }, select: { stripeSubscriptionId: true } }),
  ]);
  return Boolean(org && !org.trialUsedAt && !sub?.stripeSubscriptionId);
}

/** Free days a plan gives at checkout: 0 when the plan has no trial or the agency had one. */
export function planTrialDays(plan: { trialEnabled: boolean; trialDays: number }, eligible: boolean) {
  return eligible && plan.trialEnabled ? Math.max(0, plan.trialDays) : 0;
}

export async function markTrialUsed(organizationId: string, now = new Date()) {
  await prisma.organization.updateMany({ where: { id: organizationId, trialUsedAt: null }, data: { trialUsedAt: now } });
}

/**
 * The platform fee that applies to a new booking for this agency:
 * the agency's own deal, else its plan's rule, else the platform default.
 */
export async function effectiveFeeSnapshot(organizationId: string): Promise<FeeSnapshot> {
  const [fees, org, sub] = await Promise.all([
    getSetting("fees.platform"),
    prisma.organization.findUnique({ where: { id: organizationId }, select: { feeRule: true, currency: true } }),
    prisma.subscription.findUnique({ where: { organizationId }, include: { plan: { select: { feeRule: true } } } }),
  ]);
  const rule = resolveFeeRule({ platform: fees.defaultRule, plan: parseFeeRule(sub?.plan.feeRule), agency: parseFeeRule(org?.feeRule) });
  // Fixed amounts in the rule are euros; the booking is in the agency's currency.
  const currency = org?.currency ?? "EUR";
  return {
    rule: currency === "EUR" ? rule : feeRuleInCurrency(rule, currency, (await exchangeRates()).rates),
    stripeFeePaidBy: fees.stripeFeePaidBy,
  };
}
