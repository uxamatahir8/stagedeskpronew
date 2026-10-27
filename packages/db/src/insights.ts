import { lastMonths } from "./analytics";
import { prisma } from "./client";
import { Prisma } from "./generated/prisma/client";

/**
 * The second set of dashboard figures: the platform's money and marketplace,
 * a business's marketplace results and team, and an artist's calendar.
 * Aggregated in the database; month series oldest first with zeros.
 */

type MonthRow = { month: string; total: bigint | number | string | null };
const series = (rows: MonthRow[], months: string[]) => months.map((month) => ({ month, value: Number(rows.find((r) => r.month === month)?.total ?? 0) }));
const n = (v: unknown) => Number(v ?? 0);

type WeekdayRow = { weekday: number | bigint; total: bigint | number };
/** MySQL DAYOFWEEK (1 = Sunday … 7 = Saturday) as Monday-first counts; key "0" is Monday. */
const weekdays = (rows: WeekdayRow[]) =>
  [2, 3, 4, 5, 6, 7, 1].map((d, i) => ({ key: String(i), value: Number(rows.find((r) => Number(r.weekday) === d)?.total ?? 0) }));

const live = ["booked", "confirmed", "completed", "settled"];

// ─── Platform ────────────────────────────────────────────────────────────────

/**
 * For the platform admin: what the platform earns, the marketplace (requests,
 * prices, wins), independent artists and lending, where and when events
 * happen, and who uses StageDesk.
 */
export async function platformInsights(now = new Date()) {
  const months = lastMonths(12, now);
  const since = new Date(`${months[0]}-01T00:00:00Z`);

  const [
    feeRows,
    paidRows,
    leadRows,
    pricedLeadRows,
    offeredLeads,
    wonLeadRows,
    gigRows,
    agencyRows,
    soloRows,
    sources,
    types,
    cities,
    weekdayRows,
    offerCounts,
    acceptedOffers,
    roleRows,
    affiliates,
    subs,
    requests,
    methods,
    agencyCities,
  ] = await Promise.all([
    prisma.$queryRaw<MonthRow[]>(Prisma.sql`SELECT DATE_FORMAT(createdAt, '%Y-%m') AS month, SUM(amountCents) AS total FROM ledger_entries WHERE type = 'platform_fee' AND createdAt >= ${since} GROUP BY month`),
    prisma.$queryRaw<MonthRow[]>(
      Prisma.sql`SELECT DATE_FORMAT(p.receivedAt, '%Y-%m') AS month, SUM(p.amountCents - p.refundedCents) AS total FROM payments p JOIN bookings b ON b.id = p.bookingId WHERE p.receivedAt >= ${since} AND b.currency = 'EUR' GROUP BY month`,
    ),
    prisma.$queryRaw<MonthRow[]>(Prisma.sql`SELECT DATE_FORMAT(createdAt, '%Y-%m') AS month, COUNT(*) AS total FROM leads WHERE createdAt >= ${since} GROUP BY month`),
    prisma.$queryRaw<MonthRow[]>(
      Prisma.sql`SELECT DATE_FORMAT(l.createdAt, '%Y-%m') AS month, COUNT(DISTINCT l.id) AS total FROM leads l JOIN lead_offers o ON o.leadId = l.id AND o.status IN ('quoted', 'accepted', 'lost') WHERE l.createdAt >= ${since} GROUP BY month`,
    ),
    prisma.$queryRaw<{ total: bigint | number }[]>(
      Prisma.sql`SELECT COUNT(DISTINCT l.id) AS total FROM leads l JOIN lead_offers o ON o.leadId = l.id WHERE l.createdAt >= ${since}`,
    ),
    prisma.$queryRaw<MonthRow[]>(Prisma.sql`SELECT DATE_FORMAT(createdAt, '%Y-%m') AS month, COUNT(*) AS total FROM leads WHERE createdAt >= ${since} AND status = 'assigned' GROUP BY month`),
    prisma.$queryRaw<MonthRow[]>(Prisma.sql`SELECT DATE_FORMAT(createdAt, '%Y-%m') AS month, COUNT(*) AS total FROM bookings WHERE createdAt >= ${since} AND source = 'gig' GROUP BY month`),
    prisma.$queryRaw<MonthRow[]>(Prisma.sql`SELECT DATE_FORMAT(createdAt, '%Y-%m') AS month, COUNT(*) AS total FROM organizations WHERE createdAt >= ${since} AND kind = 'agency' GROUP BY month`),
    prisma.$queryRaw<MonthRow[]>(Prisma.sql`SELECT DATE_FORMAT(createdAt, '%Y-%m') AS month, COUNT(*) AS total FROM organizations WHERE createdAt >= ${since} AND kind = 'solo' GROUP BY month`),
    prisma.booking.groupBy({ by: ["source"], where: { createdAt: { gte: since } }, _count: { _all: true } }),
    prisma.booking.groupBy({ by: ["eventType"], where: { createdAt: { gte: since } }, _count: { _all: true } }),
    prisma.booking.groupBy({
      by: ["venueCity"],
      where: { createdAt: { gte: since }, venueCity: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { venueCity: "desc" } },
      take: 8,
    }),
    prisma.$queryRaw<WeekdayRow[]>(
      Prisma.sql`SELECT DAYOFWEEK(eventDate) AS weekday, COUNT(*) AS total FROM bookings WHERE eventDate >= ${since} AND status IN (${Prisma.join(live)}) GROUP BY weekday`,
    ),
    prisma.leadOffer.groupBy({ by: ["status"], where: { createdAt: { gte: since } }, _count: { _all: true } }),
    prisma.leadOffer.aggregate({ where: { status: "accepted", createdAt: { gte: since }, currency: "EUR" }, _avg: { totalCents: true } }),
    prisma.$queryRaw<{ role: string; total: bigint }[]>(Prisma.sql`SELECT role, COUNT(DISTINCT userId) AS total FROM members GROUP BY role`),
    prisma.affiliate.count({ where: { status: "approved" } }),
    prisma.subscription.findMany({
      where: { status: { in: ["active", "past_due"] }, complimentary: false },
      select: { interval: true, plan: { select: { monthlyPriceCents: true, yearlyPriceCents: true, audience: true } } },
    }),
    prisma.artistRequest.groupBy({ by: ["status"], _count: { _all: true }, _sum: { feeCents: true } }),
    prisma.$queryRaw<{ method: string; total: bigint | number }[]>(
      Prisma.sql`SELECT p.method AS method, SUM(p.amountCents - p.refundedCents) AS total FROM payments p JOIN bookings b ON b.id = p.bookingId WHERE p.receivedAt >= ${since} AND b.currency = 'EUR' GROUP BY p.method`,
    ),
    prisma.organization.groupBy({ by: ["city"], where: { city: { not: null }, kind: "agency" }, _count: { _all: true }, orderBy: { _count: { city: "desc" } }, take: 8 }),
  ]);

  // Recurring revenue from paying subscriptions, yearly plans spread over twelve months.
  const mrr = (audience: string) =>
    subs.filter((s) => s.plan.audience === audience).reduce((t, s) => t + (s.interval === "year" ? Math.round(s.plan.yearlyPriceCents / 12) : s.plan.monthlyPriceCents), 0);
  const offers = (status: string) => offerCounts.find((o) => o.status === status)?._count._all ?? 0;
  const role = (r: string) => n(roleRows.find((x) => x.role === r)?.total);
  const request = (status: string) => requests.find((r) => r.status === status);
  const leads = series(leadRows, months);
  const pricedLeads = series(pricedLeadRows, months);
  const wonLeads = series(wonLeadRows, months);
  const agencies = series(agencyRows, months);
  const solos = series(soloRows, months);
  const total = (s: { value: number }[]) => s.reduce((t, x) => t + x.value, 0);
  const [leadsTotal, priced, won] = [total(leads), total(pricedLeads), total(wonLeads)];

  return {
    feesByMonth: series(feeRows, months),
    paidByMonth: series(paidRows, months),
    marketByMonth: months.map((month, i) => ({ month, values: [leads[i]!.value, pricedLeads[i]!.value, wonLeads[i]!.value] })),
    signupsByKind: months.map((month, i) => ({ month, values: [agencies[i]!.value, solos[i]!.value] })),
    gigOrdersByMonth: series(gigRows, months),
    mrr: { agency: mrr("agency"), artist: mrr("artist") },
    market: {
      leads: leadsTotal,
      offered: n(offeredLeads[0]?.total),
      priced,
      won,
      pricedRate: leadsTotal ? Math.round((priced / leadsTotal) * 100) : null,
      winRate: leadsTotal ? Math.round((won / leadsTotal) * 100) : null,
      pricesPerLead: priced ? Math.round(((offers("quoted") + offers("accepted") + offers("lost")) / priced) * 10) / 10 : null,
      averageWon: n(acceptedOffers._avg.totalCents),
    },
    lending: {
      requests: requests.reduce((t, r) => t + r._count._all, 0),
      agreed: request("accepted")?._count._all ?? 0,
      feesAgreed: n(request("accepted")?._sum.feeCents),
    },
    roles: [
      { key: "agency", value: role("agency_owner") + role("agency_admin") + role("agency_staff") },
      { key: "solo_artist", value: role("solo_artist") },
      { key: "artist", value: role("artist") },
      { key: "customer", value: role("customer") },
      { key: "affiliate", value: affiliates },
    ],
    sources: sources.map((s) => ({ key: s.source, value: s._count._all })).sort((a, b) => b.value - a.value),
    eventTypes: types.map((s) => ({ key: s.eventType, value: s._count._all })).sort((a, b) => b.value - a.value),
    cities: cities.map((c) => ({ key: c.venueCity ?? "", value: c._count._all })),
    agencyCities: agencyCities.map((c) => ({ key: c.city ?? "", value: c._count._all })),
    weekdays: weekdays(weekdayRows),
    paymentMethods: methods.map((m) => ({ key: m.method, value: n(m.total) })).sort((a, b) => b.value - a.value),
  };
}

// ─── A business (agency or independent artist) ───────────────────────────────

/** Marketplace results, who earns most, collection, quotes over time, weekdays and how far ahead people book. */
export async function businessInsights(organizationId: string, now = new Date()) {
  const months = lastMonths(12, now);
  const since = new Date(`${months[0]}-01T00:00:00Z`);
  const org = Prisma.sql`organizationId = ${organizationId}`;
  const [quoteRows, acceptedRows, offers, byArtist, money, weekdayRows, leadTime, gigs, profile] = await Promise.all([
    prisma.$queryRaw<MonthRow[]>(Prisma.sql`SELECT DATE_FORMAT(sentAt, '%Y-%m') AS month, COUNT(*) AS total FROM quotes WHERE ${org} AND sentAt >= ${since} GROUP BY month`),
    prisma.$queryRaw<MonthRow[]>(Prisma.sql`SELECT DATE_FORMAT(acceptedAt, '%Y-%m') AS month, COUNT(*) AS total FROM quotes WHERE ${org} AND acceptedAt >= ${since} GROUP BY month`),
    prisma.leadOffer.groupBy({ by: ["status"], where: { agencyId: organizationId, createdAt: { gte: since } }, _count: { _all: true } }),
    prisma.$queryRaw<{ name: string; total: bigint | number; gigs: bigint | number }[]>(
      Prisma.sql`SELECT a.stageName AS name, SUM(b.totalCents) AS total, COUNT(*) AS gigs FROM booking_assignments ba JOIN bookings b ON b.id = ba.bookingId JOIN artists a ON a.id = ba.artistId
                 WHERE ba.organizationId = ${organizationId} AND ba.status = 'accepted' AND b.status IN (${Prisma.join(live)}) AND b.eventDate >= ${since}
                 GROUP BY a.id, a.stageName ORDER BY total DESC LIMIT 6`,
    ),
    prisma.booking.aggregate({ where: { organizationId, status: { in: live }, eventDate: { gte: since } }, _sum: { totalCents: true, paidCents: true } }),
    prisma.$queryRaw<WeekdayRow[]>(Prisma.sql`SELECT DAYOFWEEK(eventDate) AS weekday, COUNT(*) AS total FROM bookings WHERE ${org} AND eventDate >= ${since} AND status IN (${Prisma.join(live)}) GROUP BY weekday`),
    prisma.$queryRaw<{ days: number | string | null }[]>(
      Prisma.sql`SELECT AVG(DATEDIFF(eventDate, createdAt)) AS days FROM bookings WHERE ${org} AND eventDate IS NOT NULL AND createdAt >= ${since} AND status IN (${Prisma.join(live)})`,
    ),
    prisma.booking.count({ where: { organizationId, source: "gig", createdAt: { gte: since } } }),
    prisma.booking.count({ where: { organizationId, source: "profile", createdAt: { gte: since } } }),
  ]);
  const offer = (s: string) => offers.find((o) => o.status === s)?._count._all ?? 0;
  const priced = offer("quoted") + offer("accepted") + offer("lost");
  const quotes = series(quoteRows, months);
  const accepted = series(acceptedRows, months);
  return {
    quotesByMonth: months.map((month, i) => ({ month, values: [quotes[i]!.value, accepted[i]!.value] })),
    market: {
      received: offers.reduce((t, o) => t + o._count._all, 0),
      priced,
      won: offer("accepted"),
      lost: offer("lost"),
      passed: offer("declined"),
      winRate: priced ? Math.round((offer("accepted") / priced) * 100) : null,
    },
    byArtist: byArtist.map((a) => ({ key: a.name, label: a.name, value: n(a.total), gigs: n(a.gigs) })),
    collected: { total: n(money._sum.totalCents), paid: n(money._sum.paidCents) },
    weekdays: weekdays(weekdayRows),
    leadTimeDays: leadTime[0]?.days == null ? null : Math.round(Number(leadTime[0].days)),
    direct: { gigs, profile },
  };
}

// ─── Artist ──────────────────────────────────────────────────────────────────

/** An artist's gigs by weekday, and how many are coming up in each of the next six months. */
export async function artistInsights(userId: string, now = new Date()) {
  const artists = await prisma.artist.findMany({ where: { userId }, select: { id: true } });
  if (artists.length === 0) return null;
  const ids = artists.map((a) => a.id);
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const ahead = Array.from({ length: 6 }, (_, i) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1)).toISOString().slice(0, 7));
  const [weekdayRows, upcomingRows] = await Promise.all([
    prisma.$queryRaw<WeekdayRow[]>(
      Prisma.sql`SELECT DAYOFWEEK(b.eventDate) AS weekday, COUNT(*) AS total FROM booking_assignments ba JOIN bookings b ON b.id = ba.bookingId
                 WHERE ba.artistId IN (${Prisma.join(ids)}) AND ba.status = 'accepted' AND b.eventDate IS NOT NULL GROUP BY weekday`,
    ),
    prisma.$queryRaw<MonthRow[]>(
      Prisma.sql`SELECT DATE_FORMAT(b.eventDate, '%Y-%m') AS month, COUNT(*) AS total FROM booking_assignments ba JOIN bookings b ON b.id = ba.bookingId
                 WHERE ba.artistId IN (${Prisma.join(ids)}) AND ba.status = 'accepted' AND b.eventDate >= ${today} AND b.status IN ('booked', 'confirmed') GROUP BY month`,
    ),
  ]);
  return { weekdays: weekdays(weekdayRows), upcoming: series(upcomingRows, ahead) };
}
