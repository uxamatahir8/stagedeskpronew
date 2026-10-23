"use server";

import { revalidatePath } from "next/cache";
import { getLocale, getTranslations } from "next-intl/server";
import { parseEuros, todayInNetherlands } from "@stagedesk/core";
import { PaymentClaimError, prisma, submitPaymentClaim } from "@stagedesk/db";
import { bookingCheckout, getStripe, PaymentsError } from "@stagedesk/payments";
import type { RedirectResult } from "@/components/redirect-button";
import type { ActionResult } from "@/lib/actions";
import { paymentsErrorMessage } from "@/lib/billing";
import { absoluteUrl, userLocale } from "@/lib/mail";
import { announceClaim, paymentOptions } from "@/lib/payment-claims";
import { requirePermission } from "@/lib/viewer";

async function checkout(booking: { id: string; organizationId: string; customer: { email: string } | null }, returnPath: (paid: 0 | 1) => string): Promise<RedirectResult> {
  const stripe = await getStripe();
  const locale = userLocale(await getLocale());
  try {
    if (!stripe) throw new PaymentsError("agency_not_connected");
    return {
      url: await bookingCheckout(stripe, {
        organizationId: booking.organizationId,
        bookingId: booking.id,
        customerEmail: booking.customer?.email ?? null,
        locale,
        successUrl: absoluteUrl(locale, returnPath(1)),
        cancelUrl: absoluteUrl(locale, returnPath(0)),
      }),
    };
  } catch (error) {
    return { message: await paymentsErrorMessage(error) };
  }
}

/** A signed-in customer paying for one of their own bookings. */
export async function payBookingAction(bookingId: string, returnTo: "event" | "payments"): Promise<RedirectResult> {
  const viewer = await requirePermission("customer.payments");
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, customerId: viewer.user.id },
    select: { id: true, organizationId: true, trackingCode: true, customer: { select: { email: true } } },
  });
  if (!booking) return { message: await paymentsErrorMessage(new PaymentsError("not_found")) };
  const path = returnTo === "event" ? `/app/event?booking=${booking.trackingCode}&` : "/app/my-payments?";
  return checkout(booking, (paid) => `${path}paid=${paid}`);
}

/** Paying through the quote link: like accepting, the secret token grants access. */
export async function payByQuoteTokenAction(token: string): Promise<RedirectResult> {
  const quote = await prisma.quote.findUnique({
    where: { token },
    select: { status: true, booking: { select: { id: true, organizationId: true, customer: { select: { email: true } } } } },
  });
  if (!quote || quote.status !== "accepted") {
    return { message: await paymentsErrorMessage(new PaymentsError("not_found")) };
  }
  return checkout(quote.booking, (paid) => `/q/${encodeURIComponent(token)}?paid=${paid}`);
}

export type ReportPaymentInput = { method: "bank_transfer" | "cash"; amount: string; paidOn: string; reference: string };

/** Records the customer's report; the agency confirms it once the money is in. */
async function report(booking: { id: string; organizationId: string; customerId: string | null; customer: { name: string } | null }, input: ReportPaymentInput): Promise<ActionResult> {
  const t = await getTranslations("pay");
  if (!booking.customerId) return { ok: false, message: t("report_not_found") };
  const options = await paymentOptions(booking.organizationId);
  if ((input.method === "bank_transfer" && !options.bank) || (input.method === "cash" && !options.cash)) return { ok: false, message: t("report_method") };
  const amountCents = parseEuros(input.amount);
  if (amountCents === null || amountCents <= 0) return { ok: false, message: t("report_invalid_amount") };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.paidOn) || input.paidOn > todayInNetherlands()) return { ok: false, message: t("report_date") };
  try {
    const claim = await submitPaymentClaim(booking.organizationId, booking.id, booking.customerId, {
      method: input.method,
      amountCents,
      paidOn: input.paidOn,
      reference: input.reference.trim() || null,
      note: null,
    });
    await announceClaim(claim, booking.customer?.name ?? "");
    return { ok: true, message: t("reported") };
  } catch (error) {
    if (error instanceof PaymentClaimError) return { ok: false, message: t(`report_${error.code}`) };
    throw error;
  }
}

/** A signed-in customer reporting a payment for one of their own bookings. */
export async function reportPaymentAction(bookingId: string, input: ReportPaymentInput): Promise<ActionResult> {
  const viewer = await requirePermission("customer.payments");
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, customerId: viewer.user.id },
    select: { id: true, organizationId: true, customerId: true, customer: { select: { name: true } } },
  });
  if (!booking) return { ok: false, message: (await getTranslations("pay"))("report_not_found") };
  const result = await report(booking, input);
  revalidatePath("/[locale]/app/my-payments", "page");
  revalidatePath("/[locale]/app/event", "page");
  return result;
}

/** Reporting through the quote link: the secret token grants access, as for paying. */
export async function reportPaymentByTokenAction(token: string, input: ReportPaymentInput): Promise<ActionResult> {
  const quote = await prisma.quote.findUnique({
    where: { token },
    select: { status: true, booking: { select: { id: true, organizationId: true, customerId: true, customer: { select: { name: true } } } } },
  });
  if (!quote || quote.status !== "accepted") return { ok: false, message: (await getTranslations("pay"))("report_not_found") };
  return report(quote.booking, input);
}
