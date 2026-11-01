import { randomUUID } from "node:crypto";
import type Stripe from "stripe";
import { refundReversal } from "@stagedesk/core";
import { Prisma, prisma } from "@stagedesk/db";
import {
  claimOperation,
  failAttempt,
  findTagged,
  isUniqueViolation,
  lockPayment,
  type Operation,
  openOperation,
  moneyTx,
  saveOperationData,
} from "./operations";
import { PaymentsError } from "./subscriptions";

/** What a refund operation stores while it runs. */
interface RefundData {
  /** The Stripe refund, once created. */
  refundId?: string;
  /** Decided once, when the payment had already been transferred. */
  reversal?: {
    artist: number;
    agency: number;
    platform: number;
    transferIds: { artist: string | null; agency: string | null };
    artistId: string | null;
  };
  reversalIds?: { artist?: string; agency?: string };
}

export type RefundResult = { refunded: number; status: "completed" | "pending" | "failed" | "review"; operationId: string };

/**
 * Refunds (part of) a payment. Stripe payments are refunded through Stripe;
 * if the money was already transferred, the same fraction is reversed from
 * the artist's and agency's transfers. Offline payments are recorded as a
 * negative payment (the agency returns the money itself).
 *
 * `requestId` identifies the request (one per refund form): submitting it
 * twice continues the same refund instead of refunding again. Only one refund
 * or payout of a payment runs at a time ("operation_in_progress").
 */
export async function refundPayment(
  stripe: Stripe | null,
  input: { organizationId: string; paymentId: string; amountCents: number; actorId: string; requestId?: string },
): Promise<RefundResult> {
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) throw new PaymentsError("invalid_amount");
  const key = `refund:${input.requestId ?? randomUUID()}`;

  const repeated = await prisma.financialOperation.findUnique({ where: { key } });
  if (repeated) return continueRepeated(stripe, repeated, input);

  let op: Operation & { repeated?: boolean };
  try {
    op = await prisma.$transaction(async (tx) => {
      await lockPayment(tx, input.paymentId);
      // The same request, sent again while the first was still reserving.
      const same = await tx.financialOperation.findUnique({ where: { key } });
      if (same) return { ...same, repeated: true };
      const payment = await tx.payment.findFirst({
        where: { id: input.paymentId, organizationId: input.organizationId, kind: { not: "refund" } },
        include: { booking: { select: { currency: true } } },
      });
      if (!payment) throw new PaymentsError("not_found");
      if (await openOperation(tx, payment.id)) throw new PaymentsError("operation_in_progress");
      if (input.amountCents > payment.amountCents - payment.refundedCents) throw new PaymentsError("invalid_amount");
      const base = {
        kind: "refund",
        key,
        organizationId: input.organizationId,
        bookingId: payment.bookingId,
        paymentId: payment.id,
        amountCents: input.amountCents,
        currency: payment.booking.currency,
        actorId: input.actorId,
      };

      if (payment.method !== "stripe") {
        // Nothing to call: the whole refund is one transaction.
        const created = await tx.financialOperation.create({ data: { ...base, id: randomUUID(), status: "pending", data: {} } });
        await tx.payment.create({
          data: {
            id: randomUUID(),
            organizationId: input.organizationId,
            bookingId: payment.bookingId,
            kind: "refund",
            method: payment.method,
            amountCents: -input.amountCents,
            receivedAt: new Date(),
            reference: payment.id,
            recordedById: input.actorId,
          },
        });
        await bookRefund(tx, created, [{ type: "refund", party: "customer", amountCents: input.amountCents }]);
        return { ...created, status: "completed" };
      }
      if (!stripe || !payment.stripePaymentIntentId) throw new PaymentsError("agency_not_connected");
      return tx.financialOperation.create({ data: { ...base, id: randomUUID(), status: "pending", data: {} } });
    }, moneyTx);
  } catch (error) {
    // The same request submitted twice at once: continue the one that won.
    if (isUniqueViolation(error)) return continueRepeated(stripe, await prisma.financialOperation.findUniqueOrThrow({ where: { key } }), input);
    throw error;
  }
  if (op.repeated) return continueRepeated(stripe, op, input);
  if (op.status === "completed") return { refunded: op.amountCents, status: "completed", operationId: op.id };
  return executeRefund(stripe!, op.id);
}

async function continueRepeated(stripe: Stripe | null, op: Operation, input: { organizationId: string; paymentId: string; amountCents: number }) {
  if (op.kind !== "refund" || op.organizationId !== input.organizationId || op.paymentId !== input.paymentId || op.amountCents !== input.amountCents) {
    throw new PaymentsError("invalid_amount");
  }
  if (op.status === "pending" && stripe) return executeRefund(stripe, op.id);
  return { refunded: op.status === "completed" ? op.amountCents : 0, status: op.status as RefundResult["status"], operationId: op.id };
}

/**
 * Continues a pending refund: creates the Stripe refund and any transfer
 * reversals that don't exist yet, then books it. Safe to call any number of
 * times, from the request or the worker.
 */
export async function executeRefund(stripe: Stripe, operationId: string, now = new Date()): Promise<RefundResult> {
  const op = await claimOperation(operationId, now);
  if (!op) {
    const current = await prisma.financialOperation.findUniqueOrThrow({ where: { id: operationId } });
    return { refunded: current.status === "completed" ? current.amountCents : 0, status: current.status as RefundResult["status"], operationId };
  }
  const data = { ...(op.data as RefundData) };
  try {
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: op.paymentId! } });
    const intent = payment.stripePaymentIntentId!;

    if (!data.refundId) {
      // An earlier attempt may have reached Stripe without us hearing back.
      const earlier = op.attempts > 1 ? await findTagged(() => stripe.refunds.list({ payment_intent: intent, limit: 100 }), op.id) : null;
      const refund =
        earlier ??
        (await stripe.refunds.create(
          { payment_intent: intent, amount: op.amountCents, metadata: { paymentId: payment.id, operationId: op.id } },
          { idempotencyKey: `refund-op-${op.id}` },
        ));
      data.refundId = refund.id;
      await saveOperationData(op.id, data);
    }

    if (payment.transferredAt && !data.reversal) {
      // Decided once and stored, so a retry reverses exactly the same amounts.
      const transfers = await prisma.ledgerEntry.findMany({ where: { paymentId: payment.id, type: { in: ["transfer", "transfer_reversal"] } } });
      const net = (party: string) => transfers.filter((t) => t.party === party).reduce((sum, t) => sum + t.amountCents, 0);
      const transferId = (party: string) => transfers.find((t) => t.party === party && t.type === "transfer")?.stripeObjectId ?? null;
      const split = refundReversal({
        paymentCents: payment.amountCents,
        refundCents: op.amountCents,
        artistTransferred: net("artist"),
        agencyTransferred: net("agency"),
      });
      data.reversal = {
        ...split,
        transferIds: { artist: transferId("artist"), agency: transferId("agency") },
        artistId: transfers.find((t) => t.party === "artist")?.artistId ?? null,
      };
      await saveOperationData(op.id, data);
    }

    if (data.reversal) {
      data.reversalIds ??= {};
      for (const party of ["artist", "agency"] as const) {
        const transferId = data.reversal.transferIds[party];
        const cents = data.reversal[party];
        if (!transferId || cents <= 0 || data.reversalIds[party]) continue;
        const earlier =
          op.attempts > 1 ? await findTagged(() => stripe.transfers.listReversals(transferId, { limit: 100 }), op.id, party) : null;
        const reversal =
          earlier ??
          (await stripe.transfers.createReversal(
            transferId,
            { amount: cents, metadata: { paymentId: payment.id, operationId: op.id, party } },
            { idempotencyKey: `reversal-op-${op.id}-${party}` },
          ));
        data.reversalIds[party] = reversal.id;
        await saveOperationData(op.id, data);
      }
    }

    await prisma.$transaction(async (tx) => {
      await lockPayment(tx, payment.id);
      await bookRefund(tx, op, refundLedger(op, data), now);
    }, moneyTx);
    await reconcileCharge(stripe, payment.stripeChargeId);
    return { refunded: op.amountCents, status: "completed", operationId: op.id };
  } catch (error) {
    const status = await failAttempt(op, error, { moneyMoved: Boolean(data.refundId) }, now);
    // A refused refund releases its reservation; pick up anything refunded in the dashboard meanwhile.
    if (status === "failed") await reconcileCharge(stripe, (await prisma.payment.findUnique({ where: { id: op.paymentId! } }))?.stripeChargeId ?? null);
    if (status === "failed") throw new PaymentsError("refund_refused");
    return { refunded: 0, status, operationId: op.id };
  }
}

type LedgerLine = { type: string; party: string; amountCents: number; artistId?: string | null; stripeObjectId?: string | null };

function refundLedger(op: Operation, data: RefundData): LedgerLine[] {
  const lines: LedgerLine[] = [{ type: "refund", party: "customer", amountCents: op.amountCents, stripeObjectId: data.refundId ?? null }];
  const r = data.reversal;
  if (r) {
    let shortfall = 0;
    for (const party of ["artist", "agency"] as const) {
      if (!r.transferIds[party] || r[party] <= 0) continue;
      const id = data.reversalIds?.[party];
      if (id) lines.push({ type: "transfer_reversal", party, amountCents: -r[party], artistId: party === "artist" ? r.artistId : null, stripeObjectId: id });
      else shortfall += r[party];
    }
    lines.push({ type: "refund_cost", party: "platform", amountCents: -r.platform });
    // Only after an operator closed it without every reversal: the platform covered the rest.
    if (shortfall > 0) lines.push({ type: "reversal_shortfall", party: "platform", amountCents: -shortfall });
  }
  return lines;
}

/** Books a refund exactly once: the operation flips to completed in the same transaction. */
async function bookRefund(tx: Prisma.TransactionClient, op: Operation, lines: LedgerLine[], now = new Date()) {
  const flipped = await tx.financialOperation.updateMany({
    where: { id: op.id, status: { in: ["pending", "review"] } },
    data: { status: "completed", completedAt: now, lockedUntil: null, nextAttemptAt: null, lastError: null },
  });
  if (flipped.count !== 1) throw new Error(`Refund ${op.id} was already booked`);
  const base = { organizationId: op.organizationId, bookingId: op.bookingId, paymentId: op.paymentId, operationId: op.id };
  await tx.payment.update({ where: { id: op.paymentId! }, data: { refundedCents: { increment: op.amountCents } } });
  await tx.booking.update({ where: { id: op.bookingId! }, data: { paidCents: { decrement: op.amountCents } } });
  await tx.ledgerEntry.createMany({ data: lines.map((l) => ({ ...base, ...l })) });
  await tx.bookingEvent.create({
    data: { organizationId: op.organizationId, bookingId: op.bookingId!, type: "refund", actorId: op.actorId, data: { amountCents: op.amountCents } },
  });
}

/**
 * Operator action for a refund in review whose Stripe refund went through but
 * a transfer reversal can't be made: books it as it stands, with the missing
 * reversal recorded as a platform shortfall.
 */
export async function closeRefundWithShortfall(operationId: string) {
  const op = await prisma.financialOperation.findUniqueOrThrow({ where: { id: operationId } });
  const data = op.data as RefundData;
  if (op.kind !== "refund" || op.status !== "review" || !data.refundId) throw new PaymentsError("invalid_amount");
  await prisma.$transaction(async (tx) => {
    await lockPayment(tx, op.paymentId!);
    await bookRefund(tx, op, refundLedger(op, data));
  }, moneyTx);
}

/** Best effort: brings the payment in line with what Stripe says was refunded on the charge. */
async function reconcileCharge(stripe: Stripe, chargeId: string | null) {
  if (!chargeId) return;
  try {
    const charge = await stripe.charges.retrieve(chargeId);
    await syncChargeRefund(charge);
  } catch (error) {
    console.error("[finance] charge reconciliation failed", chargeId, error);
  }
}

/**
 * A refund made outside StageDesk (in the Stripe dashboard) still has to show
 * on the booking. Records whatever Stripe refunded beyond what we already
 * know, counting refunds of ours that are still being booked as known, so a
 * webhook arriving mid-refund doesn't count it twice. Transfers are not
 * reversed automatically; that stays with the platform admin.
 */
export async function syncChargeRefund(charge: Pick<Stripe.Charge, "id" | "amount_refunded">) {
  const found = await prisma.payment.findFirst({ where: { stripeChargeId: charge.id, kind: { not: "refund" } }, select: { id: true } });
  if (!found) return 0;
  return prisma.$transaction(async (tx) => {
    await lockPayment(tx, found.id);
    const payment = await tx.payment.findUniqueOrThrow({ where: { id: found.id } });
    const inFlight = await tx.financialOperation.aggregate({
      where: { paymentId: payment.id, kind: "refund", status: { in: ["pending", "review"] } },
      _sum: { amountCents: true },
    });
    const extra = Math.min(charge.amount_refunded, payment.amountCents) - payment.refundedCents - (inFlight._sum.amountCents ?? 0);
    if (extra <= 0) return 0;
    await tx.payment.update({ where: { id: payment.id }, data: { refundedCents: { increment: extra } } });
    await tx.booking.update({ where: { id: payment.bookingId }, data: { paidCents: { decrement: extra } } });
    await tx.ledgerEntry.create({
      data: { organizationId: payment.organizationId, bookingId: payment.bookingId, paymentId: payment.id, type: "refund", party: "customer", amountCents: extra, stripeObjectId: charge.id },
    });
    await tx.bookingEvent.create({
      data: { organizationId: payment.organizationId, bookingId: payment.bookingId, type: "refund", data: { amountCents: extra, source: "stripe" } },
    });
    return extra;
  }, moneyTx);
}
