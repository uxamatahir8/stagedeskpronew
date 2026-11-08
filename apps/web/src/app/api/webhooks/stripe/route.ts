import { getStripe, processStoredEvent, receiveWebhook, stripeConfig } from "@stagedesk/payments";
import { recordWebhookRejection } from "@/lib/webhook-health";

/**
 * Stripe webhooks. Each event is verified, stored once by id and processed
 * straight away; if processing fails, the worker's retry job picks it up.
 * Stripe always gets a 200 once the event is safely stored. A delivery that
 * can't be verified is counted (lib/webhook-health) so the admin sees it;
 * one that couldn't be stored gets a 500, so Stripe tries again.
 */
export async function POST(request: Request) {
  const stripe = await getStripe();
  // Entered under Settings → Payments, or STRIPE_WEBHOOK_SECRET in .env.
  const secret = (await stripeConfig()).webhookSecret;
  if (!stripe || !secret) {
    await recordWebhookRejection("not_configured");
    return new Response("Stripe isn't configured", { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  let eventId: string | null;
  try {
    eventId = await receiveWebhook(stripe, await request.text(), signature, secret);
  } catch (error) {
    // Stripe's SDK marks a bad signature with this type (it isn't a dependency of the web app itself).
    if ((error as { type?: string } | null)?.type === "StripeSignatureVerificationError") {
      await recordWebhookRejection("signature");
      console.error("[stripe] webhook signature didn't verify: check the signing secret under Settings → Payment setup");
      return new Response("Invalid signature", { status: 400 });
    }
    console.error("[stripe] webhook couldn't be stored", error);
    return new Response("Couldn't store the event", { status: 500 });
  }
  if (eventId) await processStoredEvent(stripe, eventId).catch((error: unknown) => console.error("[stripe] event failed", eventId, error));
  return Response.json({ received: true });
}
