import { randomUUID } from "node:crypto";
import type Stripe from "stripe";
import { afterAll, describe, expect, it } from "vitest";
import { applyForAffiliate, approveDueCommissions, attachReferral, prisma, setAffiliateStatus } from "@stagedesk/db";
import { adjustCommissionsForCharge, recordInvoiceCommission, runAffiliatePayouts } from "./affiliates";
import { fakeStripe } from "./test/fixtures";

const run = `aff${Date.now().toString(36)}`;
const created: { users: string[]; orgs: string[] } = { users: [], orgs: [] };
let seq = 0;

async function user(email: string, name = "Test") {
  const id = `${run}-u${++seq}`;
  await prisma.user.create({ data: { id, name, email } });
  created.users.push(id);
  return { id, email };
}

/** An agency on the Business plan (€149 a month) with a Stripe customer. */
async function agency(ownerEmail: string) {
  const owner = await user(ownerEmail);
  const id = `${run}-o${++seq}`;
  await prisma.organization.create({ data: { id, name: `Agency ${seq}`, slug: id, stripeCustomerId: `cus_${id}` } });
  await prisma.member.create({ data: { id: randomUUID(), organizationId: id, userId: owner.id, role: "agency_owner" } });
  const plan = await prisma.plan.upsert({
    where: { key: "test-business" },
    update: {},
    create: { id: randomUUID(), key: "test-business", name: { nl: "Business", en: "Business" }, monthlyPriceCents: 14_900, yearlyPriceCents: 149_000, limits: {}, features: {} },
  });
  await prisma.subscription.create({ data: { id: randomUUID(), organizationId: id, planId: plan.id, status: "active" } });
  created.orgs.push(id);
  return { id, owner, customer: `cus_${id}` };
}

async function approvedAffiliate(email: string, name: string) {
  const u = await user(email, name);
  const a = await applyForAffiliate({ userId: u.id, name, website: null, pitch: "Wedding planner", wantedCode: null });
  await setAffiliateStatus(a.id, "approved");
  await prisma.affiliate.update({ where: { id: a.id }, data: { stripeAccountId: `acct_${a.id.slice(0, 8)}`, payoutsEnabled: true } });
  return { ...a, user: u };
}

/** A paid invoice for €149 + 21% VAT. */
const invoice = (customer: string, paidAt: Date, n: number) =>
  ({
    id: `in_${run}_${n}`,
    customer,
    amount_paid: 18_029,
    total_excluding_tax: 14_900,
    status_transitions: { paid_at: Math.floor(paidAt.getTime() / 1000) },
  }) as unknown as Stripe.Invoice;

afterAll(async () => {
  const affiliates = await prisma.affiliate.findMany({ where: { userId: { in: created.users } }, select: { id: true } });
  const ids = affiliates.map((a) => a.id);
  await prisma.commission.deleteMany({ where: { affiliateId: { in: ids } } });
  await prisma.affiliatePayout.deleteMany({ where: { affiliateId: { in: ids } } });
  await prisma.referral.deleteMany({ where: { agencyId: { in: created.orgs } } });
  await prisma.affiliateClick.deleteMany({ where: { affiliateId: { in: ids } } });
  await prisma.affiliate.deleteMany({ where: { id: { in: ids } } });
  await prisma.subscription.deleteMany({ where: { organizationId: { in: created.orgs } } });
  await prisma.member.deleteMany({ where: { organizationId: { in: created.orgs } } });
  await prisma.organization.deleteMany({ where: { id: { in: created.orgs } } });
  await prisma.user.deleteMany({ where: { id: { in: created.users } } });
});

describe("affiliate program", () => {
  it("pays the affiliate for the approved commission after the referred agency pays twice", async () => {
    const { stripe, calls } = fakeStripe();
    const pim = await approvedAffiliate(`pim@${run}-partners.nl`, "Pim Partner");
    const a = await agency(`owner@${run}-agency.nl`);
    const signup = new Date("2026-09-01T10:00:00Z");

    const referral = await attachReferral({
      agencyId: a.id,
      ownerUserId: a.owner.id,
      ownerEmail: a.owner.email,
      visit: { code: pim.code, campaign: "instagram", at: new Date("2026-08-20T10:00:00Z") },
      promoCode: null,
      now: signup,
    });
    expect(referral).toMatchObject({ type: "affiliate", affiliateId: pim.id, status: "active", campaign: "instagram", commissionBps: 2_500, commissionMonths: 12 });

    const first = await recordInvoiceCommission(stripe, invoice(a.customer, new Date("2026-09-15T10:00:00Z"), 1));
    const second = await recordInvoiceCommission(stripe, invoice(a.customer, new Date("2026-10-15T10:00:00Z"), 2));
    // 25% of €149 excluding VAT, twice.
    expect([first?.amountCents, second?.amountCents]).toEqual([3_725, 3_725]);
    expect(first?.stripePaymentIntentId).toBe(`pi_for_in_${run}_1`);
    expect(await recordInvoiceCommission(stripe, invoice(a.customer, new Date("2026-10-15T10:00:00Z"), 2))).toBeNull();

    // Both stay pending for the 30-day approval window.
    expect(await approveDueCommissions(new Date("2026-10-20T10:00:00Z"))).toMatchObject({ approved: 1 });
    expect(await approveDueCommissions(new Date("2026-11-15T10:00:00Z"))).toMatchObject({ approved: 1 });

    // Not on another day; on the payout day, one transfer for both.
    expect(await runAffiliatePayouts(stripe, new Date("2026-11-20T06:00:00Z"))).toEqual([]);
    const paid = await runAffiliatePayouts(stripe, new Date("2026-12-01T06:00:00Z"));
    expect(paid).toEqual([expect.objectContaining({ affiliateId: pim.id, amountCents: 7_450 })]);
    // Other tests share the database and the fake Stripe log, so look for this partner's transfer.
    const transfer = calls.find((c) => c.method === "transfers.create" && (c.params as { destination?: string }).destination === `acct_${pim.id.slice(0, 8)}`);
    expect(transfer?.params).toMatchObject({ amount: 7_450, currency: "eur", destination: `acct_${pim.id.slice(0, 8)}` });
    const statuses = await prisma.commission.findMany({ where: { affiliateId: pim.id }, select: { status: true, payoutId: true } });
    expect(statuses.every((c) => c.status === "paid" && c.payoutId === paid[0]!.payoutId)).toBe(true);

    // Running again pays nothing twice.
    expect(await runAffiliatePayouts(stripe, new Date("2026-12-01T07:00:00Z"))).toEqual([]);
  });

  it("stops earning after the commission period", async () => {
    const { stripe } = fakeStripe();
    const aff = await approvedAffiliate(`kim@${run}-blog.nl`, "Kim Blog");
    const a = await agency(`owner2@${run}-agency2.nl`);
    await prisma.referral.create({
      data: { id: randomUUID(), agencyId: a.id, type: "affiliate", affiliateId: aff.id, source: "cookie", commissionBps: 2_500, commissionMonths: 2 },
    });
    await recordInvoiceCommission(stripe, invoice(a.customer, new Date("2026-01-10T10:00:00Z"), 10));
    await recordInvoiceCommission(stripe, invoice(a.customer, new Date("2026-02-10T10:00:00Z"), 11));
    expect(await recordInvoiceCommission(stripe, invoice(a.customer, new Date("2026-03-10T10:00:00Z"), 12))).toBeNull();
  });

  it("refuses self-referrals and lets a promo code beat the cookie", async () => {
    const cookieAff = await approvedAffiliate(`jan@${run}-venues.nl`, "Jan Venues");
    const promoAff = await approvedAffiliate(`eva@${run}-trainers.nl`, "Eva Trainer");
    const visit = { code: cookieAff.code, campaign: null, at: new Date() };

    const own = await agency(`boss@${run}-venues.nl`);
    const self = await attachReferral({ agencyId: own.id, ownerUserId: own.owner.id, ownerEmail: own.owner.email, visit, promoCode: null });
    expect(self).toMatchObject({ status: "rejected", rejectReason: "same_domain" });

    const other = await agency(`info@${run}-other.nl`);
    const promo = await attachReferral({ agencyId: other.id, ownerUserId: other.owner.id, ownerEmail: other.owner.email, visit, promoCode: promoAff.promoCode });
    expect(promo).toMatchObject({ affiliateId: promoAff.id, source: "promo_code", status: "active" });

    const late = await agency(`info@${run}-late.nl`);
    const stale = { code: cookieAff.code, campaign: null, at: new Date(Date.now() - 61 * 86_400_000) };
    expect(await attachReferral({ agencyId: late.id, ownerUserId: late.owner.id, ownerEmail: late.owner.email, visit: stale, promoCode: null })).toBeNull();
  });

  it("takes commission back on refunds and disputes before payout", async () => {
    const { stripe } = fakeStripe();
    const aff = await approvedAffiliate(`ruud@${run}-dj.nl`, "Ruud DJ");
    const a = await agency(`owner@${run}-refund.nl`);
    await attachReferral({ agencyId: a.id, ownerUserId: a.owner.id, ownerEmail: a.owner.email, visit: { code: aff.code, campaign: null, at: new Date() }, promoCode: null });
    const c = await recordInvoiceCommission(stripe, invoice(a.customer, new Date(), 20));
    expect(c?.amountCents).toBe(3_725);

    await adjustCommissionsForCharge({ payment_intent: c!.stripePaymentIntentId, amount: 18_029, amount_refunded: 9_015 }, "refund");
    expect((await prisma.commission.findUniqueOrThrow({ where: { id: c!.id } })).amountCents).toBe(1_863);
    await adjustCommissionsForCharge({ payment_intent: c!.stripePaymentIntentId, amount: 18_029, amount_refunded: 0 }, "dispute");
    expect(await prisma.commission.findUniqueOrThrow({ where: { id: c!.id } })).toMatchObject({ status: "cancelled", amountCents: 0, cancelReason: "dispute" });
  });

  it("gives both agencies a free month when a referred agency first pays", async () => {
    const { stripe, calls } = fakeStripe();
    const referrer = await agency(`owner@${run}-referrer.nl`);
    await prisma.organization.update({ where: { id: referrer.id }, data: { referralCode: `r-${run.slice(-6)}` } });
    const newcomer = await agency(`owner@${run}-newcomer.nl`);
    const referral = await attachReferral({
      agencyId: newcomer.id,
      ownerUserId: newcomer.owner.id,
      ownerEmail: newcomer.owner.email,
      visit: { code: `r-${run.slice(-6)}`, campaign: null, at: new Date() },
      promoCode: null,
    });
    expect(referral).toMatchObject({ type: "agency", referringAgencyId: referrer.id, status: "active" });

    await recordInvoiceCommission(stripe, invoice(newcomer.customer, new Date(), 30));
    await recordInvoiceCommission(stripe, invoice(newcomer.customer, new Date(), 31));
    const credits = calls.filter((c) => c.method === "customers.createBalanceTransaction");
    expect(credits.map((c) => [c.params["customerId"], c.params["amount"]])).toEqual([
      [newcomer.customer, -14_900],
      [referrer.customer, -14_900],
    ]);
  });
});
