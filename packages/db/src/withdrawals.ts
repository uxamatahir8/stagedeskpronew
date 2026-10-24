import { randomInt, randomUUID } from "node:crypto";
import { isValidIban, normalizeIban } from "@stagedesk/core";
import { prisma } from "./client";
import { notify, platformAdminIds } from "./notifications";
import { getSetting } from "./settings";

/**
 * Affiliate withdrawals. Commissions become "approved" a set number of days
 * after the agency's payment is confirmed; an affiliate asks to withdraw
 * everything approved, an admin approves and pays it (Stripe, bank transfer
 * or PayPal), and every step is kept as an event.
 *
 *   requested → approved → paid
 *             ↘ rejected / cancelled (commissions go back to approved)
 *   approved  → failed (Stripe error; commissions go back to approved)
 */
export const payoutMethods = ["stripe", "bank_transfer", "paypal"] as const;
export type PayoutMethod = (typeof payoutMethods)[number];

export class WithdrawalError extends Error {
  constructor(
    readonly code: "not_approved" | "below_minimum" | "nothing_available" | "method_disabled" | "details_missing" | "open_request" | "not_found" | "wrong_status" | "invalid",
  ) {
    super(`Withdrawal: ${code}`);
    this.name = "WithdrawalError";
  }
}

const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const newReference = () => `WD-${Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("")}`;

async function event(tx: Pick<typeof prisma, "affiliatePayoutEvent">, payoutId: string, status: string, actorId: string | null, note: string | null = null) {
  await tx.affiliatePayoutEvent.create({ data: { id: randomUUID(), payoutId, status, actorId, note } });
}

/** Where an affiliate wants their money; checked so a request never lacks details. */
export async function savePayoutDetails(affiliateId: string, input: { method: PayoutMethod; iban?: string | null; accountName?: string | null; paypalEmail?: string | null }) {
  if (!payoutMethods.includes(input.method)) throw new WithdrawalError("invalid");
  const iban = input.iban ? normalizeIban(input.iban) : null;
  if (input.method === "bank_transfer" && (!iban || !isValidIban(iban) || !input.accountName?.trim())) throw new WithdrawalError("details_missing");
  if (input.method === "paypal" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.paypalEmail ?? "")) throw new WithdrawalError("details_missing");
  return prisma.affiliate.update({
    where: { id: affiliateId },
    data: {
      payoutMethod: input.method,
      payoutIban: iban,
      payoutAccountName: input.accountName?.trim().slice(0, 120) || null,
      paypalEmail: input.paypalEmail?.trim().toLowerCase().slice(0, 191) || null,
    },
  });
}

/** What can be withdrawn now, and what is still in its waiting period. */
export async function affiliateBalance(affiliateId: string) {
  const [available, waiting, requested, open] = await Promise.all([
    prisma.commission.aggregate({ where: { affiliateId, status: "approved", payoutId: null }, _sum: { amountCents: true }, _count: true }),
    prisma.commission.aggregate({ where: { affiliateId, status: { in: ["pending", "review"] } }, _sum: { amountCents: true }, _min: { availableAt: true } }),
    prisma.commission.aggregate({ where: { affiliateId, status: "requested" }, _sum: { amountCents: true } }),
    prisma.affiliatePayout.findFirst({ where: { affiliateId, status: { in: ["requested", "approved"] } }, select: { id: true, reference: true, status: true, amountCents: true } }),
  ]);
  return {
    availableCents: available._sum.amountCents ?? 0,
    availableCount: available._count,
    waitingCents: waiting._sum.amountCents ?? 0,
    nextAvailableAt: waiting._min.availableAt,
    requestedCents: requested._sum.amountCents ?? 0,
    openRequest: open,
  };
}

/** The affiliate asks to be paid everything that's approved, by their chosen method. */
export async function requestWithdrawal(affiliateId: string, actorId: string) {
  const [program, affiliate] = await Promise.all([getSetting("affiliates.program"), prisma.affiliate.findUnique({ where: { id: affiliateId } })]);
  if (!affiliate || affiliate.status !== "approved") throw new WithdrawalError("not_approved");
  const method = (affiliate.payoutMethod ?? (affiliate.payoutsEnabled ? "stripe" : null)) as PayoutMethod | null;
  if (!method) throw new WithdrawalError("details_missing");
  if (!program.payoutMethods[method]) throw new WithdrawalError("method_disabled");
  if (method === "stripe" && (!affiliate.payoutsEnabled || !affiliate.stripeAccountId)) throw new WithdrawalError("details_missing");
  if (method === "bank_transfer" && (!affiliate.payoutIban || !affiliate.payoutAccountName)) throw new WithdrawalError("details_missing");
  if (method === "paypal" && !affiliate.paypalEmail) throw new WithdrawalError("details_missing");

  const payout = await prisma.$transaction(async (tx) => {
    if (await tx.affiliatePayout.findFirst({ where: { affiliateId, status: { in: ["requested", "approved"] } }, select: { id: true } })) throw new WithdrawalError("open_request");
    const due = await tx.commission.findMany({ where: { affiliateId, status: "approved", payoutId: null }, select: { id: true, amountCents: true } });
    const total = due.reduce((sum, c) => sum + c.amountCents, 0);
    if (total <= 0) throw new WithdrawalError("nothing_available");
    if (total < program.minPayoutCents) throw new WithdrawalError("below_minimum");
    const id = randomUUID();
    const details =
      method === "bank_transfer"
        ? { iban: affiliate.payoutIban, accountName: affiliate.payoutAccountName }
        : method === "paypal"
          ? { paypalEmail: affiliate.paypalEmail }
          : { stripeAccountId: affiliate.stripeAccountId };
    const created = await tx.affiliatePayout.create({ data: { id, reference: newReference(), affiliateId, amountCents: total, method, status: "requested", details } });
    // Only commissions still approved and free are taken, so a parallel request can't double them.
    const moved = await tx.commission.updateMany({ where: { id: { in: due.map((c) => c.id) }, status: "approved", payoutId: null }, data: { status: "requested", payoutId: id } });
    if (moved.count !== due.length) throw new WithdrawalError("open_request");
    await event(tx, id, "requested", actorId);
    return created;
  });
  await notify(await platformAdminIds(), { type: "withdrawal_requested", data: { reference: payout.reference ?? "", cents: payout.amountCents }, url: `/app/affiliates?tab=withdrawals` });
  return payout;
}

async function release(tx: Pick<typeof prisma, "commission">, payoutId: string) {
  await tx.commission.updateMany({ where: { payoutId, status: "requested" }, data: { status: "approved", payoutId: null } });
}

async function load(payoutId: string, statuses: string[]) {
  const payout = await prisma.affiliatePayout.findUnique({ where: { id: payoutId }, include: { affiliate: { select: { userId: true } } } });
  if (!payout) throw new WithdrawalError("not_found");
  if (!statuses.includes(payout.status)) throw new WithdrawalError("wrong_status");
  return payout;
}

/** The affiliate changes their mind before it's approved. */
export async function cancelWithdrawal(affiliateId: string, payoutId: string, actorId: string) {
  const payout = await load(payoutId, ["requested"]);
  if (payout.affiliateId !== affiliateId) throw new WithdrawalError("not_found");
  await prisma.$transaction(async (tx) => {
    await tx.affiliatePayout.update({ where: { id: payoutId }, data: { status: "cancelled" } });
    await release(tx, payoutId);
    await event(tx, payoutId, "cancelled", actorId);
  });
}

/** An admin approves; for Stripe the transfer follows straight away (payments package). */
export async function approveWithdrawal(payoutId: string, adminId: string, note: string | null = null) {
  const payout = await load(payoutId, ["requested"]);
  await prisma.$transaction(async (tx) => {
    await tx.affiliatePayout.update({ where: { id: payoutId }, data: { status: "approved", reviewedById: adminId, reviewedAt: new Date() } });
    await event(tx, payoutId, "approved", adminId, note);
  });
  await notify([payout.affiliate.userId], { type: "withdrawal_approved", data: { reference: payout.reference ?? "", cents: payout.amountCents }, url: "/app/payouts" });
  return payout;
}

export async function rejectWithdrawal(payoutId: string, adminId: string, reason: string) {
  const payout = await load(payoutId, ["requested", "approved"]);
  if (!reason.trim()) throw new WithdrawalError("invalid");
  await prisma.$transaction(async (tx) => {
    await tx.affiliatePayout.update({ where: { id: payoutId }, data: { status: "rejected", rejectReason: reason.trim().slice(0, 300), reviewedById: adminId, reviewedAt: new Date() } });
    await release(tx, payoutId);
    await event(tx, payoutId, "rejected", adminId, reason.trim().slice(0, 500));
  });
  await notify([payout.affiliate.userId], { type: "withdrawal_rejected", data: { reference: payout.reference ?? "", reason: reason.trim() }, url: "/app/payouts" });
}

/** Paid outside Stripe (bank or PayPal): the admin enters the transaction reference. */
export async function markWithdrawalPaid(payoutId: string, adminId: string, input: { transactionRef: string; paidAt?: Date; stripeTransferId?: string | null }) {
  const payout = await load(payoutId, ["approved", "failed"]);
  const paidAt = input.paidAt ?? new Date();
  await prisma.$transaction(async (tx) => {
    await tx.affiliatePayout.update({
      where: { id: payoutId },
      data: { status: "paid", paidAt, transactionRef: input.transactionRef.trim().slice(0, 120) || null, stripeTransferId: input.stripeTransferId ?? undefined, error: null },
    });
    // A failed payout gave its commissions back; take them again.
    await tx.commission.updateMany({ where: { payoutId }, data: { status: "paid" } });
    await event(tx, payoutId, "paid", adminId, input.transactionRef.trim().slice(0, 500) || null);
  });
  await notify([payout.affiliate.userId], { type: "withdrawal_paid", data: { reference: payout.reference ?? "", cents: payout.amountCents }, url: "/app/payouts" });
}

/** A Stripe transfer failed: the money stays available and the reason is kept. */
export async function failWithdrawal(payoutId: string, error: string, actorId: string | null) {
  await prisma.$transaction(async (tx) => {
    await tx.affiliatePayout.update({ where: { id: payoutId }, data: { status: "failed", error: error.slice(0, 2000) } });
    await event(tx, payoutId, "failed", actorId, error.slice(0, 500));
  });
}

/** One withdrawal with its commissions (agency, invoice, amounts) and every step. */
export async function withdrawalDetail(payoutId: string) {
  return prisma.affiliatePayout.findUnique({
    where: { id: payoutId },
    include: {
      affiliate: { include: { user: { select: { name: true, email: true } } } },
      commissions: { orderBy: { createdAt: "asc" }, include: { referral: { select: { agency: { select: { name: true } } } } } },
      events: { orderBy: { createdAt: "asc" } },
    },
  });
}

export async function listWithdrawals({ status = null, affiliateId = null, take = 100 }: { status?: string | null; affiliateId?: string | null; take?: number } = {}) {
  return prisma.affiliatePayout.findMany({
    where: { ...(status ? { status } : {}), ...(affiliateId ? { affiliateId } : {}) },
    orderBy: { createdAt: "desc" },
    take,
    include: { affiliate: { include: { user: { select: { name: true, email: true } } } }, _count: { select: { commissions: true } } },
  });
}

/** Platform-wide figures for the affiliate reports, over the last `days` days (or all time). */
export async function affiliateReport(days: number | null = null, now = new Date()) {
  const since = days ? { createdAt: { gte: new Date(now.getTime() - days * 86_400_000) } } : {};
  const [byStatus, payouts, affiliates, referrals, payingReferrals, clicks, topAffiliates, monthly] = await Promise.all([
    prisma.commission.groupBy({ by: ["status"], where: since, _sum: { amountCents: true }, _count: true }),
    prisma.affiliatePayout.groupBy({ by: ["status"], where: since, _sum: { amountCents: true }, _count: true }),
    prisma.affiliate.groupBy({ by: ["status"], _count: true }),
    prisma.referral.count({ where: { type: "affiliate", ...since } }),
    prisma.referral.count({ where: { type: "affiliate", firstPaidAt: { not: null }, ...since } }),
    prisma.affiliateClick.count({ where: since }),
    prisma.commission.groupBy({ by: ["affiliateId"], where: { status: { not: "cancelled" }, ...since }, _sum: { amountCents: true }, _count: true, orderBy: { _sum: { amountCents: "desc" } }, take: 10 }),
    prisma.$queryRaw<{ month: string; earned: bigint | number; paid: bigint | number }[]>`
      SELECT DATE_FORMAT(createdAt, '%Y-%m') AS month,
             SUM(CASE WHEN status <> 'cancelled' THEN amountCents ELSE 0 END) AS earned,
             SUM(CASE WHEN status = 'paid' THEN amountCents ELSE 0 END) AS paid
      FROM commissions
      WHERE createdAt >= DATE_SUB(CURDATE(), INTERVAL 11 MONTH)
      GROUP BY month ORDER BY month`,
  ]);
  const names = await prisma.affiliate.findMany({ where: { id: { in: topAffiliates.map((a) => a.affiliateId) } }, include: { user: { select: { name: true } } } });
  const sum = (rows: { status: string; _sum: { amountCents: number | null } }[], ...statuses: string[]) =>
    rows.filter((r) => statuses.includes(r.status)).reduce((s, r) => s + (r._sum.amountCents ?? 0), 0);
  return {
    commissions: {
      waiting: sum(byStatus, "pending", "review"),
      available: sum(byStatus, "approved"),
      inWithdrawal: sum(byStatus, "requested"),
      paid: sum(byStatus, "paid"),
      cancelled: sum(byStatus, "cancelled"),
      count: byStatus.reduce((s, r) => s + r._count, 0),
    },
    withdrawals: {
      open: sum(payouts, "requested", "approved"),
      openCount: payouts.filter((p) => ["requested", "approved"].includes(p.status)).reduce((s, p) => s + p._count, 0),
      paid: sum(payouts, "paid"),
      failed: payouts.filter((p) => p.status === "failed").reduce((s, p) => s + p._count, 0),
    },
    affiliates: Object.fromEntries(affiliates.map((a) => [a.status, a._count])) as Record<string, number>,
    funnel: { clicks, referrals, paying: payingReferrals },
    top: topAffiliates.map((a) => ({ affiliateId: a.affiliateId, name: names.find((n) => n.id === a.affiliateId)?.user.name ?? "—", cents: a._sum.amountCents ?? 0, count: a._count })),
    monthly: monthly.map((m) => ({ month: m.month, earned: Number(m.earned), paid: Number(m.paid) })),
  };
}
