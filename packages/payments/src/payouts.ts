import { randomUUID } from "node:crypto";
import type Stripe from "stripe";
import { type FeeSnapshot, splitBookingPayment } from "@stagedesk/core";
import { BookingError, changeBookingStatus, getSetting, lenderFee, prisma, tenantDb } from "@stagedesk/db";
import {
  claimOperation,
  dueOperations,
  failAttempt,
  findTagged,
  isUniqueViolation,
  lockPayment,
  type Operation,
  openOperation,
  moneyTx,
  saveOperationData,
} from "./operations";
import { executeRefund } from "./refunds";

type Party = "artist" | "agency" | "lender";
type LedgerLine = { type: string; party: string; amountCents: number; artistId?: string | null };

/** A payout operation's plan, fixed when it's created, and the transfers made so far. */
interface PayoutData {
  bookingId: string;
  currency: string;
  chargeId: string;
  transfers: { party: Party; destination: string; cents: number }[];
  /** Rows booked with the transfers (shares, fees, debts). */
  ledger: LedgerLine[];
  artistId: string | null;
  /** The part of the lender's fee this payment covers (counted while the operation is pending). */
  lenderCut: number;
  ids: Partial<Record<Party, string>>;
}

/**
 * Splits a booking's Stripe payments and transfers the shares, once the event
 * is completed and the dispute window has passed. Uses the fee frozen on the
 * booking at acceptance. If the artist has no connected account, their share
 * goes to the agency and is recorded as owed to the artist.
 *
 * Each payment is paid out by one durable operation (key payout:<payment>),
 * so two runs, a crash or a timeout can't transfer it twice; an unfinished
 * one is continued by the worker (runFinancialOperations).
 */
export async function payoutBooking(stripe: Stripe, bookingId: string, now = new Date()) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      payments: { where: { method: "stripe", transferredAt: null }, orderBy: { createdAt: "asc" } },
      assignments: { where: { status: "accepted" }, take: 1, include: { artist: { include: { connectedAccount: true } } } },
    },
  });
  if (!booking || booking.disputed || !booking.completedAt) return { transferred: 0 };
  const { payoutDisputeWindowDays } = await getSetting("bookings.defaults");
  if (booking.completedAt.getTime() + payoutDisputeWindowDays * 86_400_000 > now.getTime()) return { transferred: 0 };

  const db = tenantDb(booking.organizationId);
  const agencyAccount = await db.connectedAccount.findFirst({ where: { artistId: null, payoutsEnabled: true } });
  if (!agencyAccount) return { transferred: 0 };

  const snapshot = booking.feeSnapshot as unknown as FeeSnapshot | null;
  const platformFees = await getSetting("fees.platform");
  const fees = snapshot ?? { rule: platformFees.defaultRule, stripeFeePaidBy: platformFees.stripeFeePaidBy };
  const assignment = booking.assignments[0];
  const artistAccount = assignment?.artist.connectedAccount?.payoutsEnabled ? assignment.artist.connectedAccount : null;
  const artistId = assignment?.artistId ?? null;

  // An artist lent by another agency: their agreed fee comes out of this agency's share, until it's paid in full.
  const lent = await lenderFee(booking.id);
  const lenderAccount = lent ? await prisma.connectedAccount.findFirst({ where: { organizationId: lent.lenderId, artistId: null, payoutsEnabled: true } }) : null;

  let transferred = 0;
  for (const candidate of booking.payments) {
    if (!candidate.stripeChargeId) continue;
    const op = await reservePayout(candidate.id, async (tx, payment, amount) => {
      // What earlier payments already gave the lender, including payouts still being made.
      const booked = lent ? ((await tx.ledgerEntry.aggregate({ where: { bookingId: booking.id, type: "lender_fee" }, _sum: { amountCents: true } }))._sum.amountCents ?? 0) : 0;
      const pending = lent
        ? (await tx.financialOperation.findMany({ where: { bookingId: booking.id, kind: "payout", status: { in: ["pending", "review"] } }, select: { data: true } }))
            .reduce((sum, o) => sum + ((o.data as unknown as PayoutData).lenderCut ?? 0), 0)
        : 0;
      const feeLeft = lent ? Math.max(0, lent.feeCents - booked - pending) : 0;

      const split = splitBookingPayment({
        amount,
        stripeFee: payment.stripeFeeCents,
        artistShareBps: assignment?.shareBps ?? 0,
        feeRule: fees.rule,
        stripeFeePaidBy: fees.stripeFeePaidBy,
      });
      const toArtist = artistAccount ? split.artist : 0;
      const agencyPart = split.agency + (artistAccount ? 0 : split.artist);
      const lenderCut = Math.min(feeLeft, agencyPart);
      // Without a Stripe account the lender's cut stays with this agency and is recorded as owed.
      const toLender = lenderAccount ? lenderCut : 0;
      const toAgency = agencyPart - toLender;

      const transfers: PayoutData["transfers"] = [];
      if (artistAccount && toArtist > 0) transfers.push({ party: "artist", destination: artistAccount.stripeAccountId, cents: toArtist });
      if (toAgency > 0) transfers.push({ party: "agency", destination: agencyAccount.stripeAccountId, cents: toAgency });
      if (lenderAccount && toLender > 0) transfers.push({ party: "lender", destination: lenderAccount.stripeAccountId, cents: toLender });
      const ledger: LedgerLine[] = [
        { type: "platform_fee", party: "platform", amountCents: split.platform },
        ...(artistId ? [{ type: "artist_share", party: "artist", amountCents: split.artist, artistId }] : []),
        { type: "agency_share", party: "agency", amountCents: split.agency },
        ...(lent && lenderCut > 0 ? [{ type: "lender_fee", party: "lender", amountCents: lenderCut }] : []),
        ...(lent && !lenderAccount && lenderCut > 0 ? [{ type: "owed_by_agency", party: "lender", amountCents: lenderCut }] : []),
        ...(artistId && !artistAccount && split.artist > 0 ? [{ type: "owed_by_agency", party: "artist", amountCents: split.artist, artistId }] : []),
      ];
      return { bookingId: booking.id, currency: booking.currency, chargeId: payment.stripeChargeId!, transfers, ledger, artistId, lenderCut, ids: {} };
    });
    if (!op) continue;
    const result = await executePayout(stripe, op.id, now);
    transferred += result.transferred;
  }
  await settleIfPaidOut(booking.id, now);
  return { transferred };
}

type PaymentRow = Awaited<ReturnType<typeof prisma.payment.findUniqueOrThrow>>;
type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Creates the payout operation for a payment, or returns the unfinished one.
 * Null when there's nothing to do: already paid out, or a refund of the
 * payment is still running (the payout waits for it).
 */
async function reservePayout(paymentId: string, plan: (tx: Tx, payment: PaymentRow, amount: number) => Promise<PayoutData>) {
  const key = `payout:${paymentId}`;
  try {
    return await prisma.$transaction(async (tx) => {
      await lockPayment(tx, paymentId);
      const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
      if (payment.transferredAt) return null;
      const existing = await tx.financialOperation.findUnique({ where: { key } });
      if (existing) return existing.status === "pending" ? existing : null;
      if (await openOperation(tx, paymentId)) return null;
      // Disputes net to minus the amount while open or lost, zero once won.
      const disputes = await tx.ledgerEntry.aggregate({
        where: { paymentId, type: { in: ["dispute", "dispute_won", "dispute_lost"] } },
        _sum: { amountCents: true },
      });
      const amount = payment.amountCents - payment.refundedCents + Math.min(0, disputes._sum.amountCents ?? 0);
      if (amount <= 0) {
        // Refunded or charged back in full: nothing left to split.
        await tx.payment.update({ where: { id: paymentId }, data: { transferredAt: new Date() } });
        return null;
      }
      const data = await plan(tx, payment, amount);
      return tx.financialOperation.create({
        data: {
          id: randomUUID(),
          kind: "payout",
          key,
          organizationId: payment.organizationId,
          bookingId: payment.bookingId,
          paymentId,
          amountCents: amount,
          currency: data.currency,
          status: "pending",
          data: data as object,
        },
      });
    }, moneyTx);
  } catch (error) {
    if (isUniqueViolation(error)) return null; // another run created it just now and is paying it out
    throw error;
  }
}

/** Makes the transfers that don't exist yet, then books the payout once. Safe to repeat. */
export async function executePayout(stripe: Stripe, operationId: string, now = new Date()) {
  const op: Operation | null = await claimOperation(operationId, now);
  if (!op) return { transferred: 0, status: "busy" as const };
  const data = op.data as unknown as PayoutData;
  data.ids ??= {};
  try {
    for (const t of data.transfers) {
      if (data.ids[t.party]) continue;
      const earlier =
        op.attempts > 1 ? await findTagged(() => stripe.transfers.list({ transfer_group: data.bookingId, limit: 100 }), op.id, t.party) : null;
      const transfer =
        earlier ??
        (await stripe.transfers.create(
          {
            amount: t.cents,
            currency: data.currency.toLowerCase(),
            destination: t.destination,
            transfer_group: data.bookingId,
            source_transaction: data.chargeId,
            metadata: { bookingId: data.bookingId, paymentId: op.paymentId!, party: t.party, operationId: op.id },
          },
          // Same key format as before operations existed, so an in-flight payout from then is recognised.
          { idempotencyKey: `payout-${op.paymentId}-${t.party}` },
        ));
      data.ids[t.party] = transfer.id;
      await saveOperationData(op.id, data);
    }

    await prisma.$transaction(async (tx) => {
      await lockPayment(tx, op.paymentId!);
      const flipped = await tx.financialOperation.updateMany({
        where: { id: op.id, status: "pending" },
        data: { status: "completed", completedAt: now, lockedUntil: null, nextAttemptAt: null, lastError: null },
      });
      if (flipped.count !== 1) throw new Error(`Payout ${op.id} was already booked`);
      const base = { organizationId: op.organizationId, bookingId: data.bookingId, paymentId: op.paymentId, operationId: op.id };
      await tx.ledgerEntry.createMany({
        data: [
          ...data.ledger.map((l) => ({ ...base, ...l })),
          ...data.transfers.map((t) => ({
            ...base,
            type: "transfer",
            party: t.party,
            amountCents: t.cents,
            artistId: t.party === "artist" ? data.artistId : null,
            stripeObjectId: data.ids[t.party]!,
          })),
        ],
      });
      await tx.payment.update({ where: { id: op.paymentId! }, data: { transferredAt: now } });
    }, moneyTx);
    return { transferred: data.transfers.reduce((sum, t) => sum + t.cents, 0), status: "completed" as const };
  } catch (error) {
    // A payout always retries (a missing balance or a disabled account is usually fixed later); an operator sees it in review.
    const status = await failAttempt(op, error, { moneyMoved: true }, now);
    console.error(`[finance] payout ${op.id} attempt ${op.attempts} failed`, error);
    return { transferred: 0, status };
  }
}

/** Once every Stripe payment of a booking is paid out, marks it and settles a fully paid, completed booking. */
async function settleIfPaidOut(bookingId: string, now: Date) {
  const left = await prisma.payment.count({ where: { bookingId, method: "stripe", transferredAt: null } });
  if (left > 0) return;
  await prisma.booking.updateMany({ where: { id: bookingId, paidOutAt: null }, data: { paidOutAt: now } });
  const fresh = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId }, select: { organizationId: true, status: true, paidCents: true, totalCents: true } });
  if (fresh.status === "completed" && fresh.paidCents >= fresh.totalCents) {
    try {
      await changeBookingStatus(fresh.organizationId, bookingId, "settle", { actor: "system", actorId: null }, now);
    } catch (error) {
      // Settled by someone else meanwhile.
      if (!(error instanceof BookingError)) throw error;
    }
  }
}

/** Pays out every booking whose dispute window has passed. Called by the worker. */
export async function runDuePayouts(stripe: Stripe, now = new Date()) {
  const { payoutDisputeWindowDays } = await getSetting("bookings.defaults");
  const due = await prisma.booking.findMany({
    where: {
      status: { in: ["completed", "settled"] },
      disputed: false,
      completedAt: { lte: new Date(now.getTime() - payoutDisputeWindowDays * 86_400_000) },
      payments: { some: { method: "stripe", transferredAt: null } },
    },
    select: { id: true },
  });
  let count = 0;
  for (const b of due) {
    try {
      if ((await payoutBooking(stripe, b.id, now)).transferred > 0) count++;
    } catch (error) {
      // One booking's problem mustn't stop the others.
      console.error("[finance] payout of booking failed", b.id, error);
    }
  }
  return count;
}

/**
 * Continues refunds and payouts that didn't finish (timeouts, crashes,
 * Stripe errors), with backoff. Called by the worker every few minutes.
 */
export async function runFinancialOperations(stripe: Stripe, now = new Date()): Promise<Record<string, number>> {
  const due = await dueOperations(now);
  const outcome: Record<string, number> = {};
  for (const op of due) {
    let status: string;
    try {
      if (op.kind === "refund") status = (await executeRefund(stripe, op.id, now)).status;
      else {
        status = (await executePayout(stripe, op.id, now)).status;
        if (status === "completed") await settleIfPaidOut(op.bookingId!, now);
      }
    } catch (error) {
      status = "failed";
      console.error(`[finance] ${op.kind} ${op.id} failed`, error);
    }
    outcome[status] = (outcome[status] ?? 0) + 1;
  }
  return { due: due.length, ...outcome };
}
