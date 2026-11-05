import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type Stripe from "stripe";
import { prisma } from "@stagedesk/db";
import { subscriptionCheckout } from "./subscriptions";
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
});
