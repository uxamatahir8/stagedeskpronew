import type Stripe from "stripe";
import { recordStripePayment } from "./booking-payments";
import { applyStripeSubscription } from "./subscriptions";

/**
 * Someone came back from Stripe Checkout: read the session straight from
 * Stripe and apply it, so the page is right without waiting for the webhook
 * (which may be slow, or not set up on a dev machine). Idempotent with the
 * webhook. Only acts on a session that belongs to the given agency (and booking).
 */
export async function confirmCheckoutSession(stripe: Stripe, sessionId: string, expect: { organizationId: string; bookingId?: string }) {
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return null;
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.metadata?.["organizationId"] !== expect.organizationId) return null;
  if (expect.bookingId && session.metadata?.["bookingId"] !== expect.bookingId) return null;
  if (session.status !== "complete") return null;
  if (session.mode === "subscription") {
    const id = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
    return id ? { subscription: await applyStripeSubscription(await stripe.subscriptions.retrieve(id)) } : null;
  }
  if (session.mode === "payment") return { paymentId: await recordStripePayment(stripe, session) };
  return null;
}
