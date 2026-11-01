import type Stripe from "stripe";
import { Prisma, prisma } from "@stagedesk/db";
import { adjustCommissionsForCharge, attributeSubscriptionPromo, recordInvoiceCommission } from "./affiliates";
import { recordStripePayment } from "./booking-payments";
import { applyStripeAccount } from "./connect";
import { syncChargeRefund } from "./refunds";
import { applyStripeSubscription } from "./subscriptions";

/**
 * Verifies a webhook and stores it once by event id. Returns the event id to
 * process, or null for a duplicate delivery.
 */
export async function receiveWebhook(stripe: Stripe, rawBody: string, signature: string, secret: string) {
  const event = stripe.webhooks.constructEvent(rawBody, signature, secret);
  try {
    await prisma.stripeEvent.create({ data: { id: event.id, type: event.type, payload: event as unknown as Prisma.InputJsonValue } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return null;
    throw error;
  }
  return event.id;
}

/** Attempts before an event is parked as "dead" for a person to replay. */
export const MAX_EVENT_ATTEMPTS = 10;
/** How long one process may work on an event before another may take over (a crash releases it). */
const EVENT_CLAIM_MS = 5 * 60_000;

/** Backoff after the n-th failure: 1, 2, 4 … minutes, at most 6 hours. */
export const eventRetryDelayMs = (attempts: number) => Math.min(2 ** Math.max(0, attempts - 1) * 60_000, 6 * 60 * 60_000);

/**
 * Processes a stored event. One process at a time: the event is claimed with
 * a conditional update (received/failed, or a claim that ran out), so two
 * workers or the web app and a worker never run the same event's effects at
 * once. Handlers are idempotent besides, so a crash after an effect but before
 * "processed" is safe to repeat. Failures back off; after MAX_EVENT_ATTEMPTS
 * the event is "dead" until replayed.
 */
export async function processStoredEvent(stripe: Stripe, eventId: string, now = new Date()) {
  const claimed = await prisma.stripeEvent.updateMany({
    where: {
      id: eventId,
      OR: [{ status: { in: ["received", "failed"] } }, { status: "processing", lockedUntil: { lt: now } }],
    },
    data: { status: "processing", lockedUntil: new Date(now.getTime() + EVENT_CLAIM_MS), attempts: { increment: 1 } },
  });
  const stored = await prisma.stripeEvent.findUnique({ where: { id: eventId } });
  if (!stored) return "missing";
  if (claimed.count === 0) return stored.status;
  try {
    const handled = await handleEvent(stripe, stored.payload as unknown as Stripe.Event);
    const status = handled ? "processed" : "ignored";
    await prisma.stripeEvent.update({ where: { id: eventId }, data: { status, processedAt: new Date(), error: null, lockedUntil: null, nextAttemptAt: null } });
    return status;
  } catch (error) {
    const dead = stored.attempts >= MAX_EVENT_ATTEMPTS;
    await prisma.stripeEvent.update({
      where: { id: eventId },
      data: {
        status: dead ? "dead" : "failed",
        error: String(error).slice(0, 5000),
        lockedUntil: null,
        nextAttemptAt: dead ? null : new Date(now.getTime() + eventRetryDelayMs(stored.attempts)),
      },
    });
    if (dead) console.error(`[stripe] event ${eventId} (${stored.type}) gave up after ${stored.attempts} attempts`, error);
    throw error;
  }
}

/** Events the worker should (re)process now: never run, failed and past their backoff, or abandoned mid-run. */
export async function dueStripeEvents(now = new Date(), take = 100) {
  const rows = await prisma.stripeEvent.findMany({
    where: {
      OR: [
        // Received a minute ago and still not run: the web app's attempt never happened.
        { status: "received", receivedAt: { lt: new Date(now.getTime() - 60_000) } },
        { status: "failed", OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] },
        { status: "processing", lockedUntil: { lt: now } },
      ],
    },
    select: { id: true },
    orderBy: { receivedAt: "asc" },
    take,
  });
  return rows.map((r) => r.id);
}

/** Runs due events (worker). Returns counts per outcome. */
export async function retryStripeEvents(stripe: Stripe, now = new Date()) {
  const ids = await dueStripeEvents(now);
  const outcome: Record<string, number> = {};
  for (const id of ids) {
    const status = await processStoredEvent(stripe, id, now).catch(() => "failed");
    outcome[status] = (outcome[status] ?? 0) + 1;
  }
  return { due: ids.length, ...outcome };
}

/** Puts a failed, dead or ignored event back in line (platform admin). Handlers are idempotent, so this is safe. */
export async function replayStripeEvent(eventId: string) {
  const reset = await prisma.stripeEvent.updateMany({
    where: { id: eventId, status: { in: ["failed", "dead", "ignored", "processed"] } },
    data: { status: "received", attempts: 0, nextAttemptAt: null, lockedUntil: null },
  });
  return reset.count === 1;
}

async function handleEvent(stripe: Stripe, event: Stripe.Event): Promise<boolean> {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object;
      if (session.mode === "subscription" && typeof session.subscription === "string") {
        await applyStripeSubscription(await stripe.subscriptions.retrieve(session.subscription));
        return true;
      }
      if (session.mode === "payment") {
        await recordStripePayment(stripe, session);
        return true;
      }
      return false;
    }
    case "customer.subscription.created":
      await applyStripeSubscription(event.data.object);
      await attributeSubscriptionPromo(stripe, event.data.object);
      return true;
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await applyStripeSubscription(event.data.object);
      return true;
    case "invoice.payment_failed":
    case "invoice.paid": {
      // The subscription events carry the status; refresh to pick up past_due / active.
      const subscriptionId = event.data.object.parent?.subscription_details?.subscription;
      const id = typeof subscriptionId === "string" ? subscriptionId : subscriptionId?.id;
      if (!id) return false;
      const sub = await stripe.subscriptions.retrieve(id);
      await applyStripeSubscription(sub);
      if (event.type === "invoice.paid") {
        // The promo code decides the referral before the first commission is booked.
        await attributeSubscriptionPromo(stripe, sub);
        await recordInvoiceCommission(stripe, event.data.object);
      }
      return true;
    }
    case "account.updated":
      await applyStripeAccount(event.data.object);
      return true;
    case "charge.refunded": {
      // A booking payment refunded in the Stripe dashboard, or a subscription invoice (commissions).
      const booked = await syncChargeRefund(event.data.object);
      const adjusted = await adjustCommissionsForCharge(event.data.object, "refund");
      return booked > 0 || adjusted > 0;
    }
    case "charge.dispute.created":
    case "charge.dispute.closed": {
      const dispute = event.data.object;
      const adjusted =
        event.type === "charge.dispute.created"
          ? await adjustCommissionsForCharge({ payment_intent: dispute.payment_intent, amount: dispute.amount, amount_refunded: 0 }, "dispute")
          : 0;
      const chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge.id;
      const payment = await prisma.payment.findFirst({ where: { stripeChargeId: chargeId } });
      if (!payment) return adjusted > 0;
      const open = event.type === "charge.dispute.created";
      const lost = !open && dispute.status === "lost";
      const type = open ? "dispute" : lost ? "dispute_lost" : "dispute_won";
      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${payment.bookingId} FOR UPDATE`;
        // Once per dispute and outcome, however often Stripe sends the event.
        if (await tx.ledgerEntry.findFirst({ where: { stripeObjectId: dispute.id, type }, select: { id: true } })) return;
        // Stripe doesn't promise order: an "opened" arriving after the close changes nothing.
        if (open && (await tx.ledgerEntry.findFirst({ where: { stripeObjectId: dispute.id, type: { in: ["dispute_won", "dispute_lost"] } }, select: { id: true } }))) return;
        await tx.booking.update({ where: { id: payment.bookingId }, data: { disputed: open } });
        await tx.ledgerEntry.create({
          data: {
            organizationId: payment.organizationId,
            bookingId: payment.bookingId,
            paymentId: payment.id,
            type,
            party: "platform",
            amountCents: open ? -dispute.amount : lost ? 0 : dispute.amount,
            stripeObjectId: dispute.id,
          },
        });
        await tx.bookingEvent.create({
          data: { organizationId: payment.organizationId, bookingId: payment.bookingId, type: open ? "dispute_opened" : "dispute_closed", data: { status: dispute.status } },
        });
      });
      return true;
    }
    default:
      return false;
  }
}

/** The events StageDesk handles; the webhook endpoint in Stripe should send exactly these. */
export const handledStripeEvents = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "charge.refunded",
  "charge.dispute.created",
  "charge.dispute.closed",
  "account.updated",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
] as const;
