import { afterAll, beforeAll, describe, expect, it } from "vitest";
import Stripe from "stripe";
import { getSetting, prisma, updateSetting } from "@stagedesk/db";
import { recordStripePayment } from "./booking-payments";
import { payoutBooking } from "./payouts";
import { refundPayment } from "./refunds";
import { agencyWithAccounts, cleanup, complete, confirmedBooking, fakeStripe, paidSession } from "./test/fixtures";
import { processStoredEvent, receiveWebhook } from "./webhooks";

const run = `p${Date.now().toString(36)}`;
const may = new Date("2027-05-01T10:00:00Z");
const afterEvent = new Date("2027-06-20T10:00:00Z"); // event 12 June + dispute window
let originalFees: Awaited<ReturnType<typeof getSetting<"fees.platform">>>;

beforeAll(async () => {
  originalFees = await getSetting("fees.platform");
  // 3% platform fee, agency carries Stripe's fee: the plan's worked example.
  await updateSetting(
    "fees.platform",
    { ...originalFees, defaultRule: { type: "percentage", percentageBps: 300, fixedCents: 0, minCents: null, maxCents: null }, stripeFeePaidBy: "agency" },
    null,
  );
});

afterAll(async () => {
  await updateSetting("fees.platform", originalFees, null);
  await cleanup(run);
  await prisma.$disconnect();
});

describe("booking money flow", () => {
  it("splits a €1,500 booking between artist, agency and platform, and a refund reverses it", async () => {
    const a = await agencyWithAccounts(`${run}a`, { artistConnected: true });
    const { booking } = await confirmedBooking(a, "2027-06-12", may);
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).totalCents).toBe(150_004);

    // The quote rounds to €1,500.04; pay exactly what's due in two Stripe payments.
    const { stripe, calls } = fakeStripe({ stripeFeeCents: 0 });
    await recordStripePayment(stripe, paidSession(a.organizationId, booking.id, 45_001, "deposit"));
    await recordStripePayment(stripe, paidSession(a.organizationId, booking.id, 105_003, "balance"));
    // A repeated webhook doesn't record the payment twice.
    await recordStripePayment(stripe, paidSession(a.organizationId, booking.id, 45_001, "deposit"));
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).paidCents).toBe(150_004);

    // Changing the fee now must not affect this already accepted booking.
    await updateSetting("fees.platform", { ...(await getSetting("fees.platform")), defaultRule: { type: "percentage", percentageBps: 900, fixedCents: 0, minCents: null, maxCents: null } }, null);

    await complete(a, booking.id, new Date("2027-06-12T22:00:00Z"));
    // Inside the dispute window nothing moves.
    expect((await payoutBooking(stripe, booking.id, new Date("2027-06-13T10:00:00Z"))).transferred).toBe(0);
    await payoutBooking(stripe, booking.id, afterEvent);

    const transfers = calls.filter((c) => c.method === "transfers.create");
    const sum = (party: string) => transfers.filter((t) => (t.params["metadata"] as { party: string }).party === party).reduce((s, t) => s + (t.params["amount"] as number), 0);
    // 40% to the artist, 3% to the platform, the rest to the agency (to the cent, per payment).
    expect(sum("artist")).toBe(18_000 + 42_001);
    expect(sum("agency")).toBe(25_651 + 59_852);
    const fees = await prisma.ledgerEntry.aggregate({ where: { bookingId: booking.id, type: "platform_fee" }, _sum: { amountCents: true } });
    expect(fees._sum.amountCents).toBe(1_350 + 3_150);
    expect(sum("artist") + sum("agency") + fees._sum.amountCents!).toBe(150_004);
    expect(transfers.every((t) => t.params["source_transaction"] && t.idempotencyKey)).toBe(true);
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe("settled");

    // Paying out again does nothing.
    await payoutBooking(stripe, booking.id, afterEvent);
    expect(calls.filter((c) => c.method === "transfers.create")).toHaveLength(4);

    // Refund half of the balance payment: half of each transfer comes back.
    const balance = await prisma.payment.findFirstOrThrow({ where: { bookingId: booking.id, kind: "balance" } });
    await refundPayment(stripe, { organizationId: a.organizationId, paymentId: balance.id, amountCents: 52_501, actorId: a.owner });
    const reversals = calls.filter((c) => c.method === "transfers.createReversal").map((c) => c.params["amount"]);
    expect(reversals).toEqual([21_000, 29_926]);
    expect(calls.find((c) => c.method === "refunds.create")?.params).toMatchObject({ amount: 52_501 });
    const after = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(after.paidCents).toBe(150_004 - 52_501);
    await expect(
      refundPayment(stripe, { organizationId: a.organizationId, paymentId: balance.id, amountCents: 60_000, actorId: a.owner }),
    ).rejects.toThrow("invalid_amount");
  });

  it("uses the new fee for bookings accepted after the change", async () => {
    // The previous test left the platform default at 9%.
    const a = await agencyWithAccounts(`${run}b`, { artistConnected: true });
    const { booking } = await confirmedBooking(a, "2027-06-12", may);
    const snapshot = (await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).feeSnapshot as { rule: { percentageBps: number } };
    expect(snapshot.rule.percentageBps).toBe(900);
  });

  it("sends the artist's share to the agency when the artist has no Stripe account, and records the debt", async () => {
    const a = await agencyWithAccounts(`${run}c`, { artistConnected: false });
    const { booking } = await confirmedBooking(a, "2027-06-12", may);
    const { stripe, calls } = fakeStripe({ stripeFeeCents: 2_150 });
    await recordStripePayment(stripe, paidSession(a.organizationId, booking.id, 150_004, "balance"));
    await complete(a, booking.id, new Date("2027-06-12T22:00:00Z"));
    await payoutBooking(stripe, booking.id, afterEvent);

    const transfers = calls.filter((c) => c.method === "transfers.create");
    expect(transfers).toHaveLength(1);
    expect((transfers[0]!.params["metadata"] as { party: string }).party).toBe("agency");
    const owed = await prisma.ledgerEntry.findFirstOrThrow({ where: { bookingId: booking.id, type: "owed_by_agency" } });
    expect(owed).toMatchObject({ artistId: a.artistId, amountCents: 60_002 });
  });

  it("holds the payout while a dispute is open", async () => {
    const a = await agencyWithAccounts(`${run}d`, { artistConnected: true });
    const { booking } = await confirmedBooking(a, "2027-06-12", may);
    const { stripe, calls } = fakeStripe();
    await recordStripePayment(stripe, paidSession(a.organizationId, booking.id, 150_004, "balance"));
    await complete(a, booking.id, new Date("2027-06-12T22:00:00Z"));
    await prisma.booking.update({ where: { id: booking.id }, data: { disputed: true } });
    expect((await payoutBooking(stripe, booking.id, afterEvent)).transferred).toBe(0);
    expect(calls).toHaveLength(0);
  });
});

describe("webhooks", () => {
  it("verifies the signature, stores each event once and processes it", async () => {
    const stripe = new Stripe("sk_test_dummy");
    const secret = "whsec_test_secret";
    const payload = JSON.stringify({ id: `evt_${run}`, object: "event", type: "customer.created", data: { object: { id: "cus_x" } } });
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret });

    const id = await receiveWebhook(stripe, payload, header, secret);
    expect(id).toBe(`evt_${run}`);
    expect(await receiveWebhook(stripe, payload, header, secret)).toBeNull();
    expect(await processStoredEvent(stripe, id!)).toBe("ignored");
    await expect(receiveWebhook(stripe, payload, "t=1,v1=forged", secret)).rejects.toThrow();
    await prisma.stripeEvent.delete({ where: { id: id! } });
  });
});
