import "server-only";
import { confirmCheckoutSession, getStripe } from "@stagedesk/payments";

/**
 * Back from Stripe Checkout with `?session_id=`: apply the result now instead
 * of waiting for the webhook. Never fails the page; the webhook still follows.
 */
export async function confirmCheckoutReturn(sessionId: unknown, expect: { organizationId: string; bookingId?: string }) {
  if (typeof sessionId !== "string" || !sessionId) return;
  const stripe = await getStripe();
  if (!stripe) return;
  await confirmCheckoutSession(stripe, sessionId, expect).catch((error: unknown) => console.error("[checkout] return", error));
}
