"use server";

import { getLocale, getTranslations } from "next-intl/server";
import { isCancellationReason } from "@stagedesk/core";
import { audit, findPlatformPromo, prisma, recordCancellationFeedback } from "@stagedesk/db";
import { billingPortal, changeSubscriptionPlan, getStripe, liveStripeSubscriptionHere, setCancelAtPeriodEnd, subscriptionCheckout, syncPlanToStripe, syncPlatformPromo } from "@stagedesk/payments";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/actions";
import type { RedirectResult } from "@/components/redirect-button";
import { paymentsErrorMessage } from "@/lib/billing";
import { absoluteUrl } from "@/lib/mail";
import { requireAgency } from "@/lib/viewer";


/** Starts Stripe Checkout for a plan. Only the agency owner manages billing. */
export async function choosePlanAction(planId: string, interval: "month" | "year", promoCode: string | null = null): Promise<RedirectResult> {
  const { viewer, organization } = await requireAgency("agency.billing");
  const stripe = await getStripe();
  if (!stripe) return { message: (await getTranslations("billing"))("stripeMissing") };
  const locale = (await getLocale()) === "en" ? "en" : "nl";
  try {
    // A plan not yet in Stripe (new, or after a reset) is pushed there first, so checkout just works.
    const [plan, org] = await Promise.all([
      prisma.plan.findUnique({ where: { id: planId }, select: { active: true, audience: true, stripeMonthlyPriceId: true, stripeYearlyPriceId: true } }),
      prisma.organization.findUniqueOrThrow({ where: { id: organization.id }, select: { kind: true } }),
    ]);
    // Artist plans are for independent artists only, and agency plans for agencies.
    if (!plan?.active || plan.audience !== (org.kind === "solo" ? "artist" : "agency")) return { message: (await getTranslations("billing"))("planNotSynced") };
    if (!plan.stripeMonthlyPriceId || !plan.stripeYearlyPriceId) await syncPlanToStripe(stripe, planId);
    // A promo code is checked here (with a clear reason when it can't be used) and made ready in Stripe.
    let promotionCodeId: string | null = null;
    if (promoCode) {
      const { promo, problem } = await findPlatformPromo(promoCode, { organizationId: organization.id, planId });
      if (!promo || problem) return { message: (await getTranslations("promoCodes"))(`problem_${problem ?? "unknown"}`) };
      promotionCodeId = await syncPlatformPromo(stripe, promo.id);
      if (!promotionCodeId) return { message: (await getTranslations("promoCodes"))("problem_inactive") };
    }
    // A running Stripe subscription is switched in place, never doubled. One made with other Stripe keys
    // can't be switched from here: subscriptionCheckout starts a new one instead.
    if (await liveStripeSubscriptionHere(stripe, organization.id)) {
      await audit({ actorId: viewer.user.id, action: "billing.switch_plan", targetType: "plan", targetId: planId });
      await changeSubscriptionPlan(stripe, { organizationId: organization.id, planId, interval, promotionCodeId });
      return { url: absoluteUrl(locale, "/app/billing?checkout=switched") };
    }
    return {
      url: await subscriptionCheckout(stripe, {
        organizationId: organization.id,
        planId,
        interval,
        email: viewer.user.email,
        locale,
        successUrl: `${absoluteUrl(locale, "/app/billing?checkout=success")}&session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: absoluteUrl(locale, "/app/billing"),
        promotionCodeId,
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

/**
 * Cancel at the end of the paid period, or undo that while it's still running.
 * Cancelling asks why (one of cancellationReasons, plus an optional note).
 */
export async function setCancelPlanAction(cancel: boolean, feedback?: { reason: string; note: string }): Promise<ActionResult> {
  const { viewer, organization } = await requireAgency("agency.billing");
  const t = await getTranslations("billing");
  if (cancel && !isCancellationReason(feedback?.reason)) return { ok: false, message: t("cancelReasonRequired") };
  const stripe = await getStripe();
  if (!stripe) return { ok: false, message: t("stripeMissing") };
  try {
    const sub = await setCancelAtPeriodEnd(stripe, organization.id, cancel);
    if (cancel && feedback && isCancellationReason(feedback.reason)) {
      // Feedback never blocks the cancellation itself.
      await recordCancellationFeedback({ agencyId: organization.id, userId: viewer.user.id, reason: feedback.reason, note: feedback.note.slice(0, 2000) }).catch((error) =>
        console.error("[billing] cancellation feedback not stored", error),
      );
    }
    await audit({ actorId: viewer.user.id, action: cancel ? "billing.cancel" : "billing.resume", agencyId: organization.id, targetType: "subscription", targetId: sub?.id ?? null });
    revalidatePath("/[locale]/app/billing", "page");
    return { ok: true, message: cancel ? t("cancelDone") : t("resumeDone") };
  } catch (error) {
    return { ok: false, message: await paymentsErrorMessage(error) };
  }
}
