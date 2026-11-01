/**
 * Start-up check of the environment a production process runs with. Errors
 * stop the process (the web app in instrumentation, the worker before it
 * takes jobs); warnings are logged. Pure, so it can be tested and run by a
 * release check (`scripts/check-env.mjs`) before anything is deployed.
 */

export type ConfigEnv = Record<string, string | undefined>;
export type ConfigReport = { errors: string[]; warnings: string[] };

/** Values copied from .env.example or docs that must never reach production. */
const PLACEHOLDERS = [/^change[-_ ]?me/i, /^replace[-_ ]?me/i, /^your[-_]/i, /^secret$/i, /^password$/i, /^stagedesk-test-only/i, /^dev[-_]/i];
const placeholder = (value: string) => PLACEHOLDERS.some((p) => p.test(value.trim()));

function url(value: string | undefined) {
  try {
    return value ? new URL(value) : null;
  } catch {
    return null;
  }
}

export function checkProductionConfig(env: ConfigEnv, role: "web" | "worker" = "web"): ConfigReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const has = (key: string) => Boolean(env[key]?.trim());
  const need = (key: string, why: string) => {
    if (!has(key)) errors.push(`${key} is not set (${why}).`);
  };

  need("DATABASE_URL", "the database");
  need("REDIS_URL", "rate limits and job queues");
  const secret = env["BETTER_AUTH_SECRET"]?.trim() ?? "";
  if (!secret) errors.push("BETTER_AUTH_SECRET is not set (sessions and tokens).");
  else if (secret.length < 32 || placeholder(secret)) errors.push("BETTER_AUTH_SECRET is too short or a placeholder: use at least 32 random characters.");
  if (!has("SECRETS_KEY")) warnings.push("SECRETS_KEY is not set: stored secrets are encrypted with BETTER_AUTH_SECRET, so rotating it makes them unreadable.");
  else if ((env["SECRETS_KEY"] ?? "").length < 32 || placeholder(env["SECRETS_KEY"]!)) errors.push("SECRETS_KEY is too short or a placeholder.");

  const app = url(env["APP_URL"] ?? env["BETTER_AUTH_URL"]);
  if (!app) errors.push("APP_URL (or BETTER_AUTH_URL) is missing or not a URL (links in emails, auth callbacks).");
  else if (app.protocol !== "https:") errors.push(`APP_URL must use https in production (is ${app.origin}).`);
  else if (["localhost", "127.0.0.1"].includes(app.hostname)) errors.push("APP_URL points at localhost.");

  need("SMTP_HOST", "email delivery");
  need("MAIL_FROM", "the sender of every email");

  if (role === "web") {
    for (const key of ["S3_ENDPOINT", "S3_ACCESS_KEY", "S3_SECRET_KEY"]) need(key, "uploaded files");
    if (env["TURNSTILE_DISABLED"] !== "true" && (!has("TURNSTILE_SECRET_KEY") || !has("TURNSTILE_SITE_KEY"))) {
      errors.push("TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY are not set: public forms would refuse every submission. Set them, or TURNSTILE_DISABLED=true to run without CAPTCHA on purpose.");
    }
    // Cloudflare's documented test keys (1x…, 2x…, 3x…) pass or fail everything.
    if (/^[123]x0{10,}/.test(env["TURNSTILE_SECRET_KEY"] ?? "")) errors.push("TURNSTILE_SECRET_KEY is one of Cloudflare's test keys, which accept every submission.");
    if (!has("TRUSTED_PROXIES")) warnings.push("TRUSTED_PROXIES is not set: rate limits trust the first X-Forwarded-For address, which a client can choose. Set it to the number of proxies in front of the app (1 behind Caddy).");
  }
  if (!has("STRIPE_SECRET_KEY")) warnings.push("STRIPE_SECRET_KEY is not set in .env: online payments work only if the keys are entered under Settings → Payment setup.");
  if (env["STRIPE_API_BASE"]) errors.push("STRIPE_API_BASE is set: that points Stripe at a mock server. Remove it in production.");
  if (has("STRIPE_SECRET_KEY") && env["STRIPE_SECRET_KEY"]!.startsWith("sk_test_")) warnings.push("STRIPE_SECRET_KEY is a test key.");
  return { errors, warnings };
}
