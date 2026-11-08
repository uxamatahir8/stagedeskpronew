import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type Stripe from "stripe";
import { prisma } from "@stagedesk/db";
import { syncPlanToStripe } from "./plans";
import { subscriptionCheckout } from "./subscriptions";
import { agencyWithAccounts, cleanup } from "./test/fixtures";

const run = `billing-currency-${Date.now().toString(36)}`;
const planId = `${run}-plan`;

/**
 * The currency a visitor sees on the website is an estimate. What they're
 * charged comes from the plan's euro prices in Stripe, whatever they looked at.
 */
describe("plans are billed in euros", () => {
  let agency: Awaited<ReturnType<typeof agencyWithAccounts>>;
  const created: Record<string, unknown>[] = [];
  const sessions: Record<string, unknown>[] = [];
  const priceUpdates: Record<string, unknown>[] = [];
  const stripe = {
    products: { create: async () => ({ id: "prod_eur" }), update: async () => ({ id: "prod_eur" }) },
    prices: {
      retrieve: async (id: string) => ({ id, tax_behavior: "unspecified" }),
      update: async (id: string, input: Record<string, unknown>) => {
        priceUpdates.push({ id, ...input });
        return { id };
      },
      create: async (input: Record<string, unknown> & { recurring: { interval: string } }) => {
        created.push(input);
        return { id: `price_eur_${input.recurring.interval}` };
      },
    },
    customers: { create: async () => ({ id: "cus_eur" }) },
    checkout: {
      sessions: {
        create: async (input: Record<string, unknown>) => {
          sessions.push(input);
          return { url: "https://checkout.stripe.test/eur" };
        },
      },
    },
  } as unknown as Stripe;

  beforeAll(async () => {
    agency = await agencyWithAccounts(run, { artistConnected: false });
    await prisma.plan.create({
      data: { id: planId, key: `${run}-pro`, name: { nl: "Pro", en: "Pro" }, monthlyPriceCents: 4_900, yearlyPriceCents: 49_000, features: { nl: [], en: [] }, limits: {} },
    });
  });

  afterAll(async () => {
    await prisma.subscription.deleteMany({ where: { planId } });
    await prisma.plan.deleteMany({ where: { id: planId } });
    await cleanup(run);
    await prisma.$disconnect();
  });

  it("creates plan prices in euros at the plan's amount", async () => {
    await syncPlanToStripe(stripe, planId);
    expect(created.map((p) => [p["currency"], p["unit_amount"]]).sort()).toEqual([["eur", 4_900], ["eur", 49_000]]);
  });

  it("checks out on the plan's own price, with no currency of its own", async () => {
    await subscriptionCheckout(stripe, {
      organizationId: agency.organizationId,
      planId,
      interval: "month",
      email: "owner@test.local",
      locale: "en",
      successUrl: "https://example.test/success",
      cancelUrl: "https://example.test/cancel",
    });
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!["line_items"]).toEqual([{ price: "price_eur_month", quantity: 1 }]);
    expect(sessions[0]).not.toHaveProperty("currency");
  });
  it("adds VAT at checkout through Stripe Tax, on prices marked as excluding it", async () => {
    await syncPlanToStripe(stripe, planId);
    const session = sessions.length;
    await subscriptionCheckout(stripe, { organizationId: agency.organizationId, planId, interval: "month", email: "owner@test.local", locale: "nl", successUrl: "https://app.test/ok", cancelUrl: "https://app.test/no" });
    expect(sessions[session]).toMatchObject({ automatic_tax: { enabled: true }, tax_id_collection: { enabled: true }, billing_address_collection: "required", customer_update: { address: "auto", name: "auto" } });
    expect(priceUpdates.at(-1)).toMatchObject({ tax_behavior: "exclusive" });
    expect(created.at(-1)).toMatchObject({ tax_behavior: "exclusive" });
  });
});
