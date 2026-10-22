import { randomUUID } from "node:crypto";
import {
  type FeeRule,
  feeRuleSchema,
  type FeeSnapshot,
  fallbackLimits,
  parseLimits,
  type PlanLimits,
  resolveFeeRule,
  subscriptionAccess,
  type SubscriptionAccess,
} from "@stagedesk/core";
import { prisma } from "./client";
import { getSetting } from "./settings";
import { tenantDb } from "./tenant";

const parseFeeRule = (value: unknown): FeeRule | null => {
  const result = feeRuleSchema.safeParse(value);
  return value && result.success ? result.data : null;
};

export async function activePlans() {
  return prisma.plan.findMany({ where: { active: true }, orderBy: [{ position: "asc" }, { monthlyPriceCents: "asc" }] });
}

export interface AgencyBilling {
  subscription: Awaited<ReturnType<typeof prisma.subscription.findUnique>>;
  plan: Awaited<ReturnType<typeof prisma.plan.findUnique>>;
  limits: PlanLimits;
  access: SubscriptionAccess;
}

/** The agency's plan, limits and what its subscription allows right now. */
export async function agencyBilling(organizationId: string, now = new Date()): Promise<AgencyBilling> {
  const [subscription, { graceDays }] = await Promise.all([
    prisma.subscription.findUnique({ where: { organizationId }, include: { plan: true } }),
    getSetting("billing.defaults"),
  ]);
  return {
    subscription,
    plan: subscription?.plan ?? null,
    limits: subscription ? parseLimits(subscription.plan.limits) : fallbackLimits,
    access: subscriptionAccess(subscription, now, graceDays),
  };
}

/** Counts used by plan limits. Staff includes pending invitations, so seats can't be overrun by inviting. */
export async function agencyUsage(organizationId: string, now = new Date()) {
  const db = tenantDb(organizationId);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [maxArtists, staff, invites, maxBookingsPerMonth] = await Promise.all([
    db.artist.count({ where: { active: true } }),
    db.member.count({ where: { role: { in: ["agency_owner", "agency_admin", "agency_staff"] } } }),
    db.invitation.count({ where: { status: "pending", role: { in: ["agency_admin", "agency_staff"] }, expiresAt: { gt: now } } }),
    db.booking.count({ where: { createdAt: { gte: monthStart }, source: "manual" } }),
  ]);
  return { maxArtists, maxStaff: staff + invites, maxBookingsPerMonth, storageGb: 0 };
}

/** Starts the free trial for a new agency on the configured trial plan. Safe to call twice. */
export async function startTrial(organizationId: string, now = new Date()) {
  const existing = await prisma.subscription.findUnique({ where: { organizationId }, select: { id: true } });
  if (existing) return existing;
  const { trialPlanKey } = await getSetting("billing.defaults");
  const plan = (await prisma.plan.findUnique({ where: { key: trialPlanKey } })) ?? (await activePlans())[0];
  if (!plan) return null;
  return prisma.subscription.create({
    data: {
      id: randomUUID(),
      organizationId,
      planId: plan.id,
      status: "trialing",
      trialEndsAt: new Date(now.getTime() + plan.trialDays * 86_400_000),
    },
  });
}

/**
 * The platform fee that applies to a new booking for this agency:
 * the agency's own deal, else its plan's rule, else the platform default.
 */
export async function effectiveFeeSnapshot(organizationId: string): Promise<FeeSnapshot> {
  const [fees, org, sub] = await Promise.all([
    getSetting("fees.platform"),
    prisma.organization.findUnique({ where: { id: organizationId }, select: { feeRule: true } }),
    prisma.subscription.findUnique({ where: { organizationId }, include: { plan: { select: { feeRule: true } } } }),
  ]);
  return {
    rule: resolveFeeRule({ platform: fees.defaultRule, plan: parseFeeRule(sub?.plan.feeRule), agency: parseFeeRule(org?.feeRule) }),
    stripeFeePaidBy: fees.stripeFeePaidBy,
  };
}
