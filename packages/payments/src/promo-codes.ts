import type Stripe from "stripe";
import { planKeysOf, prisma, recordPlatformPromoUse } from "@stagedesk/db";
import { isMissingStripeResource, syncPlanToStripe } from "./plans";

/**
 * Makes a platform promo code exist in the Stripe account the current keys
 * belong to: a coupon (the discount, limited to the code's plans) and a
 * promotion code (the code, its limits and expiry), active while the code is.
 * Ids from another account (keys changed) are replaced. Returns the Stripe
 * promotion code id, or null while the code is switched off.
 */
export async function syncPlatformPromo(stripe: Stripe, promoId: string): Promise<string | null> {
  const promo = await prisma.platformPromoCode.findUniqueOrThrow({ where: { id: promoId } });
  const exists = async <T,>(retrieve: () => Promise<T>) => {
    try {
      return await retrieve();
    } catch (error) {
      if (isMissingStripeResource(error)) return null;
      throw error;
    }
  };

  let promotion = promo.stripePromotionCodeId ? await exists(() => stripe.promotionCodes.retrieve(promo.stripePromotionCodeId!)) : null;
  if (promotion) {
    if (promotion.active !== promo.active) promotion = await stripe.promotionCodes.update(promotion.id, { active: promo.active });
    return promo.active ? promotion.id : null;
  }
  if (!promo.active) return null;

  // A coupon that this account knows, else a new one (only the plans the code is for).
  let couponId = promo.stripeCouponId && (await exists(() => stripe.coupons.retrieve(promo.stripeCouponId!))) ? promo.stripeCouponId : null;
  const replaces = promo.stripeCouponId && !couponId ? `-replaces-${promo.stripeCouponId}` : "";
  if (!couponId) {
    const keys = planKeysOf(promo);
    const products: string[] = [];
    if (keys.length > 0) {
      for (const plan of await prisma.plan.findMany({ where: { key: { in: keys } }, select: { id: true } })) products.push((await syncPlanToStripe(stripe, plan.id)).productId);
    }
    const coupon = await stripe.coupons.create(
      {
        name: promo.description?.slice(0, 40) || promo.code,
        ...(promo.discountType === "percentage" ? { percent_off: (promo.percentBps ?? 0) / 100 } : { amount_off: promo.amountCents ?? 0, currency: "eur" }),
        duration: promo.duration as "once" | "repeating" | "forever",
        ...(promo.duration === "repeating" ? { duration_in_months: promo.durationMonths ?? 1 } : {}),
        ...(products.length > 0 ? { applies_to: { products } } : {}),
        metadata: { platformPromoId: promo.id },
      },
      { idempotencyKey: `platform-promo-coupon-${promo.id}${replaces}` },
    );
    couponId = coupon.id;
  }
  const created = await stripe.promotionCodes.create(
    {
      promotion: { type: "coupon", coupon: couponId },
      code: promo.code,
      ...(promo.maxRedemptions ? { max_redemptions: promo.maxRedemptions } : {}),
      ...(promo.expiresAt ? { expires_at: Math.floor(promo.expiresAt.getTime() / 1000) } : {}),
      ...(promo.firstSubscriptionOnly ? { restrictions: { first_time_transaction: true } } : {}),
      metadata: { platformPromoId: promo.id },
    },
    { idempotencyKey: `platform-promo-code-${promo.id}${promo.stripePromotionCodeId ? `-replaces-${promo.stripePromotionCodeId}` : ""}` },
  );
  await prisma.platformPromoCode.update({ where: { id: promo.id }, data: { stripeCouponId: couponId, stripePromotionCodeId: created.id } });
  return created.id;
}

/** Counts the agency's use of a platform code when a subscription carries one (subscription webhooks). */
export async function recordPlatformPromoFromSubscription(stripe: Stripe, sub: Stripe.Subscription) {
  const agencyId = sub.metadata["organizationId"];
  const discounts = sub.discounts ?? [];
  if (!agencyId || discounts.length === 0) return 0;
  const full = discounts.some((d) => typeof d === "string") ? await stripe.subscriptions.retrieve(sub.id, { expand: ["discounts"] }) : sub;
  let recorded = 0;
  for (const discount of full.discounts ?? []) {
    if (typeof discount === "string" || !discount.promotion_code) continue;
    const promotionCodeId = typeof discount.promotion_code === "string" ? discount.promotion_code : discount.promotion_code.id;
    if (await recordPlatformPromoUse(promotionCodeId, agencyId, sub.id)) recorded++;
  }
  return recorded;
}
