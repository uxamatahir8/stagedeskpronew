import type Stripe from "stripe";
import { prisma } from "@stagedesk/db";

type StripeResourceError = Error & {
  code?: string;
  param?: string;
  raw?: { code?: string; param?: string };
};

/** Stripe uses resource_missing when an id belongs to another account or mode. */
export function isMissingStripeResource(error: unknown) {
  if (!(error instanceof Error)) return false;
  const stripe = error as StripeResourceError;
  return (stripe.code ?? stripe.raw?.code) === "resource_missing";
}

/** Narrows resource_missing to a plan price, rather than a customer or subscription. */
export function isMissingStripePrice(error: unknown) {
  if (!isMissingStripeResource(error)) return false;
  const stripe = error as StripeResourceError;
  const param = stripe.param ?? stripe.raw?.param;
  return param?.endsWith("[price]") === true || /no such price/i.test(stripe.message);
}

/**
 * Creates or updates the plan's Stripe product and prices. Stripe prices can't
 * change, so a new price is created when the amount changes and the old one
 * is archived; existing subscribers keep the price they signed up with.
 */
export async function syncPlanToStripe(stripe: Stripe, planId: string) {
  const plan = await prisma.plan.findUniqueOrThrow({ where: { id: planId } });
  const name = (plan.name as { nl?: string; en?: string }).nl ?? plan.key;

  const createProduct = () =>
    stripe.products.create({ name, metadata: { planId: plan.id, planKey: plan.key } }, { idempotencyKey: `plan-product-${plan.id}` });
  let product: Stripe.Product;
  if (plan.stripeProductId) {
    try {
      product = await stripe.products.update(plan.stripeProductId, { name, active: plan.active });
    } catch (error) {
      if (!isMissingStripeResource(error)) throw error;
      product = await createProduct();
    }
  } else {
    product = await createProduct();
  }

  async function ensurePrice(currentId: string | null, amount: number, interval: "month" | "year") {
    if (currentId) {
      try {
        const current = await stripe.prices.retrieve(currentId);
        if (current.unit_amount === amount && current.active) return currentId;
        await stripe.prices.update(currentId, { active: false });
      } catch (error) {
        if (!isMissingStripeResource(error)) throw error;
      }
    }
    const price = await stripe.prices.create(
      { product: product.id, currency: "eur", unit_amount: amount, recurring: { interval }, tax_behavior: "exclusive", metadata: { planId: plan.id } },
      { idempotencyKey: `plan-price-excl-${plan.id}-${interval}-${amount}` },
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
