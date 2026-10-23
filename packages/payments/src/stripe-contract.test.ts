import { afterAll, beforeAll, describe, expect, it } from "vitest";
import Stripe from "stripe";
import { applyForAffiliate, prisma, setAffiliateStatus } from "@stagedesk/db";
import { affiliateOnboardingLink, payAffiliate, recordInvoiceCommission, syncAffiliatePromo } from "./affiliates";
import { bookingCheckout, recordStripePayment } from "./booking-payments";
import { connectOnboardingLink } from "./connect";
import { syncPlanToStripe } from "./plans";
import { payoutBooking } from "./payouts";
import { refundPayment } from "./refunds";
import { billingPortal, subscriptionCheckout } from "./subscriptions";
import { agencyWithAccounts, cleanup, complete, confirmedBooking, paidSession } from "./test/fixtures";

/**
 * Sends every Stripe request our code makes to stripe-mock, which validates
 * it against Stripe's OpenAPI spec. Skipped when stripe-mock isn't running.
 */
const MOCK = process.env["STRIPE_MOCK_URL"] ?? "http://localhost:12111";
const mockUp = await fetch(`${MOCK}/v1/products`, { headers: { Authorization: "Bearer sk_test_123" } })
  .then((r) => r.ok)
  .catch(() => false);

const run = `c${Date.now().toString(36)}`;
const url = new URL(MOCK);
const stripe = new Stripe("sk_test_123", { host: url.hostname, port: url.port, protocol: "http", maxNetworkRetries: 0 });
const planId = `${run}-plan`;

describe.skipIf(!mockUp)("Stripe API contract (stripe-mock)", () => {
  let agency: Awaited<ReturnType<typeof agencyWithAccounts>>;

  beforeAll(async () => {
    agency = await agencyWithAccounts(run, { artistConnected: true });
    await prisma.plan.create({
      data: {
        id: planId,
        key: `${run}-pro`,
        name: { nl: "Pro", en: "Pro" },
        monthlyPriceCents: 4_900,
        yearlyPriceCents: 49_000,
        features: { nl: [], en: [] },
        limits: {},
      },
    });
  });

  afterAll(async () => {
    await prisma.subscription.deleteMany({ where: { planId } });
    await prisma.plan.deleteMany({ where: { id: planId } });
    await cleanup(run);
    await prisma.$disconnect();
  });

  it("syncs a plan to a product with monthly and yearly prices", async () => {
    const result = await syncPlanToStripe(stripe, planId);
    expect(result.productId).toMatch(/^prod_/);
    // A second sync retrieves and compares the existing prices.
    await syncPlanToStripe(stripe, planId);
  });

  it("creates subscription checkout and billing portal sessions", async () => {
    const checkout = await subscriptionCheckout(stripe, {
      organizationId: agency.organizationId,
      planId,
      interval: "year",
      email: "owner@test.local",
      locale: "nl",
      successUrl: "http://localhost:3000/app/billing?done=1",
      cancelUrl: "http://localhost:3000/app/billing",
    });
    expect(checkout).toMatch(/^https?:\/\//);
    expect(await billingPortal(stripe, agency.organizationId, "http://localhost:3000/app/billing")).toMatch(/^https?:\/\//);
  });

  it("creates Express onboarding links for an agency and an artist", async () => {
    await prisma.connectedAccount.deleteMany({ where: { organizationId: agency.organizationId } });
    for (const artistId of [null, agency.artistId]) {
      const link = await connectOnboardingLink(stripe, {
        organizationId: agency.organizationId,
        artistId,
        email: "x@test.local",
        returnUrl: "http://localhost:3000/app/payments",
        refreshUrl: "http://localhost:3000/app/payments",
      });
      expect(link).toMatch(/^https?:\/\//);
    }
    // Make both accounts usable for the payment tests below.
    await prisma.connectedAccount.updateMany({ where: { organizationId: agency.organizationId }, data: { chargesEnabled: true, payoutsEnabled: true } });
  });

  it("creates a booking checkout, records the payment, pays out and refunds", async () => {
    const { booking } = await confirmedBooking(agency, "2027-06-12", new Date("2027-05-01T10:00:00Z"));
    const checkout = await bookingCheckout(stripe, {
      organizationId: agency.organizationId,
      bookingId: booking.id,
      customerEmail: "c@test.local",
      locale: "en",
      successUrl: "http://localhost:3000/q/x?paid=1",
      cancelUrl: "http://localhost:3000/q/x",
    });
    expect(checkout).toMatch(/^https?:\/\//);

    const paymentId = await recordStripePayment(stripe, paidSession(agency.organizationId, booking.id, 150_004, "balance"));
    expect(paymentId).toBeTruthy();
    await complete(agency, booking.id, new Date("2027-06-12T22:00:00Z"));
    const { transferred } = await payoutBooking(stripe, booking.id, new Date("2027-06-20T10:00:00Z"));
    expect(transferred).toBeGreaterThan(0);
    await refundPayment(stripe, { organizationId: agency.organizationId, paymentId: paymentId!, amountCents: 10_000, actorId: agency.owner });
    expect(await prisma.ledgerEntry.count({ where: { bookingId: booking.id, type: "transfer_reversal" } })).toBe(2);
  });

  it("creates an affiliate promo code, onboarding link, commission and payout", async () => {
    const userId = `${run}-aff`;
    await prisma.user.create({ data: { id: userId, name: "Contract Partner", email: `${run}-aff@test.local` } });
    const affiliate = await applyForAffiliate({ userId, name: "Contract Partner", website: null, pitch: null, wantedCode: null });
    await setAffiliateStatus(affiliate.id, "approved");
    expect(await syncAffiliatePromo(stripe, affiliate.id)).toMatch(/^promo_/);
    expect(await affiliateOnboardingLink(stripe, { affiliateId: affiliate.id, email: "a@test.local", returnUrl: "http://localhost:3000/app/payouts", refreshUrl: "http://localhost:3000/app/payouts" })).toMatch(/^https?:\/\//);

    await prisma.organization.update({ where: { id: agency.organizationId }, data: { stripeCustomerId: `cus_${run}` } });
    await prisma.referral.create({ data: { id: `${run}-ref`, agencyId: agency.organizationId, type: "affiliate", affiliateId: affiliate.id, source: "cookie", commissionBps: 5_000 } });
    const invoice = { id: `in_${run}`, customer: `cus_${run}`, amount_paid: 12_100, total_excluding_tax: 10_000, status_transitions: { paid_at: Math.floor(Date.now() / 1000) } } as unknown as Stripe.Invoice;
    const commission = await recordInvoiceCommission(stripe, invoice);
    expect(commission?.amountCents).toBe(5_000);
    await prisma.commission.update({ where: { id: commission!.id }, data: { status: "approved" } });
    await prisma.affiliate.update({ where: { id: affiliate.id }, data: { payoutsEnabled: true } });
    expect((await payAffiliate(stripe, affiliate.id))?.amountCents).toBe(5_000);

    await prisma.commission.deleteMany({ where: { affiliateId: affiliate.id } });
    await prisma.affiliatePayout.deleteMany({ where: { affiliateId: affiliate.id } });
    await prisma.referral.deleteMany({ where: { id: `${run}-ref` } });
    await prisma.affiliate.delete({ where: { id: affiliate.id } });
    await prisma.user.delete({ where: { id: userId } });
  });
});
