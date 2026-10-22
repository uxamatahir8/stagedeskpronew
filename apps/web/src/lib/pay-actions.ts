"use server";

import { getLocale } from "next-intl/server";
import { prisma } from "@stagedesk/db";
import { bookingCheckout, getStripe, PaymentsError } from "@stagedesk/payments";
import type { RedirectResult } from "@/components/redirect-button";
import { paymentsErrorMessage } from "@/lib/billing";
import { absoluteUrl, userLocale } from "@/lib/mail";
import { requirePermission } from "@/lib/viewer";

async function checkout(booking: { id: string; organizationId: string; customer: { email: string } | null }, returnPath: (paid: 0 | 1) => string): Promise<RedirectResult> {
  const stripe = getStripe();
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
