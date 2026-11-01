import { describe, expect, it } from "vitest";
import { checkProductionConfig } from "./config";

const good = {
  DATABASE_URL: "mysql://u:p@db:3306/stagedesk",
  REDIS_URL: "redis://redis:6379",
  BETTER_AUTH_SECRET: "x".repeat(40),
  SECRETS_KEY: "y".repeat(40),
  APP_URL: "https://stagedeskpro.com",
  SMTP_HOST: "smtp.example.com",
  MAIL_FROM: "StageDesk <hello@stagedeskpro.com>",
  S3_ENDPOINT: "https://s3.example.com",
  S3_ACCESS_KEY: "key",
  S3_SECRET_KEY: "secret-key",
  TURNSTILE_SITE_KEY: "site",
  TURNSTILE_SECRET_KEY: "secret",
  TRUSTED_PROXIES: "1",
  STRIPE_SECRET_KEY: "sk_live_abc",
};

describe("production config check", () => {
  it("accepts a complete configuration", () => {
    expect(checkProductionConfig(good)).toEqual({ errors: [], warnings: [] });
  });

  it("refuses missing essentials, weak secrets and an http or localhost URL", () => {
    const { errors } = checkProductionConfig({ ...good, DATABASE_URL: "", BETTER_AUTH_SECRET: "change-me-please-change-me-please-123", APP_URL: "http://stagedeskpro.com" });
    expect(errors.join("\n")).toMatch(/DATABASE_URL/);
    expect(errors.join("\n")).toMatch(/BETTER_AUTH_SECRET/);
    expect(errors.join("\n")).toMatch(/https/);
    expect(checkProductionConfig({ ...good, APP_URL: "https://localhost:3000" }).errors.join()).toMatch(/localhost/);
    expect(checkProductionConfig({ ...good, BETTER_AUTH_SECRET: "short" }).errors).toHaveLength(1);
  });

  it("requires CAPTCHA keys unless switched off on purpose", () => {
    expect(checkProductionConfig({ ...good, TURNSTILE_SECRET_KEY: "" }).errors.join()).toMatch(/TURNSTILE/);
    expect(checkProductionConfig({ ...good, TURNSTILE_SECRET_KEY: "", TURNSTILE_SITE_KEY: "", TURNSTILE_DISABLED: "true" }).errors).toEqual([]);
    expect(checkProductionConfig({ ...good, TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA" }).errors.join()).toMatch(/test keys/);
  });

  it("refuses a Stripe mock in production and warns about test keys", () => {
    expect(checkProductionConfig({ ...good, STRIPE_API_BASE: "http://localhost:12111" }).errors.join()).toMatch(/mock/);
    expect(checkProductionConfig({ ...good, STRIPE_SECRET_KEY: "sk_test_x" }).warnings.join()).toMatch(/test key/);
  });

  it("checks only what the worker needs for the worker", () => {
    const { errors } = checkProductionConfig({ ...good, S3_ENDPOINT: "", TURNSTILE_SECRET_KEY: "" }, "worker");
    expect(errors).toEqual([]);
  });
});
