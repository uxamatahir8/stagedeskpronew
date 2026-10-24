"use server";

import { revalidatePath } from "next/cache";
import { getLocale, getTranslations } from "next-intl/server";
import { audit, cancelWithdrawal, getSetting, payoutMethods, type PayoutMethod, requestWithdrawal, savePayoutDetails, WithdrawalError } from "@stagedesk/db";
import { affiliateOnboardingLink, connectDashboardLink, getStripe } from "@stagedesk/payments";
import type { RedirectResult } from "@/components/redirect-button";
import type { ActionResult } from "@/lib/actions";
import { requireAffiliate } from "@/lib/affiliate";
import { paymentsErrorMessage } from "@/lib/billing";
import { absoluteUrl } from "@/lib/mail";

export async function connectAffiliateAction(): Promise<RedirectResult> {
  const { viewer, affiliate } = await requireAffiliate("affiliate.payouts");
  const stripe = await getStripe();
  if (!stripe || affiliate.status !== "approved") return { message: (await getTranslations("payments"))("stripeMissing") };
  const locale = await getLocale();
  try {
    return {
      url: await affiliateOnboardingLink(stripe, {
        affiliateId: affiliate.id,
        email: viewer.user.email,
        returnUrl: absoluteUrl(locale, "/app/payouts"),
        refreshUrl: absoluteUrl(locale, "/app/payouts"),
      }),
    };
  } catch (error) {
    return { message: await paymentsErrorMessage(error) };
  }
}

export async function affiliateDashboardAction(): Promise<RedirectResult> {
  const { affiliate } = await requireAffiliate("affiliate.payouts");
  const stripe = await getStripe();
  if (!stripe || !affiliate.stripeAccountId) return { message: (await getTranslations("payments"))("stripeMissing") };
  try {
    return { url: await connectDashboardLink(stripe, affiliate.stripeAccountId) };
  } catch (error) {
    return { message: await paymentsErrorMessage(error) };
  }
}

async function withdrawalMessage(error: unknown) {
  if (error instanceof WithdrawalError) return (await getTranslations("withdrawals"))(`error_${error.code}`);
  throw error;
}

/** How the affiliate wants to be paid: Stripe, bank transfer or PayPal. */
export async function savePayoutDetailsAction(input: { method: string; iban: string; accountName: string; paypalEmail: string }): Promise<ActionResult> {
  const { affiliate } = await requireAffiliate("affiliate.payouts");
  const program = await getSetting("affiliates.program");
  const method = input.method as PayoutMethod;
  if (!payoutMethods.includes(method) || !program.payoutMethods[method]) return { ok: false, message: (await getTranslations("withdrawals"))("error_method_disabled") };
  try {
    await savePayoutDetails(affiliate.id, { method, iban: input.iban, accountName: input.accountName, paypalEmail: input.paypalEmail });
  } catch (error) {
    return { ok: false, message: await withdrawalMessage(error) };
  }
  revalidatePath("/[locale]/app/payouts", "page");
  return { ok: true, message: (await getTranslations("withdrawals"))("detailsSaved") };
}

/** Asks to be paid everything that's approved. */
export async function requestWithdrawalAction(): Promise<ActionResult> {
  const { viewer, affiliate } = await requireAffiliate("affiliate.payouts");
  try {
    const payout = await requestWithdrawal(affiliate.id, viewer.user.id);
    await audit({ actorId: viewer.user.id, action: "withdrawal.request", targetType: "affiliate_payout", targetId: payout.id, data: { cents: payout.amountCents, method: payout.method } });
  } catch (error) {
    return { ok: false, message: await withdrawalMessage(error) };
  }
  revalidatePath("/[locale]/app/payouts", "layout");
  return { ok: true, message: (await getTranslations("withdrawals"))("requested") };
}

export async function cancelWithdrawalAction(payoutId: string): Promise<ActionResult> {
  const { viewer, affiliate } = await requireAffiliate("affiliate.payouts");
  try {
    await cancelWithdrawal(affiliate.id, payoutId, viewer.user.id);
  } catch (error) {
    return { ok: false, message: await withdrawalMessage(error) };
  }
  revalidatePath("/[locale]/app/payouts", "layout");
  return { ok: true, message: (await getTranslations("withdrawals"))("cancelled") };
}
