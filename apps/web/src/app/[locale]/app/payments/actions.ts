"use server";

import { revalidatePath } from "next/cache";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { parseEuros } from "@stagedesk/core";
import { connectDashboardLink, connectOnboardingLink, getStripe, refundPayment } from "@stagedesk/payments";
import type { RedirectResult } from "@/components/redirect-button";
import type { ActionResult } from "@/lib/actions";
import { paymentsErrorMessage, writeBlocked } from "@/lib/billing";
import { euro } from "@/lib/format";
import { absoluteUrl } from "@/lib/mail";
import { requireAgency } from "@/lib/viewer";

/** Stripe Express onboarding for the agency's own account (start or finish). */
export async function connectAgencyAction(): Promise<RedirectResult> {
  const { viewer, organization } = await requireAgency("agency.payments");
  const stripe = getStripe();
  if (!stripe) return { message: (await getTranslations("payments"))("stripeMissing") };
  const locale = await getLocale();
  try {
    return {
      url: await connectOnboardingLink(stripe, {
        organizationId: organization.id,
        artistId: null,
        email: viewer.user.email,
        returnUrl: absoluteUrl(locale, "/app/payments"),
        refreshUrl: absoluteUrl(locale, "/app/payments"),
      }),
    };
  } catch (error) {
    return { message: await paymentsErrorMessage(error) };
  }
}

export async function agencyDashboardAction(): Promise<RedirectResult> {
  const { db } = await requireAgency("agency.payments");
  const stripe = getStripe();
  const account = await db.connectedAccount.findFirst({ where: { artistId: null } });
  if (!stripe || !account) return { message: (await getTranslations("payments"))("stripeMissing") };
  try {
    return { url: await connectDashboardLink(stripe, account.stripeAccountId) };
  } catch (error) {
    return { message: await paymentsErrorMessage(error) };
  }
}

/** Refunds (part of) a payment; `amount` is what the user typed, in euros. */
export async function refundAction(paymentId: string, amount: string): Promise<ActionResult> {
  const { viewer, organization } = await requireAgency("agency.payments");
  const blocked = await writeBlocked(organization.id);
  if (blocked) return { ok: false, message: blocked };
  const cents = parseEuros(amount);
  if (cents === null || cents <= 0) return { ok: false, message: (await getTranslations("payments"))("errors_invalid_amount") };
  try {
    const { refunded } = await refundPayment(getStripe(), { organizationId: organization.id, paymentId, amountCents: cents, actorId: viewer.user.id });
    revalidatePath("/[locale]/app", "layout");
    return { ok: true, message: (await getTranslations("payments"))("refunded_", { amount: euro(await getFormatter(), refunded) }) };
  } catch (error) {
    return { ok: false, message: await paymentsErrorMessage(error) };
  }
}
