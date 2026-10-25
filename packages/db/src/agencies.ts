import { randomUUID } from "node:crypto";
import { subscriptionAccess } from "@stagedesk/core";
import { startTrial } from "./billing";
import { prisma } from "./client";
import type { Prisma } from "./generated/prisma/client";
import { getSetting } from "./settings";

export class AgencyAdminError extends Error {
  constructor(readonly code: "slug_taken" | "not_found" | "has_bookings" | "owner_is_admin" | "plan_not_found" | "pays_through_stripe") {
    super(`Agency: ${code}`);
    this.name = "AgencyAdminError";
  }
}

/** suspended | trialing | active | past_due | unpaid | canceled | incomplete | none */
export const agencyStatusFilters = ["suspended", "trialing", "active", "past_due", "canceled", "none"] as const;
export type AgencyStatusFilter = (typeof agencyStatusFilters)[number];

/** The platform admin's agency list: search, filter by status and plan, page by page. */
export async function listAgencies(input: {
  q?: string;
  status?: AgencyStatusFilter | null;
  planKey?: string | null;
  page?: number;
  pageSize?: number;
  sort?: "created" | "name" | "bookings" | "members";
  dir?: "asc" | "desc";
}) {
  const pageSize = input.pageSize ?? 25;
  const page = Math.max(1, input.page ?? 1);
  const q = input.q?.trim();
  const and: Prisma.OrganizationWhereInput[] = [];
  if (q) {
    and.push({
      OR: [
        { name: { contains: q } },
        { slug: { contains: q } },
        { city: { contains: q } },
        { kvkNumber: { contains: q } },
        { members: { some: { role: "agency_owner", user: { email: { contains: q } } } } },
      ],
    });
  }
  if (input.status === "suspended") and.push({ suspendedAt: { not: null } });
  else if (input.status === "none") and.push({ subscription: { is: null } });
  else if (input.status) and.push({ suspendedAt: null, subscription: { is: { status: input.status } } });
  if (input.planKey) and.push({ subscription: { is: { plan: { key: input.planKey } } } });
  const where: Prisma.OrganizationWhereInput = and.length ? { AND: and } : {};

  const [rows, total] = await Promise.all([
    prisma.organization.findMany({
      where,
      orderBy:
        input.sort === "name"
          ? { name: input.dir ?? "asc" }
          : input.sort === "bookings"
            ? { bookings: { _count: input.dir ?? "desc" } }
            : input.sort === "members"
              ? { members: { _count: input.dir ?? "desc" } }
              : { createdAt: input.dir ?? "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        _count: { select: { members: true, bookings: true, artists: true } },
        members: { where: { role: "agency_owner" }, take: 1, include: { user: { select: { name: true, email: true } } } },
        subscription: { include: { plan: { select: { key: true, name: true } } } },
      },
    }),
    prisma.organization.count({ where }),
  ]);
  return { rows, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "bureau"
  );
}

/** A slug for a new business that no other one uses. */
export async function freeSlug(name: string) {
  const base = slugify(name);
  for (let i = 1; i < 50; i++) {
    const slug = i === 1 ? base : `${base}-${i}`;
    if (!(await prisma.organization.findUnique({ where: { slug }, select: { id: true } }))) return slug;
  }
  return `${base}-${randomUUID().slice(0, 6)}`;
}

/**
 * Creates an agency for someone (the platform admin sets it up for them).
 * The owner gets an account if they don't have one; they sign in with an
 * emailed code and can set a password later. Like any new agency it starts
 * without a plan; the owner chooses one, or the admin grants or extends one.
 */
export async function createAgencyForOwner(input: { name: string; city: string | null; ownerName: string; ownerEmail: string; locale: "nl" | "en" }) {
  const email = input.ownerEmail.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true, platformRole: true } });
  if (existing?.platformRole === "platform_admin") throw new AgencyAdminError("owner_is_admin");
  const userId = existing?.id ?? randomUUID();
  const organizationId = randomUUID();
  await prisma.$transaction(async (tx) => {
    if (!existing) await tx.user.create({ data: { id: userId, name: input.ownerName.trim(), email, locale: input.locale } });
    await tx.organization.create({ data: { id: organizationId, name: input.name.trim(), slug: await freeSlug(input.name), city: input.city } });
    await tx.member.create({ data: { id: randomUUID(), organizationId, userId, role: "agency_owner" } });
  });
  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
  return { organization, ownerId: userId, newUser: !existing, email };
}

export async function updateAgencyDetails(
  organizationId: string,
  data: { name: string; slug: string; city: string | null; contactEmail: string | null; phone: string | null; website: string | null; kvkNumber: string | null; adminNotes: string | null },
) {
  const clash = await prisma.organization.findFirst({ where: { slug: data.slug, id: { not: organizationId } }, select: { id: true } });
  if (clash) throw new AgencyAdminError("slug_taken");
  return prisma.organization.update({ where: { id: organizationId }, data });
}

/** Suspending locks the agency team out and takes the booking page offline; nothing is deleted. */
export async function setAgencySuspended(organizationId: string, suspended: boolean, reason: string | null) {
  return prisma.organization.update({
    where: { id: organizationId },
    data: suspended ? { suspendedAt: new Date(), suspendReason: reason?.slice(0, 191) || null } : { suspendedAt: null, suspendReason: null },
  });
}

/** Adds days to the trial (from today if it already ended). */
export async function extendTrial(organizationId: string, days: number, now = new Date()) {
  const sub = await prisma.subscription.findUnique({ where: { organizationId } });
  if (!sub) {
    const created = await startTrial(organizationId, now);
    if (!created) throw new AgencyAdminError("plan_not_found");
    return extendTrial(organizationId, days, now);
  }
  const from = sub.trialEndsAt && sub.trialEndsAt > now ? sub.trialEndsAt : now;
  return prisma.subscription.update({
    where: { organizationId },
    data: { status: sub.stripeSubscriptionId && sub.status === "active" ? sub.status : "trialing", trialEndsAt: new Date(from.getTime() + days * 86_400_000), pastDueSince: null },
  });
}

/**
 * Puts the agency on a plan without Stripe (a partner deal, a test account).
 * It stays active until changed; an agency that later pays through Stripe
 * gets its own subscription instead.
 */
export async function grantPlan(organizationId: string, planKey: string) {
  const plan = await prisma.plan.findUnique({ where: { key: planKey } });
  if (!plan) throw new AgencyAdminError("plan_not_found");
  // A free plan on top of a running Stripe subscription would leave Stripe charging; cancel that first.
  const current = await prisma.subscription.findUnique({ where: { organizationId }, select: { stripeSubscriptionId: true, status: true } });
  if (current?.stripeSubscriptionId && ["active", "trialing", "past_due", "unpaid"].includes(current.status)) throw new AgencyAdminError("pays_through_stripe");
  return prisma.subscription.upsert({
    where: { organizationId },
    update: { planId: plan.id, status: "active", complimentary: true, pastDueSince: null, cancelAtPeriodEnd: false },
    create: { id: randomUUID(), organizationId, planId: plan.id, status: "active", complimentary: true },
  });
}

/**
 * Deletes an agency that never did business (no bookings). Agencies with
 * bookings keep their records for the books; suspend those instead.
 */
export async function deleteAgency(organizationId: string) {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, _count: { select: { bookings: true, payments: true, invoices: true, ledger: true } } },
  });
  if (!org) throw new AgencyAdminError("not_found");
  const c = org._count;
  if (c.bookings + c.payments + c.invoices + c.ledger > 0) throw new AgencyAdminError("has_bookings");
  await prisma.$transaction([
    prisma.referral.updateMany({ where: { referringAgencyId: organizationId }, data: { referringAgencyId: null } }),
    prisma.organization.delete({ where: { id: organizationId } }),
  ]);
}

/** Everything the admin's agency page shows. */
export async function agencyOverview(organizationId: string, now = new Date()) {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    include: {
      members: { orderBy: { createdAt: "asc" }, include: { user: { select: { id: true, name: true, email: true, emailVerified: true, disabledAt: true } } } },
      invitations: { where: { status: "pending" }, select: { id: true, email: true, role: true, expiresAt: true } },
      subscription: { include: { plan: true } },
      connectedAccounts: { where: { artistId: null }, select: { chargesEnabled: true, payoutsEnabled: true } },
      referral: { include: { affiliate: { include: { user: { select: { name: true } } } }, referringAgency: { select: { name: true } } } },
    },
  });
  if (!org) return null;
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [{ graceDays }, bookingsByStatus, artists, customers, bookedValue, received, receivedMonth, recent, activity] = await Promise.all([
    getSetting("billing.defaults"),
    prisma.booking.groupBy({ by: ["status"], where: { organizationId }, _count: { _all: true } }),
    prisma.artist.count({ where: { organizationId, active: true } }),
    prisma.member.count({ where: { organizationId, role: "customer" } }),
    prisma.booking.aggregate({ where: { organizationId, status: { in: ["booked", "confirmed", "completed", "settled"] } }, _sum: { totalCents: true } }),
    prisma.payment.aggregate({ where: { organizationId }, _sum: { amountCents: true } }),
    prisma.payment.aggregate({ where: { organizationId, receivedAt: { gte: monthStart } }, _sum: { amountCents: true } }),
    prisma.booking.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, trackingCode: true, status: true, eventType: true, eventDate: true, totalCents: true, currency: true, customer: { select: { name: true } } },
    }),
    prisma.auditEvent.findMany({ where: { agencyId: organizationId }, orderBy: { createdAt: "desc" }, take: 10 }),
  ]);
  return {
    org,
    access: subscriptionAccess(org.subscription, now, graceDays),
    stats: {
      bookingsByStatus: Object.fromEntries(bookingsByStatus.map((b) => [b.status, b._count._all])) as Record<string, number>,
      artists,
      customers,
      bookedCents: bookedValue._sum.totalCents ?? 0,
      receivedCents: received._sum.amountCents ?? 0,
      receivedMonthCents: receivedMonth._sum.amountCents ?? 0,
    },
    recent,
    activity,
  };
}

/** Every booking on the platform, for the admin's overview: deliberately not tenant-scoped. */
export async function listAllBookings({
  q = "",
  status = null,
  organizationId = null,
  source = null,
  page = 1,
  pageSize = 25,
  sort = "created",
  dir = "desc",
}: {
  q?: string;
  status?: string | null;
  organizationId?: string | null;
  source?: string | null;
  page?: number;
  pageSize?: number;
  sort?: "created" | "date" | "total" | "status";
  dir?: "asc" | "desc";
}) {
  const search = q.trim();
  const where: Prisma.BookingWhereInput = {
    ...(status ? { status } : {}),
    ...(organizationId ? { organizationId } : {}),
    ...(source ? { source } : {}),
    ...(search
      ? {
          OR: [
            { trackingCode: { contains: search.toUpperCase() } },
            { customer: { is: { OR: [{ name: { contains: search } }, { email: { contains: search } }] } } },
            { venueCity: { contains: search } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      orderBy:
        sort === "date"
          ? [{ eventDate: { sort: dir, nulls: "last" } }, { createdAt: "desc" }]
          : sort === "total"
            ? [{ totalCents: dir }]
            : sort === "status"
              ? [{ status: dir }, { createdAt: "desc" }]
              : [{ createdAt: dir }],
      skip: (Math.max(1, page) - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        trackingCode: true,
        status: true,
        eventType: true,
        eventDate: true,
        venueCity: true,
        source: true,
        totalCents: true,
        currency: true,
        createdAt: true,
        createdById: true,
        organization: { select: { id: true, name: true } },
        customer: { select: { name: true, email: true } },
      },
    }),
    prisma.booking.count({ where }),
  ]);
  return { rows, total, pages: Math.max(1, Math.ceil(total / pageSize)) };
}
