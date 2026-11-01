import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type Stripe from "stripe";
import { prisma } from "@stagedesk/db";
import { seedPlans } from "../../db/src/seed-plans";
import { applyStripeSubscription } from "./subscriptions";
import { processStoredEvent } from "./webhooks";

/**
 * Stripe subscription events arrive late and out of order. An old
 * subscription's events must never replace the agency's current one, and a
 * webhook applies the subscription as Stripe has it now.
 */
const run = `ss${Date.now().toString(36)}`;
const org = `${run}-org`;
let planId = "";

beforeAll(async () => {
  await seedPlans(prisma);
  planId = (await prisma.plan.findFirstOrThrow({ where: { audience: "agency" } })).id;
  await prisma.organization.create({ data: { id: org, name: "Sub Agency", slug: org, stripeCustomerId: `cus_${run}` } });
});

afterAll(async () => {
  await prisma.stripeEvent.deleteMany({ where: { id: { startsWith: `evt_${run}` } } });
  await prisma.subscription.deleteMany({ where: { organizationId: org } });
  await prisma.organization.deleteMany({ where: { id: org } });
  await prisma.$disconnect();
});

const sub = (id: string, status: string) =>
  ({
    id,
    status,
    customer: `cus_${run}`,
    metadata: { organizationId: org, planId },
    cancel_at_period_end: false,
    trial_end: null,
    items: { data: [{ price: { id: "price_none", recurring: { interval: "month" } }, current_period_end: Math.floor(Date.now() / 1000) + 30 * 86_400 }] },
  }) as unknown as Stripe.Subscription;

describe("subscription sync", () => {
  it("keeps the current subscription when a late event about an old one arrives", async () => {
    await applyStripeSubscription(sub(`sub_${run}_old`, "active"));
    // The agency cancels and subscribes again; the new one is live.
    await applyStripeSubscription(sub(`sub_${run}_new`, "active"));
    // Now the old subscription's "deleted" event arrives.
    await applyStripeSubscription(sub(`sub_${run}_old`, "canceled"));
    const row = await prisma.subscription.findUniqueOrThrow({ where: { organizationId: org } });
    expect(row).toMatchObject({ stripeSubscriptionId: `sub_${run}_new`, status: "active" });
    // The current subscription's own cancellation still applies.
    await applyStripeSubscription(sub(`sub_${run}_new`, "canceled"));
    expect((await prisma.subscription.findUniqueOrThrow({ where: { organizationId: org } })).status).toBe("canceled");
  });

  it("applies the subscription as Stripe has it now, not as an out-of-order event saw it", async () => {
    await applyStripeSubscription(sub(`sub_${run}_live`, "active"));
    const id = `evt_${run}_stale`;
    // An old "past_due" event delivered after the customer paid: Stripe now says active.
    await prisma.stripeEvent.create({ data: { id, type: "customer.subscription.updated", payload: { id, type: "customer.subscription.updated", data: { object: sub(`sub_${run}_live`, "past_due") } } as never } });
    const stripe = { subscriptions: { retrieve: async (subId: string) => sub(subId, "active") } } as unknown as Stripe;
    expect(await processStoredEvent(stripe, id)).toBe("processed");
    expect((await prisma.subscription.findUniqueOrThrow({ where: { organizationId: org } })).status).toBe("active");
  });
});
