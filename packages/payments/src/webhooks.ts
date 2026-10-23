import type Stripe from "stripe";
import { Prisma, prisma } from "@stagedesk/db";
import { adjustCommissionsForCharge, attributeSubscriptionPromo, recordInvoiceCommission } from "./affiliates";
import { recordStripePayment } from "./booking-payments";
import { applyStripeAccount } from "./connect";
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

/** Processes a stored event. Safe to retry: every handler is idempotent. */
export async function processStoredEvent(stripe: Stripe, eventId: string) {
  const stored = await prisma.stripeEvent.findUnique({ where: { id: eventId } });
  if (!stored || stored.status === "processed" || stored.status === "ignored") return stored?.status ?? "missing";
  try {
    const handled = await handleEvent(stripe, stored.payload as unknown as Stripe.Event);
    await prisma.stripeEvent.update({ where: { id: eventId }, data: { status: handled ? "processed" : "ignored", processedAt: new Date(), error: null } });
    return handled ? "processed" : "ignored";
  } catch (error) {
    await prisma.stripeEvent.update({ where: { id: eventId }, data: { status: "failed", error: String(error).slice(0, 5000) } });
    throw error;
  }
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
    case "charge.refunded":
      return (await adjustCommissionsForCharge(event.data.object, "refund")) > 0;
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
      await prisma.$transaction([
        prisma.booking.update({ where: { id: payment.bookingId }, data: { disputed: open } }),
        prisma.ledgerEntry.create({
          data: {
            organizationId: payment.organizationId,
            bookingId: payment.bookingId,
            paymentId: payment.id,
            type: open ? "dispute" : lost ? "dispute_lost" : "dispute_won",
            party: "platform",
            amountCents: open ? -dispute.amount : lost ? 0 : dispute.amount,
            stripeObjectId: dispute.id,
          },
        }),
        prisma.bookingEvent.create({
          data: { organizationId: payment.organizationId, bookingId: payment.bookingId, type: open ? "dispute_opened" : "dispute_closed", data: { status: dispute.status } },
        }),
      ]);
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
