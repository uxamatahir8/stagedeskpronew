import "server-only";
import { redis } from "./redis";

/**
 * Stripe webhook deliveries that were turned away before anything was stored
 * (a wrong signing secret, or no secret set). They leave no event row, so
 * without this nobody would notice that subscriptions and payments stop
 * syncing. Kept per day in Redis for two days; the admin's Payments page shows them.
 */
export type WebhookRejection = "signature" | "not_configured";

const day = (date: Date) => date.toISOString().slice(0, 10);
const countKey = (reason: WebhookRejection, date: Date) => `stripe-webhook:rejected:${reason}:${day(date)}`;

export async function recordWebhookRejection(reason: WebhookRejection, now = new Date()) {
  try {
    const key = countKey(reason, now);
    await redis.multi().incr(key).expire(key, 2 * 86_400).set("stripe-webhook:last-rejected", JSON.stringify({ reason, at: now.toISOString() }), "EX", 2 * 86_400).exec();
  } catch (error) {
    console.error("[stripe] couldn't count a rejected webhook", (error as Error).message);
  }
}

/** Rejections today and yesterday, and the latest one. */
export async function webhookRejections(now = new Date()) {
  try {
    const yesterday = new Date(now.getTime() - 86_400_000);
    const [sigToday, sigYesterday, cfgToday, cfgYesterday, last] = await redis.mget(
      countKey("signature", now),
      countKey("signature", yesterday),
      countKey("not_configured", now),
      countKey("not_configured", yesterday),
      "stripe-webhook:last-rejected",
    );
    const parsed = last ? (JSON.parse(last) as { reason: WebhookRejection; at: string }) : null;
    return {
      signature: Number(sigToday ?? 0) + Number(sigYesterday ?? 0),
      notConfigured: Number(cfgToday ?? 0) + Number(cfgYesterday ?? 0),
      last: parsed ? { reason: parsed.reason, at: new Date(parsed.at) } : null,
    };
  } catch {
    return { signature: 0, notConfigured: 0, last: null };
  }
}
