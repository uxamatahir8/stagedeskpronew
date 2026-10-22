import type Stripe from "stripe";
import { prisma } from "@stagedesk/db";

/**
 * Creates or updates the plan's Stripe product and prices. Stripe prices can't
 * change, so a new price is created when the amount changes and the old one
 * is archived; existing subscribers keep the price they signed up with.
 */
export async function syncPlanToStripe(stripe: Stripe, planId: string) {
  const plan = await prisma.plan.findUniqueOrThrow({ where: { id: planId } });
  const name = (plan.name as { nl?: string; en?: string }).nl ?? plan.key;

  const product = plan.stripeProductId
    ? await stripe.products.update(plan.stripeProductId, { name, active: plan.active })
    : await stripe.products.create({ name, metadata: { planId: plan.id, planKey: plan.key } }, { idempotencyKey: `plan-product-${plan.id}` });

  async function ensurePrice(currentId: string | null, amount: number, interval: "month" | "year") {
    if (currentId) {
      const current = await stripe.prices.retrieve(currentId);
      if (current.unit_amount === amount && current.active) return currentId;
      await stripe.prices.update(currentId, { active: false });
    }
    const price = await stripe.prices.create(
      { product: product.id, currency: "eur", unit_amount: amount, recurring: { interval }, metadata: { planId: plan.id } },
      { idempotencyKey: `plan-price-${plan.id}-${interval}-${amount}` },
    );
    return price.id;
  }

  const [monthly, yearly] = await Promise.all([
    ensurePrice(plan.stripeMonthlyPriceId, plan.monthlyPriceCents, "month"),
    ensurePrice(plan.stripeYearlyPriceId, plan.yearlyPriceCents, "year"),
  ]);
  await prisma.plan.update({
    where: { id: plan.id },
    data: { stripeProductId: product.id, stripeMonthlyPriceId: monthly, stripeYearlyPriceId: yearly },
  });
  return { productId: product.id, monthly, yearly };
}
