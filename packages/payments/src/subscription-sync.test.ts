import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type Stripe from "stripe";
import { prisma } from "@stagedesk/db";
import { seedPlans } from "../../db/src/seed-plans";
import { applyStripeSubscription, authoritativeSubscription, resolveBillingIncident, syncAgencySubscriptions } from "./subscriptions";
import { processStoredEvent } from "./webhooks";

/**
 * Stripe subscription events arrive late, twice and out of order. The agency's
 * record must end up the same whatever the order: decided from all of the
 * customer's subscriptions in Stripe, with duplicates kept as an incident.
 */
const run = `ss${Date.now().toString(36)}`;
const orgs: string[] = [];
let planId = "";
let n = 0;

beforeAll(async () => {
  await seedPlans(prisma);
  planId = (await prisma.plan.findFirstOrThrow({ where: { audience: "agency" } })).id;
});

afterAll(async () => {
  await prisma.stripeEvent.deleteMany({ where: { id: { startsWith: `evt_${run}` } } });
  await prisma.billingIncident.deleteMany({ where: { agencyId: { in: orgs } } });
  await prisma.subscription.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgs } } });
  await prisma.$disconnect();
});

async function agency() {
  const id = `${run}-org${n++}`;
  orgs.push(id);
  await prisma.organization.create({ data: { id, name: id, slug: id, stripeCustomerId: `cus_${id}` } });
  return { id, customer: `cus_${id}` };
}

function sub(org: { id: string; customer: string }, id: string, status: string, created: number) {
  return {
    id,
    status,
    created,
    customer: org.customer,
    metadata: { organizationId: org.id, planId },
    cancel_at_period_end: false,
    trial_end: null,
    items: { data: [{ price: { id: "price_none", recurring: { interval: "month" } }, current_period_end: Math.floor(Date.now() / 1000) + 30 * 86_400 }] },
  } as unknown as Stripe.Subscription;
}

/** A fake Stripe holding the customer's subscriptions as they are "now". */
function stripeWith(subs: Stripe.Subscription[]) {
  const page = <T,>(data: T[]) => Object.assign(Promise.resolve({ data }), { [Symbol.asyncIterator]: async function* () { yield* data; } });
  return {
    subs,
    stripe: {
      subscriptions: {
        list: (params: { customer: string }) => page(subs.filter((s) => s.customer === params.customer)),
        retrieve: async (id: string) => subs.find((s) => s.id === id)!,
      },
    } as unknown as Stripe,
  };
}

const record = async (orgId: string) => prisma.subscription.findUniqueOrThrow({ where: { organizationId: orgId } });
const openIncidents = (orgId: string) => prisma.billingIncident.findMany({ where: { agencyId: orgId, status: "open" } });

async function event(stripe: Stripe, s: Stripe.Subscription, type = "customer.subscription.updated") {
  const id = `evt_${run}_${n++}`;
  await prisma.stripeEvent.create({ data: { id, type, payload: { id, type, data: { object: s } } as never } });
  return processStoredEvent(stripe, id);
}

describe("authoritative subscription", () => {
  it("picks the earliest live subscription, else the latest one", () => {
    const o = { id: "o", customer: "c" };
    expect(authoritativeSubscription([sub(o, "b", "active", 20), sub(o, "a", "active", 10)]).chosen?.id).toBe("a");
    expect(authoritativeSubscription([sub(o, "b", "active", 20), sub(o, "a", "canceled", 10)]).chosen?.id).toBe("b");
    expect(authoritativeSubscription([sub(o, "b", "canceled", 20), sub(o, "a", "canceled", 10)]).chosen?.id).toBe("b");
    expect(authoritativeSubscription([sub(o, "y", "active", 10), sub(o, "x", "active", 10)]).duplicates.map((d) => d.id)).toEqual(["y"]);
  });

  it("ends in the same state whatever order the events of two live subscriptions arrive in", async () => {
    for (const order of [["first", "second"], ["second", "first"], ["second", "first", "second", "first"]]) {
      const org = await agency();
      const first = sub(org, `sub_${org.id}_1`, "active", 1_000);
      const second = sub(org, `sub_${org.id}_2`, "active", 2_000);
      const { stripe } = stripeWith([first, second]);
      for (const which of order) await event(stripe, which === "first" ? first : second);
      // Never the plan of whichever event came last: always the earliest live one.
      expect((await record(org.id)).stripeSubscriptionId).toBe(first.id);
      const incidents = await openIncidents(org.id);
      expect(incidents).toHaveLength(1);
      expect(incidents[0]!.data).toMatchObject({ authoritative: first.id, duplicates: [second.id] });
    }
  });

  it("gives the same answer to simultaneous webhooks and opens one incident", async () => {
    const org = await agency();
    const a = sub(org, `sub_${org.id}_a`, "active", 1_000);
    const b = sub(org, `sub_${org.id}_b`, "trialing", 1_500);
    const { stripe } = stripeWith([a, b]);
    await Promise.all([event(stripe, b), event(stripe, a), event(stripe, b), syncAgencySubscriptions(stripe, org.customer)]);
    expect((await record(org.id)).stripeSubscriptionId).toBe(a.id);
    expect(await openIncidents(org.id)).toHaveLength(1);
  });

  it("resolves the incident once the operator cancels the duplicate in Stripe, and follows a switch they make", async () => {
    const org = await agency();
    const a = sub(org, `sub_${org.id}_a`, "active", 1_000);
    const b = sub(org, `sub_${org.id}_b`, "active", 2_000);
    const fake = stripeWith([a, b]);
    await syncAgencySubscriptions(fake.stripe, org.customer);
    expect(await openIncidents(org.id)).toHaveLength(1);

    // The operator keeps B instead and cancels A in Stripe; A's late "updated" event changes nothing.
    (a as { status: string }).status = "canceled";
    await event(fake.stripe, sub(org, a.id, "active", 1_000));
    expect((await record(org.id)).stripeSubscriptionId).toBe(b.id);
    expect(await openIncidents(org.id)).toHaveLength(0);
    expect(await prisma.billingIncident.count({ where: { agencyId: org.id, status: "resolved" } })).toBe(1);
  });

  it("lets an operator resolve an incident, and reopens it if duplicates remain", async () => {
    const org = await agency();
    const { stripe } = stripeWith([sub(org, `sub_${org.id}_a`, "active", 1_000), sub(org, `sub_${org.id}_b`, "active", 2_000)]);
    await syncAgencySubscriptions(stripe, org.customer);
    const [incident] = await openIncidents(org.id);
    expect(await resolveBillingIncident(incident!.id, "someone", "Refunded the customer")).toBe(true);
    expect(await openIncidents(org.id)).toHaveLength(0);
    await syncAgencySubscriptions(stripe, org.customer);
    expect(await openIncidents(org.id)).toHaveLength(1);
  });

  it("keeps the current subscription when another caller applies a different one", async () => {
    const org = await agency();
    await applyStripeSubscription(sub(org, `sub_${org.id}_cur`, "active", 1_000), new Date(), { authoritative: true });
    await applyStripeSubscription(sub(org, `sub_${org.id}_old`, "canceled", 500));
    await applyStripeSubscription(sub(org, `sub_${org.id}_other`, "active", 2_000));
    expect((await record(org.id)).stripeSubscriptionId).toBe(`sub_${org.id}_cur`);
  });

  it("applies a stale out-of-order event as Stripe has it now", async () => {
    const org = await agency();
    const live = sub(org, `sub_${org.id}_live`, "active", 1_000);
    const { stripe } = stripeWith([live]);
    // An old "past_due" event delivered after the customer paid: Stripe now says active.
    expect(await event(stripe, sub(org, live.id, "past_due", 1_000))).toBe("processed");
    expect((await record(org.id)).status).toBe("active");
  });
});

describe("events about agencies this database doesn't have", () => {
  it("are ignored instead of failing on the foreign key (another environment, or a deleted agency)", async () => {
    const gone = { id: `${run}-gone`, customer: `cus_${run}-gone` };
    const { stripe } = stripeWith([sub(gone, `sub_${run}_gone`, "active", 10)]);
    const status = await event(stripe, sub(gone, `sub_${run}_gone`, "active", 10));
    expect(status).toBe("ignored");
    expect(await prisma.subscription.findUnique({ where: { organizationId: gone.id } })).toBeNull();
    expect(await applyStripeSubscription(sub(gone, `sub_${run}_gone`, "active", 10))).toBeNull();
  });
});

