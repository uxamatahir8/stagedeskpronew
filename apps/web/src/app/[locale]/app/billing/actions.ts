"use server";

import { getLocale, getTranslations } from "next-intl/server";
import { audit, prisma } from "@stagedesk/db";
import { billingPortal, changeSubscriptionPlan, getStripe, liveStripeSubscription, subscriptionCheckout, syncPlanToStripe } from "@stagedesk/payments";
import type { RedirectResult } from "@/components/redirect-button";
import { paymentsErrorMessage } from "@/lib/billing";
import { absoluteUrl } from "@/lib/mail";
import { requireAgency } from "@/lib/viewer";


/** Starts Stripe Checkout for a plan. Only the agency owner manages billing. */
export async function choosePlanAction(planId: string, interval: "month" | "year"): Promise<RedirectResult> {
  const { viewer, organization } = await requireAgency("agency.billing");
  const stripe = await getStripe();
  if (!stripe) return { message: (await getTranslations("billing"))("stripeMissing") };
  const locale = (await getLocale()) === "en" ? "en" : "nl";
  try {
    // A plan not yet in Stripe (new, or after a reset) is pushed there first, so checkout just works.
    const plan = await prisma.plan.findUnique({ where: { id: planId }, select: { active: true, stripeMonthlyPriceId: true, stripeYearlyPriceId: true } });
    if (!plan?.active) return { message: (await getTranslations("billing"))("planNotSynced") };
    if (!plan.stripeMonthlyPriceId || !plan.stripeYearlyPriceId) await syncPlanToStripe(stripe, planId);
    // A running Stripe subscription is switched in place, never doubled.
    if (await liveStripeSubscription(organization.id)) {
      await audit({ actorId: viewer.user.id, action: "billing.switch_plan", targetType: "plan", targetId: planId });
      await changeSubscriptionPlan(stripe, { organizationId: organization.id, planId, interval });
      return { url: absoluteUrl(locale, "/app/billing?checkout=switched") };
    }
    return {
      url: await subscriptionCheckout(stripe, {
        organizationId: organization.id,
        planId,
        interval,
        email: viewer.user.email,
        locale,
        successUrl: absoluteUrl(locale, "/app/billing?checkout=success"),
        cancelUrl: absoluteUrl(locale, "/app/billing"),
      }),
    };
  } catch (error) {
    return { message: await paymentsErrorMessage(error) };
  }
}

export async function billingPortalAction(): Promise<RedirectResult> {
  const { organization } = await requireAgency("agency.billing");
  const stripe = await getStripe();
  if (!stripe) return { message: (await getTranslations("billing"))("stripeMissing") };
  try {
    return { url: await billingPortal(stripe, organization.id, absoluteUrl(await getLocale(), "/app/billing")) };
  } catch (error) {
    return { message: await paymentsErrorMessage(error) };
  }
}
