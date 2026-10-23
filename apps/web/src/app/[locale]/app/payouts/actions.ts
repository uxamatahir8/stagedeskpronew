"use server";

import { getLocale, getTranslations } from "next-intl/server";
import { affiliateOnboardingLink, connectDashboardLink, getStripe } from "@stagedesk/payments";
import type { RedirectResult } from "@/components/redirect-button";
import { requireAffiliate } from "@/lib/affiliate";
import { paymentsErrorMessage } from "@/lib/billing";
import { absoluteUrl } from "@/lib/mail";

export async function connectAffiliateAction(): Promise<RedirectResult> {
  const { viewer, affiliate } = await requireAffiliate("affiliate.payouts");
  const stripe = getStripe();
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
  const stripe = getStripe();
  if (!stripe || !affiliate.stripeAccountId) return { message: (await getTranslations("payments"))("stripeMissing") };
  try {
    return { url: await connectDashboardLink(stripe, affiliate.stripeAccountId) };
  } catch (error) {
    return { message: await paymentsErrorMessage(error) };
  }
}
