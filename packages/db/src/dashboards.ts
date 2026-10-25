import { lastMonths } from "./analytics";
import { prisma } from "./client";
import { Prisma } from "./generated/prisma/client";

/**
 * Figures for the role dashboards. Everything is aggregated in the database;
 * month series come back oldest first with zeros where nothing happened.
 */

type MonthRow = { month: string; total: bigint | number | string | null };
const series = (rows: MonthRow[], months: string[]) => months.map((month) => ({ month, value: Number(rows.find((r) => r.month === month)?.total ?? 0) }));
const n = (v: unknown) => Number(v ?? 0);

/** Start of this month and of the month before (UTC). */
function monthBounds(now = new Date()) {
  const thisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return { thisMonth, lastMonth };
}

// ─── Agency ──────────────────────────────────────────────────────────────────

export async function agencyDashboard(organizationId: string, now = new Date()) {
  const months = lastMonths(12, now);
  const since = new Date(`${months[0]}-01T00:00:00Z`);
  const { thisMonth, lastMonth } = monthBounds(now);
  const yearAgo = new Date(now.getTime() - 365 * 86_400_000);
  const ninetyDays = new Date(now.getTime() - 90 * 86_400_000);
  const in30 = new Date(now.getTime() + 30 * 86_400_000);
  const org = Prisma.sql`organizationId = ${organizationId}`;

  const [
    inquiryRows,
    wonRows,
    inquiriesNow,
    inquiriesPrev,
    wonNow,
    wonPrev,
    bookedNow,
    bookedPrev,
    collectedNow,
    collectedPrev,
    quotesSent,
    quotesAccepted,
    avgValue,
    outstanding,
    upcoming,
    statuses,
    types,
    sources,
    methods,
    topCustomers,
    cities,
    reviews,
    pipeline,
  ] = await Promise.all([
    prisma.$queryRaw<MonthRow[]>(Prisma.sql`SELECT DATE_FORMAT(createdAt, '%Y-%m') AS month, COUNT(*) AS total FROM bookings WHERE ${org} AND createdAt >= ${since} GROUP BY month`),
    prisma.$queryRaw<MonthRow[]>(Prisma.sql`SELECT DATE_FORMAT(bookedAt, '%Y-%m') AS month, COUNT(*) AS total FROM bookings WHERE ${org} AND bookedAt >= ${since} AND status <> 'cancelled' GROUP BY month`),
    prisma.booking.count({ where: { organizationId, createdAt: { gte: thisMonth } } }),
    prisma.booking.count({ where: { organizationId, createdAt: { gte: lastMonth, lt: thisMonth } } }),
    prisma.booking.count({ where: { organizationId, bookedAt: { gte: thisMonth }, status: { not: "cancelled" } } }),
    prisma.booking.count({ where: { organizationId, bookedAt: { gte: lastMonth, lt: thisMonth }, status: { not: "cancelled" } } }),
    prisma.booking.aggregate({ where: { organizationId, bookedAt: { gte: thisMonth }, status: { not: "cancelled" } }, _sum: { totalCents: true } }),
    prisma.booking.aggregate({ where: { organizationId, bookedAt: { gte: lastMonth, lt: thisMonth }, status: { not: "cancelled" } }, _sum: { totalCents: true } }),
    prisma.payment.aggregate({ where: { organizationId, receivedAt: { gte: thisMonth } }, _sum: { amountCents: true } }),
    prisma.payment.aggregate({ where: { organizationId, receivedAt: { gte: lastMonth, lt: thisMonth } }, _sum: { amountCents: true } }),
    prisma.quote.count({ where: { organizationId, createdAt: { gte: ninetyDays }, status: { not: "draft" } } }),
    prisma.quote.count({ where: { organizationId, createdAt: { gte: ninetyDays }, status: "accepted" } }),
    prisma.booking.aggregate({ where: { organizationId, bookedAt: { gte: yearAgo }, status: { not: "cancelled" }, totalCents: { gt: 0 } }, _avg: { totalCents: true } }),
    prisma.$queryRaw<{ total: unknown; count: unknown }[]>(
      Prisma.sql`SELECT SUM(totalCents - paidCents) AS total, COUNT(*) AS count FROM bookings WHERE ${org} AND status IN ('booked','confirmed','completed') AND totalCents > paidCents`,
    ),
    prisma.booking.aggregate({ where: { organizationId, status: { in: ["booked", "confirmed"] }, eventDate: { gte: now, lte: in30 } }, _sum: { totalCents: true }, _count: { _all: true } }),
    prisma.booking.groupBy({ by: ["status"], where: { organizationId }, _count: { _all: true } }),
    prisma.booking.groupBy({ by: ["eventType"], where: { organizationId, createdAt: { gte: yearAgo } }, _count: { _all: true } }),
    prisma.booking.groupBy({ by: ["source"], where: { organizationId, createdAt: { gte: yearAgo } }, _count: { _all: true } }),
    prisma.payment.groupBy({ by: ["method"], where: { organizationId, receivedAt: { gte: yearAgo }, kind: { not: "refund" } }, _sum: { amountCents: true } }),
    prisma.booking.groupBy({
      by: ["customerId"],
      where: { organizationId, customerId: { not: null }, status: { notIn: ["cancelled", "declined", "inquiry", "quoted", "expired"] } },
      _sum: { totalCents: true },
      _count: { _all: true },
      orderBy: { _sum: { totalCents: "desc" } },
      take: 6,
    }),
    prisma.booking.groupBy({ by: ["venueCity"], where: { organizationId, venueCity: { not: null }, createdAt: { gte: yearAgo } }, _count: { _all: true }, orderBy: { _count: { venueCity: "desc" } }, take: 6 }),
    prisma.review.groupBy({ by: ["rating"], where: { organizationId, status: "approved" }, _count: { _all: true } }),
    // The year's bookings by how far they got.
    prisma.booking.groupBy({ by: ["status"], where: { organizationId, createdAt: { gte: yearAgo } }, _count: { _all: true } }),
  ]);

  const customerNames = await prisma.user.findMany({ where: { id: { in: topCustomers.map((c) => c.customerId!) } }, select: { id: true, name: true } });
  const count = (rows: { status: string; _count: { _all: number } }[], ...s: string[]) => rows.filter((r) => s.includes(r.status)).reduce((t, r) => t + r._count._all, 0);
  const ratingTotal = reviews.reduce((t, r) => t + r._count._all, 0);

  return {
    inquiriesByMonth: series(inquiryRows, months),
    wonByMonth: series(wonRows, months),
    kpis: {
      inquiries: { current: inquiriesNow, previous: inquiriesPrev },
      won: { current: wonNow, previous: wonPrev },
      booked: { current: n(bookedNow._sum.totalCents), previous: n(bookedPrev._sum.totalCents) },
      collected: { current: n(collectedNow._sum.amountCents), previous: n(collectedPrev._sum.amountCents) },
      conversion: quotesSent ? Math.round((quotesAccepted / quotesSent) * 100) : null,
      quotesSent,
      quotesAccepted,
      averageValue: Math.round(n(avgValue._avg.totalCents)),
      outstanding: { cents: n(outstanding[0]?.total), bookings: n(outstanding[0]?.count) },
      next30: { cents: n(upcoming._sum.totalCents), bookings: upcoming._count._all },
    },
    statuses: statuses.map((s) => ({ key: s.status, value: s._count._all })),
    eventTypes: types.map((t) => ({ key: t.eventType, value: t._count._all })),
    sources: sources.map((s) => ({ key: s.source, value: s._count._all })),
    paymentMethods: methods.map((m) => ({ key: m.method, value: n(m._sum.amountCents) })),
    topCustomers: topCustomers.map((c) => ({ key: c.customerId!, label: customerNames.find((u) => u.id === c.customerId)?.name ?? "—", value: n(c._sum.totalCents), bookings: c._count._all })),
    cities: cities.map((c) => ({ key: c.venueCity!, value: c._count._all })),
    rating: {
      count: ratingTotal,
      average: ratingTotal ? reviews.reduce((t, r) => t + r.rating * r._count._all, 0) / ratingTotal : null,
      byStars: [5, 4, 3, 2, 1].map((s) => ({ stars: s, count: reviews.find((r) => r.rating === s)?._count._all ?? 0 })),
    },
    funnel: {
      inquiries: pipeline.reduce((t, r) => t + r._count._all, 0),
      quoted: count(pipeline, "quoted", "booked", "confirmed", "completed", "settled", "expired", "cancelled"),
      booked: count(pipeline, "booked", "confirmed", "completed", "settled", "cancelled"),
      done: count(pipeline, "completed", "settled"),
    },
  };
}

// ─── Platform admin ──────────────────────────────────────────────────────────

export async function adminDashboard(now = new Date()) {
  const months = lastMonths(12, now);
  const since = new Date(`${months[0]}-01T00:00:00Z`);
  const { thisMonth, lastMonth } = monthBounds(now);
  const ninetyDays = new Date(now.getTime() - 90 * 86_400_000);

  const [userRows, gmvRows, subsByPlan, subsByStatus, bookingStatuses, topAgencies, gmvNow, gmvPrev, agenciesNow, agenciesPrev, usersNow, usersPrev, bookingsNow, bookingsPrev, leads, tickets, newsletter, plans] =
    await Promise.all([
      prisma.$queryRaw<MonthRow[]>(Prisma.sql`SELECT DATE_FORMAT(createdAt, '%Y-%m') AS month, COUNT(*) AS total FROM users WHERE createdAt >= ${since} GROUP BY month`),
      prisma.$queryRaw<MonthRow[]>(
        Prisma.sql`SELECT DATE_FORMAT(bookedAt, '%Y-%m') AS month, SUM(totalCents) AS total FROM bookings WHERE bookedAt >= ${since} AND status <> 'cancelled' AND currency = 'EUR' GROUP BY month`,
      ),
      prisma.subscription.groupBy({ by: ["planId"], where: { status: { in: ["active", "trialing", "past_due"] } }, _count: { _all: true } }),
      prisma.subscription.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.booking.groupBy({ by: ["status"], where: { createdAt: { gte: since } }, _count: { _all: true } }),
      prisma.booking.groupBy({
        by: ["organizationId"],
        where: { bookedAt: { gte: ninetyDays }, status: { not: "cancelled" }, currency: "EUR" },
        _sum: { totalCents: true },
        orderBy: { _sum: { totalCents: "desc" } },
        take: 6,
      }),
      prisma.booking.aggregate({ where: { bookedAt: { gte: thisMonth }, status: { not: "cancelled" }, currency: "EUR" }, _sum: { totalCents: true } }),
      prisma.booking.aggregate({ where: { bookedAt: { gte: lastMonth, lt: thisMonth }, status: { not: "cancelled" }, currency: "EUR" }, _sum: { totalCents: true } }),
      prisma.organization.count({ where: { createdAt: { gte: thisMonth } } }),
      prisma.organization.count({ where: { createdAt: { gte: lastMonth, lt: thisMonth } } }),
      prisma.user.count({ where: { createdAt: { gte: thisMonth } } }),
      prisma.user.count({ where: { createdAt: { gte: lastMonth, lt: thisMonth } } }),
      prisma.booking.count({ where: { createdAt: { gte: thisMonth } } }),
      prisma.booking.count({ where: { createdAt: { gte: lastMonth, lt: thisMonth } } }),
      prisma.lead.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.supportTicket.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.newsletterSubscriber.count({ where: { status: "subscribed" } }),
      prisma.plan.findMany({ select: { id: true, name: true, key: true } }),
    ]);
  const orgNames = await prisma.organization.findMany({ where: { id: { in: topAgencies.map((a) => a.organizationId) } }, select: { id: true, name: true } });
  const leadCount = (s: string) => leads.find((l) => l.status === s)?._count._all ?? 0;
  return {
    usersByMonth: series(userRows, months),
    gmvByMonth: series(gmvRows, months),
    kpis: {
      gmv: { current: n(gmvNow._sum.totalCents), previous: n(gmvPrev._sum.totalCents) },
      agencies: { current: agenciesNow, previous: agenciesPrev },
      users: { current: usersNow, previous: usersPrev },
      bookings: { current: bookingsNow, previous: bookingsPrev },
      newsletter,
    },
    subscriptionsByPlan: subsByPlan.map((s) => {
      const plan = plans.find((p) => p.id === s.planId);
      return { key: plan?.key ?? s.planId, name: (plan?.name ?? {}) as Record<string, string>, value: s._count._all };
    }),
    subscriptionsByStatus: subsByStatus.map((s) => ({ key: s.status, value: s._count._all })),
    bookingStatuses: bookingStatuses.map((s) => ({ key: s.status, value: s._count._all })),
    topAgencies: topAgencies.map((a) => ({ key: a.organizationId, label: orgNames.find((o) => o.id === a.organizationId)?.name ?? "—", value: n(a._sum.totalCents) })),
    leadFunnel: { total: leads.reduce((t, l) => t + l._count._all, 0), offered: leadCount("offered") + leadCount("assigned"), assigned: leadCount("assigned"), closed: leadCount("closed") },
    tickets: tickets.map((t) => ({ key: t.status, value: t._count._all })),
  };
}

// ─── Artist ──────────────────────────────────────────────────────────────────

export async function artistDashboard(userId: string, now = new Date()) {
  const months = lastMonths(12, now);
  const since = new Date(`${months[0]}-01T00:00:00Z`);
  const artistIds = (await prisma.artist.findMany({ where: { userId }, select: { id: true } })).map((a) => a.id);
  if (artistIds.length === 0) return null;
  const ids = Prisma.join(artistIds);
  const [earnRows, gigRows, answered, types, agencies, rating] = await Promise.all([
    // The artist's share of gigs that took place, by event month.
    prisma.$queryRaw<MonthRow[]>(Prisma.sql`
      SELECT DATE_FORMAT(b.eventDate, '%Y-%m') AS month, SUM(FLOOR(b.totalCents * a.shareBps / 10000)) AS total
        FROM booking_assignments a JOIN bookings b ON b.id = a.bookingId
       WHERE a.artistId IN (${ids}) AND a.status = 'accepted' AND b.status IN ('completed','settled') AND b.eventDate >= ${since}
       GROUP BY month`),
    prisma.$queryRaw<MonthRow[]>(Prisma.sql`
      SELECT DATE_FORMAT(b.eventDate, '%Y-%m') AS month, COUNT(*) AS total
        FROM booking_assignments a JOIN bookings b ON b.id = a.bookingId
       WHERE a.artistId IN (${ids}) AND a.status = 'accepted' AND b.status <> 'cancelled' AND b.eventDate >= ${since}
       GROUP BY month`),
    prisma.bookingAssignment.groupBy({ by: ["status"], where: { artistId: { in: artistIds } }, _count: { _all: true } }),
    prisma.$queryRaw<{ key: string; total: unknown }[]>(Prisma.sql`
      SELECT b.eventType AS \`key\`, COUNT(*) AS total FROM booking_assignments a JOIN bookings b ON b.id = a.bookingId
       WHERE a.artistId IN (${ids}) AND a.status = 'accepted' GROUP BY b.eventType`),
    prisma.$queryRaw<{ key: string; total: unknown }[]>(Prisma.sql`
      SELECT o.name AS \`key\`, COUNT(*) AS total FROM booking_assignments a JOIN bookings b ON b.id = a.bookingId JOIN organizations o ON o.id = b.organizationId
       WHERE a.artistId IN (${ids}) AND a.status = 'accepted' GROUP BY o.name ORDER BY total DESC LIMIT 6`),
    prisma.review.aggregate({ where: { artistId: { in: artistIds }, status: "approved" }, _avg: { rating: true }, _count: { _all: true } }),
  ]);
  const ans = (s: string) => answered.find((a) => a.status === s)?._count._all ?? 0;
  const decided = ans("accepted") + ans("declined");
  return {
    earningsByMonth: series(earnRows, months),
    gigsByMonth: series(gigRows, months),
    acceptRate: decided ? Math.round((ans("accepted") / decided) * 100) : null,
    eventTypes: types.map((t) => ({ key: t.key, value: n(t.total) })),
    agencies: agencies.map((a) => ({ key: a.key, value: n(a.total) })),
    rating: { average: rating._avg.rating, count: rating._count._all },
  };
}

// ─── Partner ─────────────────────────────────────────────────────────────────

export async function affiliateDashboard(affiliateId: string, now = new Date()) {
  const months = lastMonths(12, now);
  const since = new Date(`${months[0]}-01T00:00:00Z`);
  const [clickRows, signupRows, commissionRows, campaigns, statuses] = await Promise.all([
    prisma.$queryRaw<MonthRow[]>(Prisma.sql`SELECT DATE_FORMAT(createdAt, '%Y-%m') AS month, COUNT(*) AS total FROM affiliate_clicks WHERE affiliateId = ${affiliateId} AND createdAt >= ${since} GROUP BY month`),
    prisma.$queryRaw<MonthRow[]>(Prisma.sql`SELECT DATE_FORMAT(createdAt, '%Y-%m') AS month, COUNT(*) AS total FROM referrals WHERE affiliateId = ${affiliateId} AND createdAt >= ${since} GROUP BY month`),
    prisma.$queryRaw<MonthRow[]>(
      Prisma.sql`SELECT DATE_FORMAT(createdAt, '%Y-%m') AS month, SUM(amountCents) AS total FROM commissions WHERE affiliateId = ${affiliateId} AND status <> 'cancelled' AND createdAt >= ${since} GROUP BY month`,
    ),
    prisma.affiliateClick.groupBy({ by: ["campaign"], where: { affiliateId }, _count: { _all: true } }),
    prisma.commission.groupBy({ by: ["status"], where: { affiliateId }, _sum: { amountCents: true } }),
  ]);
  return {
    clicksByMonth: series(clickRows, months),
    signupsByMonth: series(signupRows, months),
    commissionsByMonth: series(commissionRows, months),
    campaigns: campaigns.map((c) => ({ key: c.campaign ?? "", value: c._count._all })),
    commissionStatuses: statuses.map((s) => ({ key: s.status, value: n(s._sum.amountCents) })),
  };
}
