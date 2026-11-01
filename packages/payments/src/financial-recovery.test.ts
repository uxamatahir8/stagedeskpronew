import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getSetting, prisma, updateSetting } from "@stagedesk/db";
import { recordStripePayment } from "./booking-payments";
import { MAX_OPERATION_ATTEMPTS } from "./operations";
import { payoutBooking, runFinancialOperations } from "./payouts";
import { closeRefundWithShortfall, refundPayment, syncChargeRefund } from "./refunds";
import { agencyWithAccounts, cleanup, complete, confirmedBooking, fakeStripe, paidSession, stripeError } from "./test/fixtures";
import { dueStripeEvents, MAX_EVENT_ATTEMPTS, processStoredEvent, replayStripeEvent, retryStripeEvents } from "./webhooks";

/**
 * Money operations under failure: timeouts after Stripe acted, crashes,
 * database errors, duplicate and concurrent requests. Every case must end in
 * one predictable state: each refund and transfer made once, booked once.
 */
const run = `fr${Date.now().toString(36)}`;
const may = new Date("2027-05-01T10:00:00Z");
const afterEvent = new Date("2027-06-20T10:00:00Z");
/** The worker continues operations created more than a minute ago. */
const later = (minutes: number) => new Date(Date.now() + minutes * 60_000);
let originalFees: Awaited<ReturnType<typeof getSetting<"fees.platform">>>;
let n = 0;

beforeAll(async () => {
  originalFees = await getSetting("fees.platform");
  await updateSetting(
    "fees.platform",
    { ...originalFees, defaultRule: { type: "percentage", percentageBps: 300, fixedCents: 0, minCents: null, maxCents: null }, stripeFeePaidBy: "agency" },
    null,
  );
});

afterAll(async () => {
  await updateSetting("fees.platform", originalFees, null);
  await prisma.stripeEvent.deleteMany({ where: { id: { startsWith: `evt_${run}` } } });
  await cleanup(run);
  await prisma.$disconnect();
});

/** A paid €1,500.04 booking (one Stripe payment), optionally completed and paid out. */
async function paidBooking(opts: { paidOut?: boolean } = {}) {
  const a = await agencyWithAccounts(`${run}${++n}`, { artistConnected: true });
  const { booking } = await confirmedBooking(a, "2027-06-12", may);
  const fake = fakeStripe();
  await recordStripePayment(fake.stripe, paidSession(a.organizationId, booking.id, 150_004, "balance"));
  const payment = await prisma.payment.findFirstOrThrow({ where: { bookingId: booking.id } });
  if (opts.paidOut) {
    await complete(a, booking.id, new Date("2027-06-12T22:00:00Z"));
    await payoutBooking(fake.stripe, booking.id, afterEvent);
  }
  return { a, booking, payment, ...fake };
}

const refund = (ctx: Awaited<ReturnType<typeof paidBooking>>, amountCents: number, requestId?: string) =>
  refundPayment(ctx.stripe, { organizationId: ctx.a.organizationId, paymentId: ctx.payment.id, amountCents, actorId: ctx.a.owner, requestId });

async function state(ctx: Awaited<ReturnType<typeof paidBooking>>) {
  const payment = await prisma.payment.findUniqueOrThrow({ where: { id: ctx.payment.id } });
  const booking = await prisma.booking.findUniqueOrThrow({ where: { id: ctx.booking.id } });
  const ledger = await prisma.ledgerEntry.findMany({ where: { bookingId: ctx.booking.id } });
  const sum = (type: string, party?: string) => ledger.filter((l) => l.type === type && (!party || l.party === party)).reduce((s, l) => s + l.amountCents, 0);
  const count = (type: string) => ledger.filter((l) => l.type === type).length;
  return { refunded: payment.refundedCents, paid: booking.paidCents, sum, count, transferredAt: payment.transferredAt };
}

describe("refunds", () => {
  it("refunds once when two different refunds of one payment are sent at the same time", async () => {
    const ctx = await paidBooking();
    const results = await Promise.allSettled([refund(ctx, 100_000), refund(ctx, 100_000)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason.code).toMatch(/operation_in_progress|invalid_amount/);
    expect(ctx.refunds).toHaveLength(1);
    const s = await state(ctx);
    expect(s.refunded).toBe(100_000);
    expect(s.paid).toBe(50_004);
    expect(s.sum("refund")).toBe(100_000);
  });

  it("treats the same request sent twice (double click) as one refund", async () => {
    const ctx = await paidBooking();
    const requestId = `${run}-dbl`;
    const results = await Promise.allSettled([refund(ctx, 20_000, requestId), refund(ctx, 20_000, requestId)]);
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    // And again later: still the same refund.
    expect((await refund(ctx, 20_000, requestId)).status).toBe("completed");
    expect(ctx.refunds).toHaveLength(1);
    expect((await state(ctx)).refunded).toBe(20_000);
    // A reused request id can't be bent into a different refund.
    await expect(refund(ctx, 30_000, requestId)).rejects.toThrow("invalid_amount");
  });

  it("recovers when Stripe refunded but the response was lost, even after Stripe forgot the key", async () => {
    const ctx = await paidBooking();
    ctx.failNext("refunds.create", "after");
    const first = await refund(ctx, 25_000);
    expect(first.status).toBe("pending");
    // Nothing booked yet, but the amount is reserved: no second refund can take it.
    expect((await state(ctx)).refunded).toBe(0);
    await expect(refund(ctx, 150_004)).rejects.toThrow("operation_in_progress");

    // Stripe's charge.refunded webhook arrives meanwhile: it must not book the refund itself.
    expect(await syncChargeRefund({ id: ctx.payment.stripeChargeId!, amount_refunded: 25_000 })).toBe(0);

    ctx.expireKeys();
    const outcome = await runFinancialOperations(ctx.stripe, later(5));
    expect(outcome.completed).toBeGreaterThanOrEqual(1);
    expect(ctx.refunds).toHaveLength(1);
    const s = await state(ctx);
    expect(s.refunded).toBe(25_000);
    expect(s.sum("refund")).toBe(25_000);
    expect((await prisma.financialOperation.findUniqueOrThrow({ where: { id: first.operationId } })).status).toBe("completed");
  });

  it("releases the reservation when Stripe refuses the refund", async () => {
    const ctx = await paidBooking();
    ctx.failNext("refunds.create", "before", stripeError("StripeInvalidRequestError", "charge_already_refunded"));
    await expect(refund(ctx, 10_000)).rejects.toThrow("refund_refused");
    expect((await state(ctx)).refunded).toBe(0);
    // A new refund is possible straight away.
    expect((await refund(ctx, 10_000)).status).toBe("completed");
    expect((await state(ctx)).refunded).toBe(10_000);
  });

  it("books once when the database fails after Stripe refunded", async () => {
    const ctx = await paidBooking();
    const original = prisma.$transaction.bind(prisma);
    let calls = 0;
    // The second transaction is the booking step (the first reserves); it fails once.
    const spy = vi.spyOn(prisma, "$transaction").mockImplementation(((...args: Parameters<typeof prisma.$transaction>) => {
      if (++calls === 2) return Promise.reject(new Error("Connection lost"));
      return original(...args);
    }) as typeof prisma.$transaction);
    try {
      expect((await refund(ctx, 12_345)).status).toBe("pending");
    } finally {
      spy.mockRestore();
    }
    expect((await state(ctx)).refunded).toBe(0);
    await runFinancialOperations(ctx.stripe, later(5));
    expect(ctx.refunds).toHaveLength(1);
    expect((await state(ctx)).refunded).toBe(12_345);
  });

  it("finishes a partly reversed refund without reversing the same transfer twice", async () => {
    const ctx = await paidBooking({ paidOut: true });
    // The artist's reversal goes through but the answer is lost; on the retry the agency's fails outright.
    ctx.failNext("transfers.createReversal", "after");
    ctx.failNext("transfers.createReversal", "before");
    const result = await refund(ctx, 75_002);
    expect(result.status).toBe("pending");
    ctx.expireKeys();
    await runFinancialOperations(ctx.stripe, later(5));
    await runFinancialOperations(ctx.stripe, later(30));
    // Exactly one reversal per party, matching half of each transfer.
    const parties = ctx.reversals.map((r) => r.metadata["party"]).sort();
    expect(parties).toEqual(["agency", "artist"]);
    const s = await state(ctx);
    expect(s.refunded).toBe(75_002);
    expect(s.count("transfer_reversal")).toBe(2);
    expect(-s.sum("transfer_reversal", "artist")).toBe(ctx.reversals.find((r) => r.metadata["party"] === "artist")!.amount);
  });

  it("goes to review after repeated failures, and an operator can book it with a shortfall", async () => {
    const ctx = await paidBooking({ paidOut: true });
    for (let i = 0; i < MAX_OPERATION_ATTEMPTS + 1; i++) ctx.failNext("transfers.createReversal", "before", stripeError("StripeAPIError"));
    const result = await refund(ctx, 50_000);
    for (let i = 1; i < MAX_OPERATION_ATTEMPTS; i++) await runFinancialOperations(ctx.stripe, later(i * 200));
    const op = await prisma.financialOperation.findUniqueOrThrow({ where: { id: result.operationId } });
    expect(op.status).toBe("review");
    // Nothing booked while in review; the refund itself went through once.
    expect((await state(ctx)).refunded).toBe(0);
    expect(ctx.refunds).toHaveLength(1);

    await closeRefundWithShortfall(op.id);
    const s = await state(ctx);
    expect(s.refunded).toBe(50_000);
    expect(s.count("reversal_shortfall")).toBe(1);
    await expect(closeRefundWithShortfall(op.id)).rejects.toThrow();
  });

  it("books an offline refund atomically", async () => {
    const ctx = await paidBooking();
    await prisma.payment.update({ where: { id: ctx.payment.id }, data: { method: "bank_transfer" } });
    expect((await refund(ctx, 4_000)).status).toBe("completed");
    const s = await state(ctx);
    expect(s.refunded).toBe(4_000);
    expect(await prisma.payment.count({ where: { bookingId: ctx.booking.id, kind: "refund", amountCents: -4_000 } })).toBe(1);
    expect(ctx.calls).toHaveLength(0);
  });
});

describe("payouts", () => {
  it("transfers once when two payout runs overlap", async () => {
    const ctx = await paidBooking();
    await complete(ctx.a, ctx.booking.id, new Date("2027-06-12T22:00:00Z"));
    await Promise.allSettled([payoutBooking(ctx.stripe, ctx.booking.id, afterEvent), payoutBooking(ctx.stripe, ctx.booking.id, afterEvent)]);
    await runFinancialOperations(ctx.stripe, later(5));
    expect(ctx.transfers).toHaveLength(2);
    const s = await state(ctx);
    expect(s.count("platform_fee")).toBe(1);
    expect(s.count("transfer")).toBe(2);
    expect(s.transferredAt).not.toBeNull();
  });

  it("continues an interrupted payout without paying anyone twice", async () => {
    const ctx = await paidBooking();
    await complete(ctx.a, ctx.booking.id, new Date("2027-06-12T22:00:00Z"));
    // First attempt: Stripe errors before anything moves. Second: the artist transfer goes through but the answer is lost.
    ctx.failNext("transfers.create", "before", stripeError("StripeAPIError"));
    expect((await payoutBooking(ctx.stripe, ctx.booking.id, afterEvent)).transferred).toBe(0);
    expect((await state(ctx)).transferredAt).toBeNull();
    ctx.failNext("transfers.create", "after");
    // The payout ran "at" afterEvent; the worker continues it after the backoff.
    const at = (minutes: number) => new Date(afterEvent.getTime() + minutes * 60_000);
    await runFinancialOperations(ctx.stripe, at(5));
    ctx.expireKeys();
    await runFinancialOperations(ctx.stripe, at(60));
    expect(ctx.transfers.map((t) => t.metadata["party"]).sort()).toEqual(["agency", "artist"]);
    const s = await state(ctx);
    expect(s.count("transfer")).toBe(2);
    expect(s.transferredAt).not.toBeNull();
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: ctx.booking.id } })).status).toBe("settled");
  });

  it("keeps refunds and payouts of one payment consistent when they race", async () => {
    const ctx = await paidBooking();
    await complete(ctx.a, ctx.booking.id, new Date("2027-06-12T22:00:00Z"));
    const [r] = await Promise.allSettled([refund(ctx, 50_000), payoutBooking(ctx.stripe, ctx.booking.id, afterEvent)]);
    // Whichever ran second either waited (refund refused as in progress, payout skipped) or saw the first's result.
    await runFinancialOperations(ctx.stripe, later(5));
    await payoutBooking(ctx.stripe, ctx.booking.id, afterEvent);
    const s = await state(ctx);
    const refunded = r.status === "fulfilled" ? 50_000 : 0;
    expect(s.refunded).toBe(refunded);
    // What the artist kept: 40% of what the customer finally paid, to within rounding.
    const artistNet = s.sum("transfer", "artist") + s.sum("transfer_reversal", "artist");
    expect(Math.abs(artistNet - Math.round((150_004 - refunded) * 0.4))).toBeLessThanOrEqual(2);
  });

  it("doesn't pay out money lost to a chargeback", async () => {
    const ctx = await paidBooking();
    await complete(ctx.a, ctx.booking.id, new Date("2027-06-12T22:00:00Z"));
    const base = { organizationId: ctx.a.organizationId, bookingId: ctx.booking.id, paymentId: ctx.payment.id, party: "platform", stripeObjectId: `dp_${run}` };
    await prisma.ledgerEntry.createMany({ data: [{ ...base, type: "dispute", amountCents: -150_004 }, { ...base, type: "dispute_lost", amountCents: 0 }] });
    expect((await payoutBooking(ctx.stripe, ctx.booking.id, afterEvent)).transferred).toBe(0);
    expect(ctx.transfers).toHaveLength(0);
    expect((await state(ctx)).transferredAt).not.toBeNull();
  });
});

describe("webhook processing", () => {
  const disputeEvent = (id: string, chargeId: string, type: "charge.dispute.created" | "charge.dispute.closed", status = "needs_response") => ({
    id,
    type,
    payload: { id, object: "event", type, data: { object: { id: `dp_${id}`, charge: chargeId, payment_intent: null, amount: 150_004, status } } },
  });

  it("runs an event's effects once when two workers take it at the same time", async () => {
    const ctx = await paidBooking();
    const e = disputeEvent(`evt_${run}_c1`, ctx.payment.stripeChargeId!, "charge.dispute.created");
    await prisma.stripeEvent.create({ data: e });
    const results = await Promise.all([processStoredEvent(ctx.stripe, e.id), processStoredEvent(ctx.stripe, e.id), processStoredEvent(ctx.stripe, e.id)]);
    expect(results).toContain("processed");
    expect((await state(ctx)).count("dispute")).toBe(1);
    // A replay (by an admin) changes nothing either.
    expect(await replayStripeEvent(e.id)).toBe(true);
    expect(await processStoredEvent(ctx.stripe, e.id)).toBe("processed");
    expect((await state(ctx)).count("dispute")).toBe(1);
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: ctx.booking.id } })).disputed).toBe(true);
  });

  it("ignores a dispute opening that arrives after its closing", async () => {
    const ctx = await paidBooking();
    const closed = disputeEvent(`evt_${run}_o2`, ctx.payment.stripeChargeId!, "charge.dispute.closed", "won");
    const opened = { ...disputeEvent(`evt_${run}_o1`, ctx.payment.stripeChargeId!, "charge.dispute.created"), payload: { ...closed.payload, id: `evt_${run}_o1`, type: "charge.dispute.created" } };
    await prisma.stripeEvent.createMany({ data: [closed, opened] });
    await processStoredEvent(ctx.stripe, closed.id);
    await processStoredEvent(ctx.stripe, opened.id);
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: ctx.booking.id } })).disputed).toBe(false);
  });

  it("picks up an event whose worker died mid-run, and parks one that keeps failing", async () => {
    const ctx = await paidBooking();
    const abandoned = disputeEvent(`evt_${run}_ab`, ctx.payment.stripeChargeId!, "charge.dispute.created");
    await prisma.stripeEvent.create({ data: { ...abandoned, status: "processing", attempts: 1, lockedUntil: new Date(Date.now() - 1000) } });
    expect(await dueStripeEvents()).toContain(abandoned.id);
    await retryStripeEvents(ctx.stripe);
    expect((await prisma.stripeEvent.findUniqueOrThrow({ where: { id: abandoned.id } })).status).toBe("processed");

    // A payload the handler can't process (no charge) fails until it's parked as dead.
    const broken = { id: `evt_${run}_br`, type: "charge.dispute.created", payload: { id: `evt_${run}_br`, type: "charge.dispute.created", data: { object: {} } } };
    await prisma.stripeEvent.create({ data: { ...broken, attempts: MAX_EVENT_ATTEMPTS - 1, status: "failed" } });
    await expect(processStoredEvent(ctx.stripe, broken.id)).rejects.toThrow();
    const dead = await prisma.stripeEvent.findUniqueOrThrow({ where: { id: broken.id } });
    expect(dead.status).toBe("dead");
    expect(await dueStripeEvents()).not.toContain(broken.id);
  });

  it("backs off between attempts", async () => {
    const ctx = await paidBooking();
    const broken = { id: `evt_${run}_bo`, type: "charge.dispute.created", payload: { id: `evt_${run}_bo`, type: "charge.dispute.created", data: { object: {} } } };
    await prisma.stripeEvent.create({ data: broken });
    await expect(processStoredEvent(ctx.stripe, broken.id)).rejects.toThrow();
    const failed = await prisma.stripeEvent.findUniqueOrThrow({ where: { id: broken.id } });
    expect(failed.status).toBe("failed");
    expect(failed.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now());
    expect(await dueStripeEvents()).not.toContain(broken.id);
    expect(await dueStripeEvents(new Date(failed.nextAttemptAt!.getTime() + 1))).toContain(broken.id);
  });
});
