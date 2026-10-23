import Stripe from "stripe";
import { getSecret } from "@stagedesk/db";

export interface StripeConfig {
  secretKey: string | null;
  publishableKey: string | null;
  webhookSecret: string | null;
  /** Where the secret key came from: entered in the dashboard, or the .env fallback. */
  source: "dashboard" | "env" | null;
  mode: "test" | "live" | null;
}

const TTL_MS = 30_000;
let config: { value: StripeConfig; at: number } | null = null;
let client: { key: string; stripe: Stripe } | null = null;

const modeOf = (key: string | null) => (key?.startsWith("sk_live_") || key?.startsWith("rk_live_") ? "live" : key ? "test" : null);

/**
 * Stripe credentials: the ones the platform admin entered under Settings →
 * Payments, otherwise STRIPE_* from .env. Cached briefly so every process
 * (web and worker) picks up a change within half a minute.
 */
export async function stripeConfig(): Promise<StripeConfig> {
  if (config && Date.now() - config.at < TTL_MS) return config.value;
  const [secret, publishable, webhook] = await Promise.all([getSecret("stripe.secretKey"), getSecret("stripe.publishableKey"), getSecret("stripe.webhookSecret")]);
  const secretKey = secret ?? (process.env["STRIPE_SECRET_KEY"] || null);
  const value: StripeConfig = {
    secretKey,
    publishableKey: publishable ?? (process.env["STRIPE_PUBLISHABLE_KEY"] || null),
    webhookSecret: webhook ?? (process.env["STRIPE_WEBHOOK_SECRET"] || null),
    source: secret ? "dashboard" : secretKey ? "env" : null,
    mode: modeOf(secretKey),
  };
  config = { value, at: Date.now() };
  return value;
}

/** Call after saving credentials so this process uses them right away. */
export function resetStripeConfig() {
  config = null;
  client = null;
}

/**
 * The Stripe client, or null when no secret key is set. Callers show "Stripe
 * isn't connected yet" instead of failing. STRIPE_API_BASE points the client
 * at stripe-mock (e.g. http://localhost:12111) for local testing.
 */
export async function getStripe(): Promise<Stripe | null> {
  const { secretKey } = await stripeConfig();
  if (!secretKey) return null;
  if (client?.key === secretKey) return client.stripe;
  client = { key: secretKey, stripe: createStripe(secretKey) };
  return client.stripe;
}

/** A client for a given key, e.g. to test a key before saving it. */
export function createStripe(secretKey: string) {
  const base = process.env["STRIPE_API_BASE"] ? new URL(process.env["STRIPE_API_BASE"]) : null;
  return new Stripe(secretKey, {
    maxNetworkRetries: 2,
    appInfo: { name: "StageDesk" },
    ...(base ? { host: base.hostname, port: base.port, protocol: base.protocol.replace(":", "") as "http" | "https" } : {}),
  });
}

export const isStripeConfigured = async () => (await getStripe()) !== null;

export type { Stripe };
