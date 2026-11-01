import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "./client";
import { confirmPaymentClaim, reconcileUnlinkedClaim, submitPaymentClaim, unlinkedConfirmedClaims } from "./payment-claims";

/** A confirmed claim always ends up with exactly one payment: failures roll back, races record once, legacy gaps are linked. */
const run = `pcr${Date.now().toString(36)}`;
const org = `${run}-org`;
const customer = `${run}-cust`;
const staff = `${run}-staff`;
let n = 0;

beforeAll(async () => {
  await prisma.user.createMany({ data: [{ id: customer, name: "Sanne", email: `${run}-c@test.local` }, { id: staff, name: "Mark", email: `${run}-s@test.local` }] });
  await prisma.organization.create({ data: { id: org, name: "Claims Recovery", slug: org } });
});

afterAll(async () => {
  await prisma.paymentClaim.deleteMany({ where: { organizationId: org } });
  await prisma.payment.deleteMany({ where: { organizationId: org } });
  await prisma.bookingEvent.deleteMany({ where: { organizationId: org } });
  await prisma.booking.deleteMany({ where: { organizationId: org } });
  await prisma.organization.deleteMany({ where: { id: org } });
  await prisma.user.deleteMany({ where: { id: { in: [customer, staff] } } });
  await prisma.$disconnect();
});

async function booking() {
  const id = `${run}-b${n++}`;
  await prisma.booking.create({
    data: { id, organizationId: org, trackingCode: randomUUID().slice(0, 8).toUpperCase(), customerId: customer, eventType: "wedding", status: "booked", totalCents: 100_000, depositCents: 30_000 },
  });
  return id;
}
const transfer = (amountCents: number) => ({ method: "bank_transfer" as const, amountCents, paidOn: "2026-10-20", reference: "aanbetaling", note: null });
const state = async (bookingId: string, claimId: string) => ({
  claim: await prisma.paymentClaim.findUniqueOrThrow({ where: { id: claimId } }),
  payments: await prisma.payment.count({ where: { bookingId } }),
  paid: (await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } })).paidCents,
});

describe("payment claim confirmation", () => {
  it("rolls back completely when linking fails after the payment was written", async () => {
    const b = await booking();
    const claim = await submitPaymentClaim(org, b, customer, transfer(30_000));
    await expect(
      confirmPaymentClaim(org, claim.id, staff, undefined, {
        afterPayment: async () => {
          throw new Error("Connection lost");
        },
      }),
    ).rejects.toThrow("Connection lost");
    // Nothing happened: still pending, no payment, nothing paid.
    expect(await state(b, claim.id)).toMatchObject({ claim: { status: "pending", paymentId: null }, payments: 0, paid: 0 });
    // Confirming again records it once.
    await confirmPaymentClaim(org, claim.id, staff);
    const after = await state(b, claim.id);
    expect(after).toMatchObject({ claim: { status: "confirmed" }, payments: 1, paid: 30_000 });
    expect(after.claim.paymentId).not.toBeNull();
  });

  it("records one payment when two colleagues confirm at the same moment", async () => {
    const b = await booking();
    const claim = await submitPaymentClaim(org, b, customer, transfer(30_000));
    const results = await Promise.allSettled([confirmPaymentClaim(org, claim.id, staff), confirmPaymentClaim(org, claim.id, staff), confirmPaymentClaim(org, claim.id, staff)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await state(b, claim.id)).toMatchObject({ payments: 1, paid: 30_000 });
  });

  it("links a confirmed claim left without its payment (before this fix), only when it's certain", async () => {
    const b = await booking();
    // What a failed link step used to leave: the payment recorded, the claim confirmed but unlinked.
    const claim = await submitPaymentClaim(org, b, customer, transfer(25_000));
    await prisma.paymentClaim.update({ where: { id: claim.id }, data: { status: "confirmed", reviewedAt: new Date(), reviewedById: staff } });
    const payment = await prisma.payment.create({ data: { id: randomUUID(), organizationId: org, bookingId: b, kind: "deposit", method: "bank_transfer", amountCents: 25_000, receivedAt: new Date() } });
    expect((await unlinkedConfirmedClaims()).map((c) => c.id)).toContain(claim.id);
    expect(await reconcileUnlinkedClaim(claim.id)).toBe("linked");
    expect((await prisma.paymentClaim.findUniqueOrThrow({ where: { id: claim.id } })).paymentId).toBe(payment.id);
    expect(await reconcileUnlinkedClaim(claim.id)).toBe("linked");

    // Two equal payments: not certain which one, so a person decides.
    const b2 = await booking();
    const other = await submitPaymentClaim(org, b2, customer, transfer(10_000));
    await prisma.paymentClaim.update({ where: { id: other.id }, data: { status: "confirmed", reviewedAt: new Date(), reviewedById: staff } });
    for (let i = 0; i < 2; i++) {
      await prisma.payment.create({ data: { id: randomUUID(), organizationId: org, bookingId: b2, kind: "deposit", method: "bank_transfer", amountCents: 10_000, receivedAt: new Date() } });
    }
    expect(await reconcileUnlinkedClaim(other.id)).toBe("ambiguous");
    expect((await prisma.paymentClaim.findUniqueOrThrow({ where: { id: other.id } })).paymentId).toBeNull();
  });
});
