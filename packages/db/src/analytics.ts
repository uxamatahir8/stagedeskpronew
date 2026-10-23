import { prisma } from "./client";
import { Prisma } from "./generated/prisma/client";

/** The last `count` months as "YYYY-MM", oldest first (UTC). */
export function lastMonths(count: number, now = new Date()) {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (count - 1 - i), 1));
    return d.toISOString().slice(0, 7);
  });
}

const monthStart = (months: string[]) => new Date(`${months[0]}-01T00:00:00Z`);

type Row = { series: string; month: string; total: bigint | number | string | null };

/** Turns grouped rows into one value per month per series, zero where nothing happened. */
function fill(rows: Row[], months: string[], series: string[]) {
  return months.map((month) => ({
    month,
    values: series.map((s) => Number(rows.find((r) => r.series === s && r.month === month)?.total ?? 0)),
  }));
}

/**
 * Agency revenue per month: booked (quote totals by the month the customer
 * accepted) against collected (payments received, refunds subtracted).
 * One query for the chart.
 */
export async function agencyRevenueByMonth(organizationId: string, count = 6, now = new Date()) {
  const months = lastMonths(count, now);
  const since = monthStart(months);
  const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
    SELECT 'booked' AS series, DATE_FORMAT(bookedAt, '%Y-%m') AS month, SUM(totalCents) AS total
      FROM bookings
     WHERE organizationId = ${organizationId} AND bookedAt >= ${since} AND status <> 'cancelled'
     GROUP BY month
    UNION ALL
    SELECT 'collected', DATE_FORMAT(receivedAt, '%Y-%m'), SUM(amountCents)
      FROM payments
     WHERE organizationId = ${organizationId} AND receivedAt >= ${since}
     GROUP BY DATE_FORMAT(receivedAt, '%Y-%m')`);
  return fill(rows, months, ["booked", "collected"]);
}

/** New agencies per month across the platform. */
export async function newAgenciesByMonth(count = 12, now = new Date()) {
  const months = lastMonths(count, now);
  const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
    SELECT 'agencies' AS series, DATE_FORMAT(createdAt, '%Y-%m') AS month, COUNT(*) AS total
      FROM organizations
     WHERE createdAt >= ${monthStart(months)}
     GROUP BY month`);
  return fill(rows, months, ["agencies"]);
}

/** Money paid online through the platform and the platform's fee on it, per month. */
export async function platformVolumeByMonth(count = 6, now = new Date()) {
  const months = lastMonths(count, now);
  const since = monthStart(months);
  const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
    SELECT 'volume' AS series, DATE_FORMAT(receivedAt, '%Y-%m') AS month, SUM(amountCents) AS total
      FROM payments
     WHERE method = 'stripe' AND kind <> 'refund' AND receivedAt >= ${since}
     GROUP BY month
    UNION ALL
    SELECT 'fees', DATE_FORMAT(createdAt, '%Y-%m'), SUM(amountCents)
      FROM ledger_entries
     WHERE type IN ('platform_fee', 'refund_cost') AND createdAt >= ${since}
     GROUP BY DATE_FORMAT(createdAt, '%Y-%m')`);
  return fill(rows, months, ["volume", "fees"]);
}

/** Inquiries per month across all agencies. */
export async function inquiriesByMonth(count = 6, now = new Date()) {
  const months = lastMonths(count, now);
  const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
    SELECT 'inquiries' AS series, DATE_FORMAT(createdAt, '%Y-%m') AS month, COUNT(*) AS total
      FROM bookings
     WHERE createdAt >= ${monthStart(months)}
     GROUP BY month`);
  return fill(rows, months, ["inquiries"]);
}
