"use server";

import { revalidatePath } from "next/cache";
import { getLocale, getTranslations } from "next-intl/server";
import { getFormatter } from "@/lib/formatter";
import { parseEuros } from "@stagedesk/core";
import { audit } from "@stagedesk/db";
import { connectDashboardLink, connectOnboardingLink, getStripe, refundPayment } from "@stagedesk/payments";
import type { RedirectResult } from "@/components/redirect-button";
import type { ActionResult } from "@/lib/actions";
import { paymentsErrorMessage, writeBlocked } from "@/lib/billing";
import { euro } from "@/lib/format";
import { absoluteUrl } from "@/lib/mail";
import { requireAgency } from "@/lib/viewer";

/** Stripe Express onboarding for the agency's own account (start or finish). */
export async function connectAgencyAction(): Promise<RedirectResult> {
  const { viewer, organization } = await requireAgency("agency.settings");
  const stripe = await getStripe();
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
  const stripe = await getStripe();
  const account = await db.connectedAccount.findFirst({ where: { artistId: null } });
  if (!stripe || !account) return { message: (await getTranslations("payments"))("stripeMissing") };
  try {
    return { url: await connectDashboardLink(stripe, account.stripeAccountId) };
  } catch (error) {
    return { message: await paymentsErrorMessage(error) };
  }
}

/**
 * Refunds (part of) a payment; `amount` is what the user typed, in euros.
 * `requestId` is made once per refund dialog: sending it again (double click,
 * retry after a timeout) continues that refund instead of starting another.
 */
export async function refundAction(paymentId: string, amount: string, requestId: string): Promise<ActionResult> {
  const { viewer, organization } = await requireAgency("agency.payments.refund");
  const blocked = await writeBlocked(organization.id);
  if (blocked) return { ok: false, message: blocked };
  const t = await getTranslations("payments");
  const cents = parseEuros(amount);
  if (cents === null || cents <= 0) return { ok: false, message: t("errors_invalid_amount") };
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) return { ok: false, message: t("errors_invalid_amount") };
  try {
    const result = await refundPayment(await getStripe(), {
      organizationId: organization.id,
      paymentId,
      amountCents: cents,
      actorId: viewer.user.id,
      requestId: `${organization.id}:${requestId}`,
    });
    await audit({
      actorId: viewer.user.id,
      action: "payment.refund",
      agencyId: organization.id,
      targetType: "payment",
      targetId: paymentId,
      data: { cents, status: result.status, operationId: result.operationId },
    });
    revalidatePath("/[locale]/app", "layout");
    const money = euro(await getFormatter(), cents, organization.currency);
    // Stripe didn't answer in time: the refund continues in the background and shows once it's done.
    if (result.status !== "completed") return { ok: true, message: t("refundPending", { amount: money }) };
    return { ok: true, message: t("refunded_", { amount: money }) };
  } catch (error) {
    return { ok: false, message: await paymentsErrorMessage(error) };
  }
}
