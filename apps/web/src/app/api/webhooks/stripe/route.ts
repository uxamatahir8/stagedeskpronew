import { getStripe, processStoredEvent, receiveWebhook } from "@stagedesk/payments";

/**
 * Stripe webhooks. Each event is verified, stored once by id and processed
 * straight away; if processing fails, the worker's retry job picks it up.
 * Stripe always gets a 200 once the event is safely stored.
 */
export async function POST(request: Request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) return new Response("Stripe isn't configured", { status: 503 });

  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  let eventId: string | null;
  try {
    eventId = await receiveWebhook(stripe, await request.text(), signature, secret);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }
  if (eventId) await processStoredEvent(stripe, eventId).catch((error: unknown) => console.error("[stripe] event failed", eventId, error));
  return Response.json({ received: true });
}
