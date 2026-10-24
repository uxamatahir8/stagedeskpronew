import { randomUUID } from "node:crypto";
import type Stripe from "stripe";
import { refundReversal } from "@stagedesk/core";
import { prisma, tenantDb } from "@stagedesk/db";
import { PaymentsError } from "./subscriptions";

/**
 * Refunds (part of) a payment. Stripe payments are refunded through Stripe;
 * if the money was already transferred, the same fraction is reversed from
 * the artist's and agency's transfers. Offline payments are recorded as a
 * negative payment (the agency returns the money itself).
 */
export async function refundPayment(
  stripe: Stripe | null,
  input: { organizationId: string; paymentId: string; amountCents: number; actorId: string },
) {
  const db = tenantDb(input.organizationId);
  const payment = await db.payment.findFirst({ where: { id: input.paymentId, kind: { not: "refund" } } });
  if (!payment) throw new PaymentsError("not_found");
  const refundable = payment.amountCents - payment.refundedCents;
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0 || input.amountCents > refundable) {
    throw new PaymentsError("invalid_amount");
  }
  const amount = input.amountCents;
  const base = { organizationId: input.organizationId, bookingId: payment.bookingId, paymentId: payment.id };
  const ledger: { type: string; party: string; amountCents: number; artistId?: string | null; stripeObjectId?: string | null }[] = [];

  if (payment.method === "stripe") {
    if (!stripe || !payment.stripePaymentIntentId) throw new PaymentsError("agency_not_connected");
    const refund = await stripe.refunds.create(
      { payment_intent: payment.stripePaymentIntentId, amount, metadata: { paymentId: payment.id } },
      { idempotencyKey: `refund-${payment.id}-${payment.refundedCents}-${amount}` },
    );
    ledger.push({ type: "refund", party: "customer", amountCents: amount, stripeObjectId: refund.id });

    if (payment.transferredAt) {
      const transfers = await prisma.ledgerEntry.findMany({ where: { paymentId: payment.id, type: { in: ["transfer", "transfer_reversal"] } } });
      const net = (party: string) => transfers.filter((t) => t.party === party).reduce((sum, t) => sum + t.amountCents, 0);
      const transferId = (party: string) => transfers.find((t) => t.party === party && t.type === "transfer")?.stripeObjectId ?? null;
      const artistId = transfers.find((t) => t.party === "artist")?.artistId ?? null;
      const reversal = refundReversal({
        paymentCents: payment.amountCents,
        refundCents: amount,
        artistTransferred: net("artist"),
        agencyTransferred: net("agency"),
      });
      for (const [party, cents] of [["artist", reversal.artist], ["agency", reversal.agency]] as const) {
        const id = transferId(party);
        if (!id || cents <= 0) continue;
        const r = await stripe.transfers.createReversal(id, { amount: cents }, { idempotencyKey: `reversal-${payment.id}-${party}-${payment.refundedCents}-${amount}` });
        ledger.push({ type: "transfer_reversal", party, amountCents: -cents, artistId: party === "artist" ? artistId : null, stripeObjectId: r.id });
      }
      ledger.push({ type: "refund_cost", party: "platform", amountCents: -reversal.platform });
    }
  } else {
    await db.payment.create({
      data: {
        id: randomUUID(),
        organizationId: input.organizationId,
        bookingId: payment.bookingId,
        kind: "refund",
        method: payment.method,
        amountCents: -amount,
        receivedAt: new Date(),
        reference: payment.id,
        recordedById: input.actorId,
      },
    });
    ledger.push({ type: "refund", party: "customer", amountCents: amount });
  }

  await prisma.$transaction([
    prisma.payment.update({ where: { id: payment.id }, data: { refundedCents: { increment: amount } } }),
    prisma.booking.update({ where: { id: payment.bookingId }, data: { paidCents: { decrement: amount } } }),
    prisma.ledgerEntry.createMany({ data: ledger.map((l) => ({ ...base, ...l })) }),
    prisma.bookingEvent.create({
      data: { organizationId: input.organizationId, bookingId: payment.bookingId, type: "refund", actorId: input.actorId, data: { amountCents: amount } },
    }),
  ]);
  return { refunded: amount };
}

/**
 * A refund made outside StageDesk (in the Stripe dashboard) still has to show
 * on the booking. Records whatever Stripe refunded beyond what we already
 * know; refunds made here were counted already, so this is then a no-op.
 * Transfers are not reversed automatically; that stays with the platform admin.
 */
export async function syncChargeRefund(charge: Pick<Stripe.Charge, "id" | "amount_refunded">) {
  const payment = await prisma.payment.findFirst({ where: { stripeChargeId: charge.id, kind: { not: "refund" } } });
  if (!payment) return 0;
  const extra = Math.min(charge.amount_refunded, payment.amountCents) - payment.refundedCents;
  if (extra <= 0) return 0;
  await prisma.$transaction([
    prisma.payment.update({ where: { id: payment.id }, data: { refundedCents: { increment: extra } } }),
    prisma.booking.update({ where: { id: payment.bookingId }, data: { paidCents: { decrement: extra } } }),
    prisma.ledgerEntry.create({
      data: { organizationId: payment.organizationId, bookingId: payment.bookingId, paymentId: payment.id, type: "refund", party: "customer", amountCents: extra, stripeObjectId: charge.id },
    }),
    prisma.bookingEvent.create({
      data: { organizationId: payment.organizationId, bookingId: payment.bookingId, type: "refund", data: { amountCents: extra, source: "stripe" } },
    }),
  ]);
  return extra;
}
