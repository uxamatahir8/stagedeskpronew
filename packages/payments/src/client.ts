import Stripe from "stripe";

let cached: Stripe | null | undefined;

/**
 * The Stripe client, or null when STRIPE_SECRET_KEY isn't set. Callers show
 * "Stripe isn't connected yet" instead of failing. STRIPE_API_BASE points the
 * client at stripe-mock (e.g. http://localhost:12111) for local testing.
 */
export function getStripe(): Stripe | null {
  if (cached !== undefined) return cached;
  const key = process.env["STRIPE_SECRET_KEY"];
  if (!key) return (cached = null);
  const base = process.env["STRIPE_API_BASE"] ? new URL(process.env["STRIPE_API_BASE"]) : null;
  cached = new Stripe(key, {
    maxNetworkRetries: 2,
    appInfo: { name: "StageDesk" },
    ...(base ? { host: base.hostname, port: base.port, protocol: base.protocol.replace(":", "") as "http" | "https" } : {}),
  });
  return cached;
}

export const isStripeConfigured = () => getStripe() !== null;

export type { Stripe };
