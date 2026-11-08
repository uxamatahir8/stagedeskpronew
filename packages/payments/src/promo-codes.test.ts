import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type Stripe from "stripe";
import { createPlatformPromoCode, prisma } from "@stagedesk/db";
import { recordPlatformPromoFromSubscription, syncPlatformPromo } from "./promo-codes";
import { subscriptionCheckout } from "./subscriptions";
import { agencyWithAccounts, cleanup } from "./test/fixtures";

const run = `ppromo${Date.now().toString(36)}`;
const missing = (what: string) => Object.assign(new Error(`No such ${what}`), { code: "resource_missing", type: "StripeInvalidRequestError" });

/** A Stripe account that knows only what was made in it. */
function account() {
  const coupons = new Map<string, Record<string, unknown>>();
  const promos = new Map<string, Record<string, unknown> & { id: string; active: boolean }>();
  const sessions: Record<string, unknown>[] = [];
  let n = 0;
  const stripe = {
    coupons: {
      retrieve: async (id: string) => coupons.get(id) ?? Promise.reject(missing("coupon")),
      create: async (params: Record<string, unknown>) => {
        const coupon = { id: `co_${n++}`, ...params };
        coupons.set(coupon.id, coupon);
        return coupon;
      },
    },
    promotionCodes: {
      retrieve: async (id: string) => promos.get(id) ?? Promise.reject(missing("promotion code")),
      create: async (params: Record<string, unknown>) => {
        const promo = { id: `promo_${n++}`, active: true, ...params };
        promos.set(promo.id, promo);
        return promo;
      },
      update: async (id: string, params: { active: boolean }) => Object.assign(promos.get(id)!, params),
    },
    products: { update: async (id: string) => ({ id }), create: async () => ({ id: `prod_${n++}` }) },
    prices: { retrieve: async (id: string) => ({ id, unit_amount: 0, active: false }), update: async (id: string) => ({ id }), create: async () => ({ id: `price_${n++}` }) },
    customers: { retrieve: async (id: string) => ({ id }), create: async () => ({ id: `cus_${n++}` }) },
    subscriptions: { retrieve: async () => Promise.reject(missing("subscription")) },
    taxRates: { list: () => [], create: async () => ({ id: "txr_plans" }) },
    checkout: {
      sessions: {
        create: async (params: Record<string, unknown>) => {
          sessions.push(params);
          return { url: "https://checkout.stripe.test/promo" };
        },
      },
    },
  };
  return { stripe: stripe as unknown as Stripe, coupons, promos, sessions };
}

describe("platform promo codes in Stripe", () => {
  let agency: Awaited<ReturnType<typeof agencyWithAccounts>>;
  let promoId: string;

  beforeAll(async () => {
    agency = await agencyWithAccounts(run, { artistConnected: false });
    promoId = (
      await createPlatformPromoCode(
        { code: `${run}-half`, description: "Pilot", discountType: "percentage", percentBps: 5_000, amountCents: null, duration: "repeating", durationMonths: 12, planKeys: ["pro"], firstSubscriptionOnly: true, maxRedemptions: 5, expiresAt: null },
        null,
      )
    ).id;
  });

  afterAll(async () => {
    await prisma.platformPromoCode.deleteMany({ where: { id: promoId } });
    await cleanup(run);
    await prisma.$disconnect();
  });

  it("makes the coupon for the code's plans and the promotion code with its limits", async () => {
    const { stripe, coupons, promos } = account();
    const id = await syncPlatformPromo(stripe, promoId);
    const promo = promos.get(id!)!;
    expect(promo).toMatchObject({ code: `${run}-HALF`.toUpperCase(), max_redemptions: 5, restrictions: { first_time_transaction: true } });
    const coupon = [...coupons.values()][0]!;
    expect(coupon).toMatchObject({ percent_off: 50, duration: "repeating", duration_in_months: 12 });
    expect((coupon["applies_to"] as { products: string[] }).products).toHaveLength(1);
    // Again: nothing new.
    expect(await syncPlatformPromo(stripe, promoId)).toBe(id);
    expect(promos.size).toBe(1);
  });

  it("switches off with the code, and makes everything again after the Stripe keys change", async () => {
    const before = account();
    const oldId = await syncPlatformPromo(before.stripe, promoId);
    await prisma.platformPromoCode.update({ where: { id: promoId }, data: { active: false } });
    expect(await syncPlatformPromo(before.stripe, promoId)).toBeNull();
    expect(before.promos.get(oldId!)?.active).toBe(false);
    await prisma.platformPromoCode.update({ where: { id: promoId }, data: { active: true } });

    const after = account();
    const newId = await syncPlatformPromo(after.stripe, promoId);
    expect(after.promos.get(newId!)).toBeTruthy();
    expect(after.coupons.size).toBe(1);
  });

  it("puts an entered code on the checkout instead of the partner discount, and counts its use", async () => {
    const { stripe, sessions } = account();
    const promotionCodeId = await syncPlatformPromo(stripe, promoId);
    const plan = await prisma.plan.findFirstOrThrow({ where: { key: "pro" } });
    await subscriptionCheckout(stripe, { organizationId: agency.organizationId, planId: plan.id, interval: "month", email: "o@test.local", locale: "nl", successUrl: "https://x.test/ok", cancelUrl: "https://x.test/no", promotionCodeId });
    expect(sessions[0]).toMatchObject({ discounts: [{ promotion_code: promotionCodeId }] });
    expect(sessions[0]).not.toHaveProperty("allow_promotion_codes");

    const sub = { id: "sub_promo", metadata: { organizationId: agency.organizationId }, discounts: [{ promotion_code: promotionCodeId }] } as unknown as Stripe.Subscription;
    expect(await recordPlatformPromoFromSubscription(stripe, sub)).toBe(1);
    expect(await prisma.platformPromoRedemption.count({ where: { promoCodeId: promoId, agencyId: agency.organizationId } })).toBe(1);
  });
});
