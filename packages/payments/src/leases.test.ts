import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { claimStripeWithdrawal, prisma } from "@stagedesk/db";
import { payWithdrawalByStripe, recoverStripeWithdrawals } from "./affiliates";
import { claimOperation, resetOperation, saveOperationData, LeaseLostError } from "./operations";
import { fakeStripe, stripeError } from "./test/fixtures";
import { processStoredEvent } from "./webhooks";

/**
 * Lease ownership (fencing): affiliate Stripe withdrawals, financial
 * operations and webhook events. A process whose lease ran out and was taken
 * over must not finish or overwrite anything; operators can't start a second
 * runner beside a live one; nothing is paid twice.
 */
const run = `ls${Date.now().toString(36)}`;
const later = (minutes: number) => new Date(Date.now() + minutes * 60_000);
let n = 0;

afterAll(async () => {
  const affiliates = await prisma.affiliate.findMany({ where: { user: { email: { startsWith: run } } }, select: { id: true } });
  await prisma.affiliatePayoutEvent.deleteMany({ where: { payout: { affiliateId: { in: affiliates.map((a) => a.id) } } } });
  await prisma.affiliatePayout.deleteMany({ where: { affiliateId: { in: affiliates.map((a) => a.id) } } });
  await prisma.affiliate.deleteMany({ where: { id: { in: affiliates.map((a) => a.id) } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: run } } });
  await prisma.financialOperation.deleteMany({ where: { organizationId: run } });
  await prisma.stripeEvent.deleteMany({ where: { id: { startsWith: `evt_${run}` } } });
  await prisma.$disconnect();
});

/** An approved Stripe withdrawal of €123.45 to a connected affiliate. */
async function withdrawal() {
  const i = n++;
  const user = await prisma.user.create({ data: { id: `${run}-u${i}`, name: "Partner", email: `${run}-${i}@test.local` } });
  const affiliate = await prisma.affiliate.create({
    data: { id: randomUUID(), userId: user.id, code: `${run}c${i}`, promoCode: `${run}P${i}`.toUpperCase(), status: "approved", stripeAccountId: `acct_${run}_${i}`, payoutsEnabled: true },
  });
  return prisma.affiliatePayout.create({ data: { id: randomUUID(), affiliateId: affiliate.id, amountCents: 12_345, method: "stripe", status: "approved", reference: `WD-${run.slice(-4)}${i}`.toUpperCase() } });
}
const statusOf = async (id: string) => (await prisma.affiliatePayout.findUniqueOrThrow({ where: { id } })).status;

describe("affiliate Stripe withdrawals", () => {
  it("is paid once when two admins (or the monthly run) pay it at the same moment", async () => {
    const { stripe, transfers } = fakeStripe();
    const p = await withdrawal();
    const results = await Promise.allSettled([payWithdrawalByStripe(stripe, p.id, null), payWithdrawalByStripe(stripe, p.id, null)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({ reason: { code: expect.stringMatching(/in_progress|wrong_status/) } });
    expect(transfers).toHaveLength(1);
    expect(await statusOf(p.id)).toBe("paid");
  });

  it("recovers a withdrawal whose process stopped after the claim, without paying twice", async () => {
    const { stripe, transfers } = fakeStripe();
    const p = await withdrawal();
    await claimStripeWithdrawal(p.id); // the process dies here
    expect(await statusOf(p.id)).toBe("processing");
    // Not before the lease ends, and not by a manual retry either.
    await expect(payWithdrawalByStripe(stripe, p.id, null)).rejects.toMatchObject({ code: "in_progress" });
    expect((await recoverStripeWithdrawals(stripe, later(1))).paid).toBe(0);
    expect((await recoverStripeWithdrawals(stripe, later(6))).paid).toBe(1);
    expect(transfers).toHaveLength(1);
    expect(await statusOf(p.id)).toBe("paid");
  });

  it("books a transfer made just before a crash, even after Stripe forgot the key", async () => {
    const fake = fakeStripe();
    const p = await withdrawal();
    // The transfer goes through but the answer never arrives (timeout / crash).
    fake.failNext("transfers.create", "after");
    await expect(payWithdrawalByStripe(fake.stripe, p.id, null)).rejects.toThrow();
    // Outcome unknown: it stays processing (not "failed", so nobody pays it by hand), lease ended.
    expect(await statusOf(p.id)).toBe("processing");
    fake.expireKeys();
    expect((await recoverStripeWithdrawals(fake.stripe, later(1))).paid).toBe(1);
    expect(fake.transfers).toHaveLength(1);
    const paid = await prisma.affiliatePayout.findUniqueOrThrow({ where: { id: p.id } });
    expect(paid).toMatchObject({ status: "paid", stripeTransferId: fake.transfers[0]!.id });
  });

  it("books a transfer whose database write failed afterwards", async () => {
    const fake = fakeStripe();
    const p = await withdrawal();
    const original = prisma.$transaction.bind(prisma);
    let calls = 0;
    const spy = vi.spyOn(prisma, "$transaction").mockImplementation(((...args: Parameters<typeof prisma.$transaction>) => {
      // The first transaction is the booking (completeStripeWithdrawal).
      if (++calls === 1) return Promise.reject(new Error("Connection lost"));
      return original(...args);
    }) as typeof prisma.$transaction);
    try {
      await expect(payWithdrawalByStripe(fake.stripe, p.id, null)).rejects.toThrow("Connection lost");
    } finally {
      spy.mockRestore();
    }
    expect(await statusOf(p.id)).toBe("processing");
    fake.expireKeys();
    await recoverStripeWithdrawals(fake.stripe, later(1));
    expect(fake.transfers).toHaveLength(1);
    expect(await statusOf(p.id)).toBe("paid");
  });

  it("marks a refused transfer failed (retryable) and pays on retry", async () => {
    const fake = fakeStripe();
    const p = await withdrawal();
    fake.failNext("transfers.create", "before", stripeError("StripeInvalidRequestError", "insufficient balance"));
    await expect(payWithdrawalByStripe(fake.stripe, p.id, null)).rejects.toThrow();
    expect(await statusOf(p.id)).toBe("failed");
    await payWithdrawalByStripe(fake.stripe, p.id, null);
    expect(fake.transfers).toHaveLength(1);
    expect(await statusOf(p.id)).toBe("paid");
  });

  it("stays paid when the notification fails afterwards", async () => {
    const fake = fakeStripe();
    const p = await withdrawal();
    const spy = vi.spyOn(prisma.notification, "createMany").mockRejectedValueOnce(new Error("notifications down"));
    try {
      await payWithdrawalByStripe(fake.stripe, p.id, null);
    } finally {
      spy.mockRestore();
    }
    expect(await statusOf(p.id)).toBe("paid");
    expect(fake.transfers).toHaveLength(1);
  });

  it("lets the worker and a manual retry overlap without a second transfer", async () => {
    const fake = fakeStripe();
    const p = await withdrawal();
    await claimStripeWithdrawal(p.id); // stuck
    const at = later(6);
    await Promise.allSettled([recoverStripeWithdrawals(fake.stripe, at), payWithdrawalByStripe(fake.stripe, p.id, null, at)]);
    expect(fake.transfers).toHaveLength(1);
    expect(await statusOf(p.id)).toBe("paid");
  });

  it("refuses to let a process whose lease was taken over book the payment", async () => {
    const fake = fakeStripe();
    const p = await withdrawal();
    const first = await claimStripeWithdrawal(p.id);
    const second = await claimStripeWithdrawal(p.id, later(6)); // took over after the lease ended
    const { completeStripeWithdrawal } = await import("@stagedesk/db");
    expect(await completeStripeWithdrawal(p.id, first.token, "tr_stale", null)).toBe(false);
    expect(await completeStripeWithdrawal(p.id, second.token, "tr_owner", null)).toBe(true);
    expect((await prisma.affiliatePayout.findUniqueOrThrow({ where: { id: p.id } })).stripeTransferId).toBe("tr_owner");
    expect(fake.transfers).toHaveLength(0);
  });
});

describe("financial operation leases", () => {
  async function operation() {
    return prisma.financialOperation.create({
      data: { id: randomUUID(), kind: "refund", key: `refund:${run}:${randomUUID()}`, organizationId: run, amountCents: 100, currency: "EUR", status: "pending", data: {} },
    });
  }

  it("won't let an operator reset an operation a process is running", async () => {
    const op = await operation();
    const claimed = (await claimOperation(op.id))!;
    expect(await resetOperation(op.id)).toBe(false);
    // The live owner still owns it.
    await saveOperationData(claimed, { step: 1 });
    // After the lease ends it may be reset, and the old owner is fenced out.
    expect(await resetOperation(op.id, later(6))).toBe(true);
    const next = (await claimOperation(op.id, later(6)))!;
    await expect(saveOperationData(claimed, { step: "stale" })).rejects.toBeInstanceOf(LeaseLostError);
    await saveOperationData(next, { step: 2 });
    expect((await prisma.financialOperation.findUniqueOrThrow({ where: { id: op.id } })).data).toEqual({ step: 2 });
  });

  it("gives an operation to one of several workers at a time", async () => {
    const op = await operation();
    const claims = await Promise.all([claimOperation(op.id), claimOperation(op.id), claimOperation(op.id)]);
    expect(claims.filter(Boolean)).toHaveLength(1);
  });
});

describe("webhook leases", () => {
  it("doesn't let a handler that outlived its lease overwrite the new owner's outcome", async () => {
    const id = `evt_${run}_slow`;
    // invoice.payment_failed fetches the subscription from Stripe: worker A's call is held open.
    const payload = { id, type: "invoice.payment_failed", data: { object: { parent: { subscription_details: { subscription: "sub_slow" } } } } };
    await prisma.stripeEvent.create({ data: { id, type: payload.type, payload } });
    let releaseA!: () => void;
    const held = new Promise<void>((r) => (releaseA = r));
    let reachedA!: () => void;
    const reached = new Promise<void>((r) => (reachedA = r));
    const stripeA = { subscriptions: { retrieve: async () => (reachedA(), await held, Promise.reject(new Error("A: timed out"))) } } as never;
    const stripeB = { subscriptions: { retrieve: async () => Promise.reject(new Error("B: Stripe unavailable")) } } as never;

    // A claimed it "ten minutes ago", so its lease has already run out while it's still working.
    const a = processStoredEvent(stripeA, id, new Date(Date.now() - 10 * 60_000)).catch((e: Error) => e.message);
    await reached;
    // B takes it over and records its own outcome.
    await expect(processStoredEvent(stripeB, id)).rejects.toThrow("B: Stripe unavailable");
    const afterB = await prisma.stripeEvent.findUniqueOrThrow({ where: { id } });
    expect(afterB).toMatchObject({ status: "failed", attempts: 2 });
    // A finally fails: its write must not replace B's.
    releaseA();
    expect(await a).toMatch("A: timed out");
    const final = await prisma.stripeEvent.findUniqueOrThrow({ where: { id } });
    expect(final.error).toMatch("B: Stripe unavailable");
    expect(final.nextAttemptAt?.getTime()).toBe(afterB.nextAttemptAt?.getTime());
  });

  it("records a stale owner's outcome as superseded", async () => {
    const { stripe } = fakeStripe();
    const id = `evt_${run}_fenced`;
    await prisma.stripeEvent.create({ data: { id, type: "customer.created", payload: { id, type: "customer.created", data: { object: {} } } } });
    // Simulate: worker A claimed it (token A), its lease ended and worker B claimed it (token B).
    await prisma.stripeEvent.update({ where: { id }, data: { status: "processing", lockToken: "token-b", lockedUntil: later(5) } });
    // A late write from A can't match token B; B's claim stands.
    const late = await prisma.stripeEvent.updateMany({ where: { id, status: "processing", lockToken: "token-a" }, data: { status: "processed" } });
    expect(late.count).toBe(0);
    expect(await processStoredEvent(stripe, id)).toBe("processing");
  });
});
