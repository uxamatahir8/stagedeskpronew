import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type Stripe from "stripe";
import { prisma } from "@stagedesk/db";
import { billingPortal, PaymentsError, setCancelAtPeriodEnd, subscriptionCheckout } from "./subscriptions";
import { agencyWithAccounts, cleanup } from "./test/fixtures";

const run = `plan-recovery-${Date.now().toString(36)}`;
const planId = `${run}-plan`;
const missing = (message: string, param: string) => Object.assign(new Error(message), { code: "resource_missing", param, type: "StripeInvalidRequestError" });

describe("Stripe plan recovery", () => {
  let agency: Awaited<ReturnType<typeof agencyWithAccounts>>;

  beforeAll(async () => {
    agency = await agencyWithAccounts(run, { artistConnected: false });
    await prisma.plan.create({
      data: {
        id: planId,
        key: `${run}-pro`,
        name: { nl: "Pro", en: "Pro" },
        monthlyPriceCents: 4_900,
        yearlyPriceCents: 49_000,
        features: { nl: [], en: [] },
        limits: {},
        stripeProductId: "prod_from_other_account",
        stripeMonthlyPriceId: "price_month_from_other_account",
        stripeYearlyPriceId: "price_year_from_other_account",
      },
    });
  });

  afterAll(async () => {
    await prisma.subscription.deleteMany({ where: { planId } });
    await prisma.plan.deleteMany({ where: { id: planId } });
    await cleanup(run);
    await prisma.$disconnect();
  });

  it("recreates stale product and price ids, then retries checkout once", async () => {
    let checkoutAttempts = 0;
    const stripe = {
      products: {
        update: async () => { throw missing("No such product", "id"); },
        create: async () => ({ id: "prod_current_account" }),
      },
      prices: {
        retrieve: async () => { throw missing("No such price", "id"); },
        update: async () => ({ id: "unused" }),
        create: async (input: { recurring: { interval: string } }) => ({ id: `price_current_${input.recurring.interval}` }),
      },
      customers: {
        create: async () => ({ id: "cus_current_account" }),
        retrieve: async (id: string) => ({ id }),
      },
      checkout: {
        sessions: {
          create: async () => {
            checkoutAttempts += 1;
            if (checkoutAttempts === 1) throw missing("No such price", "line_items[0][price]");
            return { url: "https://checkout.stripe.test/recovered" };
          },
        },
      },
    } as unknown as Stripe;

    await expect(subscriptionCheckout(stripe, {
      organizationId: agency.organizationId,
      planId,
      interval: "month",
      email: "owner@test.local",
      locale: "nl",
      successUrl: "https://example.test/success",
      cancelUrl: "https://example.test/cancel",
    })).resolves.toBe("https://checkout.stripe.test/recovered");

    expect(checkoutAttempts).toBe(2);
    await expect(prisma.plan.findUniqueOrThrow({ where: { id: planId } })).resolves.toMatchObject({
      stripeProductId: "prod_current_account",
      stripeMonthlyPriceId: "price_current_month",
      stripeYearlyPriceId: "price_current_year",
    });
  });

  it("after the platform's keys change to another Stripe account, replaces the old customer and starts a new checkout", async () => {
    // The agency subscribed under the old account: its customer and subscription don't exist in the new one.
    await prisma.organization.update({ where: { id: agency.organizationId }, data: { stripeCustomerId: "cus_old_account" } });
    await prisma.subscription.upsert({
      where: { organizationId: agency.organizationId },
      create: { id: `${run}-sub`, organizationId: agency.organizationId, planId, status: "active", stripeSubscriptionId: "sub_old_account" },
      update: { status: "active", stripeSubscriptionId: "sub_old_account" },
    });
    const created: Record<string, unknown>[] = [];
    const sessions: Record<string, unknown>[] = [];
    const stripe = {
      prices: { retrieve: async (id: string) => ({ id, unit_amount: 4_900, active: true }) },
      customers: {
        retrieve: async () => { throw missing("No such customer: 'cus_old_account'", "id"); },
        create: async (input: Record<string, unknown>, options: { idempotencyKey: string }) => {
          created.push({ ...input, key: options.idempotencyKey });
          return { id: "cus_new_account" };
        },
      },
      subscriptions: {
        retrieve: async () => { throw missing("No such subscription: 'sub_old_account'", "id"); },
        update: async () => { throw new Error("must not change a subscription from another account"); },
      },
      billingPortal: { sessions: { create: async () => { throw missing("No such customer", "customer"); } } },
      checkout: {
        sessions: {
          create: async (input: Record<string, unknown>) => {
            sessions.push(input);
            return { url: "https://checkout.stripe.test/new-account" };
          },
        },
      },
    } as unknown as Stripe;

    const input = { organizationId: agency.organizationId, planId, interval: "month" as const, email: "owner@test.local", locale: "nl" as const, successUrl: "https://example.test/success", cancelUrl: "https://example.test/cancel" };
    // Cancelling or the portal can't reach the old account's objects: a clear error, not a generic one.
    await expect(setCancelAtPeriodEnd(stripe, agency.organizationId, true)).rejects.toSatisfy((e) => e instanceof PaymentsError && e.code === "other_stripe_account");
    await expect(billingPortal(stripe, agency.organizationId, "https://example.test")).rejects.toSatisfy((e) => e instanceof PaymentsError && e.code === "other_stripe_account");

    await expect(subscriptionCheckout(stripe, input)).resolves.toBe("https://checkout.stripe.test/new-account");
    expect(sessions[0]).toMatchObject({ mode: "subscription", customer: "cus_new_account" });
    expect(created[0]?.["key"]).toBe(`customer-${agency.organizationId}-replaces-cus_old_account`);
    expect((await prisma.organization.findUniqueOrThrow({ where: { id: agency.organizationId } })).stripeCustomerId).toBe("cus_new_account");
  });
});
