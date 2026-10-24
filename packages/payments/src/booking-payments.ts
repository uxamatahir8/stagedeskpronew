import { randomUUID } from "node:crypto";
import type Stripe from "stripe";
import { agencyDeskUserIds, notify, prisma, tenantDb } from "@stagedesk/db";
import { PaymentsError } from "./subscriptions";

/** What the customer should pay next: the rest of the deposit, else the balance. */
export function amountDue(booking: { totalCents: number; depositCents: number; paidCents: number }) {
  if (booking.paidCents < booking.depositCents) return { kind: "deposit" as const, amountCents: booking.depositCents - booking.paidCents };
  const balance = booking.totalCents - booking.paidCents;
  return balance > 0 ? { kind: "balance" as const, amountCents: balance } : null;
}

/**
 * Stripe Checkout for a booking payment (iDEAL or card). The charge is made
 * by the platform on behalf of the agency, so the customer sees the agency's
 * name; the money is split and transferred after the event (see payouts).
 */
export async function bookingCheckout(
  stripe: Stripe,
  input: { organizationId: string; bookingId: string; customerEmail: string | null; locale: "nl" | "en"; successUrl: string; cancelUrl: string },
) {
  const db = tenantDb(input.organizationId);
  const booking = await db.booking.findFirst({ where: { id: input.bookingId }, include: { organization: { select: { name: true } } } });
  if (!booking || !["booked", "confirmed", "completed"].includes(booking.status)) throw new PaymentsError("not_found");
  const due = amountDue(booking);
  if (!due) throw new PaymentsError("nothing_due");

  const account = await db.connectedAccount.findFirst({ where: { artistId: null, chargesEnabled: true } });
  if (!account) throw new PaymentsError("agency_not_connected");

  const label = input.locale === "en" ? (due.kind === "deposit" ? "Deposit" : "Balance") : due.kind === "deposit" ? "Aanbetaling" : "Restbedrag";
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    // Payment methods (iDEAL, card) are switched on in the Stripe dashboard;
    // Checkout shows whichever are enabled for euro payments.
    locale: input.locale,
    customer_email: input.customerEmail ?? undefined,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: booking.currency.toLowerCase(),
          unit_amount: due.amountCents,
          product_data: { name: `${label} · ${booking.organization.name} · ${booking.trackingCode}` },
        },
      },
    ],
    payment_intent_data: {
      on_behalf_of: account.stripeAccountId,
      transfer_group: booking.id,
      metadata: { bookingId: booking.id, organizationId: input.organizationId, kind: due.kind },
    },
    metadata: { bookingId: booking.id, organizationId: input.organizationId, kind: due.kind },
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
  });
  return session.url!;
}

/**
 * Records a completed Checkout payment for a booking. Idempotent: the same
 * session is only ever recorded once.
 */
export async function recordStripePayment(stripe: Stripe, session: Stripe.Checkout.Session) {
  const bookingId = session.metadata?.["bookingId"];
  const organizationId = session.metadata?.["organizationId"];
  if (!bookingId || !organizationId || session.payment_status !== "paid") return null;
  if (await prisma.payment.findUnique({ where: { stripeCheckoutId: session.id }, select: { id: true } })) return null;

  const intentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  if (!intentId) return null;
  const intent = await stripe.paymentIntents.retrieve(intentId, { expand: ["latest_charge.balance_transaction"] });
  const charge = typeof intent.latest_charge === "object" ? intent.latest_charge : null;
  const balance = charge && typeof charge.balance_transaction === "object" ? charge.balance_transaction : null;
  const amount = session.amount_total ?? intent.amount;
  const fee = balance?.fee ?? 0;
  const kind = session.metadata?.["kind"] === "deposit" ? "deposit" : "balance";

  const db = tenantDb(organizationId);
  const paymentId = await db.$transaction(async (tx) => {
    const booking = await tx.booking.findFirst({ where: { id: bookingId }, select: { id: true } });
    if (!booking) return null;
    const paymentId = randomUUID();
    await tx.payment.create({
      data: {
        id: paymentId,
        organizationId,
        bookingId,
        kind,
        method: "stripe",
        amountCents: amount,
        receivedAt: new Date((charge?.created ?? Math.floor(Date.now() / 1000)) * 1000),
        reference: charge?.payment_method_details?.type ?? null,
        stripeCheckoutId: session.id,
        stripePaymentIntentId: intentId,
        stripeChargeId: charge?.id ?? null,
        stripeFeeCents: fee,
      },
    });
    await tx.booking.updateMany({ where: { id: bookingId }, data: { paidCents: { increment: amount } } });
    await tx.ledgerEntry.createMany({
      data: [
        { organizationId, bookingId, paymentId, type: "payment", party: "platform", amountCents: amount, stripeObjectId: charge?.id ?? intentId },
        { organizationId, bookingId, paymentId, type: "stripe_fee", party: "stripe", amountCents: fee, stripeObjectId: balance?.id ?? null },
      ],
    });
    await tx.bookingEvent.create({
      data: { organizationId, bookingId, type: "payment_recorded", data: { amountCents: amount, method: "stripe" } },
    });
    return paymentId;
  });
  if (paymentId) {
    const booking = await prisma.booking.findUnique({ where: { id: bookingId }, select: { trackingCode: true } });
    await notify(await agencyDeskUserIds(organizationId, ["agency_owner", "agency_admin"]), {
      type: "payment_received",
      data: { cents: amount, code: booking?.trackingCode ?? "" },
      url: `/app/bookings/${booking?.trackingCode ?? ""}`,
    });
  }
  return paymentId;
}
