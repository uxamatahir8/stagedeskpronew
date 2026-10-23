import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "./client";
import { confirmPaymentClaim, outstandingCents, PaymentClaimError, pendingPaymentClaims, rejectPaymentClaim, submitPaymentClaim } from "./payment-claims";

const run = `pc${Date.now().toString(36)}`;
const org = `${run}-org`;
const customer = `${run}-cust`;
const staff = `${run}-staff`;
const booking = `${run}-booking`;

beforeAll(async () => {
  await prisma.user.createMany({
    data: [
      { id: customer, name: "Sanne", email: `${run}-c@test.local` },
      { id: staff, name: "Mark", email: `${run}-s@test.local` },
    ],
  });
  await prisma.organization.create({ data: { id: org, name: "Claims Agency", slug: org } });
  await prisma.booking.create({
    data: { id: booking, organizationId: org, trackingCode: randomUUID().slice(0, 8).toUpperCase(), customerId: customer, eventType: "wedding", status: "booked", totalCents: 100_000, depositCents: 30_000 },
  });
});

afterAll(async () => {
  await prisma.paymentClaim.deleteMany({ where: { organizationId: org } });
  await prisma.ledgerEntry.deleteMany({ where: { organizationId: org } });
  await prisma.payment.deleteMany({ where: { organizationId: org } });
  await prisma.bookingEvent.deleteMany({ where: { bookingId: booking } });
  await prisma.booking.deleteMany({ where: { id: booking } });
  await prisma.organization.deleteMany({ where: { id: org } });
  await prisma.user.deleteMany({ where: { id: { in: [customer, staff] } } });
});

const transfer = (amountCents: number) => ({ method: "bank_transfer" as const, amountCents, paidOn: "2026-10-20", reference: "K7Q2 aanbetaling", note: null });

describe("payment claims", () => {
  it("records a confirmed claim as a payment, once", async () => {
    const claim = await submitPaymentClaim(org, booking, customer, transfer(30_000));
    expect(claim).toMatchObject({ kind: "deposit", status: "pending" });
    // While it waits, the open amount already counts it, and a second claim waits for the first.
    expect(await outstandingCents(org, booking)).toBe(70_000);
    await expect(submitPaymentClaim(org, booking, customer, transfer(10_000))).rejects.toMatchObject({ code: "open_claim" });
    expect((await pendingPaymentClaims(org)).map((c) => c.id)).toEqual([claim.id]);

    const { payment } = await confirmPaymentClaim(org, claim.id, staff);
    expect(payment).toMatchObject({ amountCents: 30_000, method: "bank_transfer", kind: "deposit" });
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: booking } })).paidCents).toBe(30_000);
    expect(await prisma.paymentClaim.findUniqueOrThrow({ where: { id: claim.id } })).toMatchObject({ status: "confirmed", paymentId: payment.id, reviewedById: staff });
    // A double click doesn't pay twice.
    await expect(confirmPaymentClaim(org, claim.id, staff)).rejects.toMatchObject({ code: "already_reviewed" });
    expect(await prisma.payment.count({ where: { bookingId: booking } })).toBe(1);
  });

  it("rejects a claim with a reason and refuses more than is open", async () => {
    await expect(submitPaymentClaim(org, booking, customer, transfer(70_001))).rejects.toMatchObject({ code: "too_much" });
    const claim = await submitPaymentClaim(org, booking, customer, { ...transfer(70_000), method: "cash" });
    expect(claim.kind).toBe("balance");
    const rejected = await rejectPaymentClaim(org, claim.id, staff, "Not on our account yet");
    expect(rejected).toMatchObject({ status: "rejected", rejectReason: "Not on our account yet" });
    expect(await outstandingCents(org, booking)).toBe(70_000);
  });

  it("only lets the booking's own customer report a payment", async () => {
    await expect(submitPaymentClaim(org, booking, staff, transfer(1_000))).rejects.toBeInstanceOf(PaymentClaimError);
  });
});
