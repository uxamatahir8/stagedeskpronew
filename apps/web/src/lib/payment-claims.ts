import "server-only";
import { getTranslations } from "next-intl/server";
import { formatIban } from "@stagedesk/core";
import { getSetting, notify, prisma } from "@stagedesk/db";
import { isStripeConfigured } from "@stagedesk/payments";
import { absoluteUrl, deliver, userLocale } from "./mail";

export type PaymentOptions = {
  online: boolean;
  bank: { iban: string; name: string; instructions: string | null } | null;
  cash: boolean;
};

/**
 * How a customer can pay this agency: what the platform allows, what the
 * agency switched on, and (for online) whether Stripe is set up on both sides.
 */
export async function paymentOptions(organizationId: string): Promise<PaymentOptions> {
  const [allowed, agency, connected, stripe] = await Promise.all([
    getSetting("payments.methods"),
    prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { acceptOnline: true, acceptBankTransfer: true, acceptCash: true, iban: true, bankAccountName: true, paymentInstructions: true },
    }),
    prisma.connectedAccount.count({ where: { organizationId, artistId: null, chargesEnabled: true } }),
    isStripeConfigured(),
  ]);
  return {
    online: allowed.online && agency.acceptOnline && stripe && connected > 0,
    bank:
      allowed.bankTransfer && agency.acceptBankTransfer && agency.iban && agency.bankAccountName
        ? { iban: formatIban(agency.iban), name: agency.bankAccountName, instructions: agency.paymentInstructions }
        : null,
    cash: allowed.cash && agency.acceptCash,
  };
}

const money = (locale: "nl" | "en", cents: number, currency = "EUR") => new Intl.NumberFormat(locale === "en" ? "en-GB" : "nl-NL", { style: "currency", currency }).format(cents / 100);
const day = (locale: "nl" | "en", date: Date) => new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "nl-NL", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(date);

async function methodName(locale: "nl" | "en", method: string) {
  const t = await getTranslations({ locale, namespace: "paymentMethods" });
  return t.has(method as "bank_transfer") ? t(method as "bank_transfer") : method;
}

/** The customer reported a payment: everyone on the desk is told to check it. */
export async function announceClaim(claim: { organizationId: string; bookingId: string; amountCents: number; method: string }, customerName: string) {
  const booking = await prisma.booking.findUniqueOrThrow({ where: { id: claim.bookingId }, select: { trackingCode: true, currency: true } });
  const staff = await prisma.member.findMany({
    where: { organizationId: claim.organizationId, role: { in: ["agency_owner", "agency_admin", "agency_staff"] } },
    include: { user: { select: { email: true, locale: true } } },
  });
  for (const m of staff) {
    const locale = userLocale(m.user.locale);
    deliver({
      kind: "paymentReported",
      to: m.user.email,
      params: { locale, customer: customerName, amount: money(locale, claim.amountCents, booking.currency), method: await methodName(locale, claim.method), code: booking.trackingCode, url: absoluteUrl(locale, `/app/bookings/${booking.trackingCode}`) },
    });
  }
  await notify(
    staff.map((m) => m.userId),
    { type: "payment_reported", data: { name: customerName, code: booking.trackingCode, cents: claim.amountCents }, url: `/app/bookings/${booking.trackingCode}` },
  );
}

/**
 * A receipt for a payment recorded outside Stripe (confirmed claim or entered
 * by the agency), when receipts are switched on in the platform settings.
 */
export async function sendReceipt(payment: { organizationId: string; bookingId: string; amountCents: number; method: string; receivedAt: Date }) {
  const [{ sendReceipts }, booking] = await Promise.all([
    getSetting("payments.methods"),
    prisma.booking.findUniqueOrThrow({
      where: { id: payment.bookingId },
      select: { trackingCode: true, currency: true, totalCents: true, paidCents: true, customerId: true, organization: { select: { name: true } }, customer: { select: { name: true, email: true, locale: true } } },
    }),
  ]);
  if (!booking.customer || !booking.customerId) return;
  const locale = userLocale(booking.customer.locale);
  if (sendReceipts) {
    deliver({
      kind: "paymentReceipt",
      to: booking.customer.email,
      params: {
        locale,
        name: booking.customer.name.split(/\s+/)[0] ?? booking.customer.name,
        agency: booking.organization.name,
        code: booking.trackingCode,
        amount: money(locale, payment.amountCents, booking.currency),
        method: await methodName(locale, payment.method),
        date: day(locale, payment.receivedAt),
        paid: money(locale, booking.paidCents, booking.currency),
        remaining: money(locale, Math.max(0, booking.totalCents - booking.paidCents), booking.currency),
        url: absoluteUrl(locale, "/app/my-payments"),
      },
    });
  }
  await notify([booking.customerId], { type: "payment_confirmed", data: { name: booking.organization.name, code: booking.trackingCode, cents: payment.amountCents }, url: "/app/my-payments" });
}

/** The agency couldn't find the money: the customer hears why. */
export async function announceRejected(claim: { bookingId: string; amountCents: number; rejectReason: string | null }) {
  const booking = await prisma.booking.findUniqueOrThrow({
    where: { id: claim.bookingId },
    select: { trackingCode: true, currency: true, customerId: true, organization: { select: { name: true } }, customer: { select: { name: true, email: true, locale: true } } },
  });
  if (!booking.customer || !booking.customerId) return;
  const locale = userLocale(booking.customer.locale);
  deliver({
    kind: "paymentNotReceived",
    to: booking.customer.email,
    params: {
      locale,
      name: booking.customer.name.split(/\s+/)[0] ?? booking.customer.name,
      agency: booking.organization.name,
      code: booking.trackingCode,
      amount: money(locale, claim.amountCents, booking.currency),
      reason: claim.rejectReason ?? "",
      url: absoluteUrl(locale, "/app/my-payments"),
    },
  });
  await notify([booking.customerId], { type: "payment_rejected", data: { name: booking.organization.name, code: booking.trackingCode, cents: claim.amountCents }, url: "/app/my-payments" });
}
