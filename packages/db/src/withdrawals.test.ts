import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "./client";
import { affiliateBalance, approveWithdrawal, cancelWithdrawal, markWithdrawalPaid, rejectWithdrawal, requestWithdrawal, savePayoutDetails, WithdrawalError } from "./withdrawals";

const run = `w${Date.now().toString(36)}`;
const userId = `${run}-user`;
const adminId = `${run}-admin`;
const affiliateId = `${run}-aff`;
const agencyId = `${run}-agency`;
const referralId = `${run}-ref`;

async function commission(amountCents: number, status = "approved") {
  return prisma.commission.create({
    data: { id: randomUUID(), affiliateId, referralId, agencyId, stripeInvoiceId: `in_${randomUUID()}`, baseCents: amountCents * 4, commissionBps: 2_500, amountCents, status, availableAt: new Date() },
  });
}

beforeAll(async () => {
  await prisma.user.createMany({ data: [{ id: userId, name: "Partner", email: `${run}@test.local` }, { id: adminId, name: "Admin", email: `${run}-a@test.local` }] });
  await prisma.organization.create({ data: { id: agencyId, name: "Referred", slug: agencyId } });
  await prisma.affiliate.create({ data: { id: affiliateId, userId, status: "approved", code: run.slice(0, 20), promoCode: run.slice(0, 20).toUpperCase() } });
  await prisma.referral.create({ data: { id: referralId, agencyId, type: "affiliate", affiliateId, source: "cookie", commissionBps: 2_500 } });
});

afterAll(async () => {
  await prisma.commission.deleteMany({ where: { affiliateId } });
  await prisma.affiliatePayout.deleteMany({ where: { affiliateId } });
  await prisma.referral.deleteMany({ where: { id: referralId } });
  await prisma.affiliate.deleteMany({ where: { id: affiliateId } });
  await prisma.organization.deleteMany({ where: { id: agencyId } });
  await prisma.user.deleteMany({ where: { id: { in: [userId, adminId] } } });
});

describe("affiliate withdrawals", () => {
  it("needs payout details and an amount above the minimum", async () => {
    await expect(requestWithdrawal(affiliateId, userId)).rejects.toThrow(WithdrawalError);
    await expect(savePayoutDetails(affiliateId, { method: "bank_transfer", iban: "NL00BANK0000000000", accountName: "P" })).rejects.toThrow(WithdrawalError);
    await savePayoutDetails(affiliateId, { method: "bank_transfer", iban: "NL91 ABNA 0417 1643 00", accountName: "Pim Partner" });
    await commission(1_000);
    await expect(requestWithdrawal(affiliateId, userId)).rejects.toMatchObject({ code: "below_minimum" });
  });

  it("takes every approved commission, and only once", async () => {
    await commission(6_000);
    await commission(2_000, "pending");
    const payout = await requestWithdrawal(affiliateId, userId);
    expect(payout.amountCents).toBe(7_000);
    expect(payout.reference).toMatch(/^WD-[2-9A-Z]{6}$/);
    expect(payout.details).toMatchObject({ iban: "NL91ABNA0417164300", accountName: "Pim Partner" });
    await expect(requestWithdrawal(affiliateId, userId)).rejects.toMatchObject({ code: "open_request" });
    expect(await affiliateBalance(affiliateId)).toMatchObject({ availableCents: 0, requestedCents: 7_000, waitingCents: 2_000 });
  });

  it("gives the money back when cancelled or rejected", async () => {
    const open = (await affiliateBalance(affiliateId)).openRequest!;
    await cancelWithdrawal(affiliateId, open.id, userId);
    expect((await affiliateBalance(affiliateId)).availableCents).toBe(7_000);
    const again = await requestWithdrawal(affiliateId, userId);
    await rejectWithdrawal(again.id, adminId, "IBAN is not in the partner's name");
    expect((await affiliateBalance(affiliateId)).availableCents).toBe(7_000);
    const events = await prisma.affiliatePayoutEvent.findMany({ where: { payoutId: again.id }, orderBy: { createdAt: "asc" } });
    expect(events.map((e) => e.status)).toEqual(["requested", "rejected"]);
  });

  it("is paid after approval, with the bank reference kept", async () => {
    const payout = await requestWithdrawal(affiliateId, userId);
    await expect(markWithdrawalPaid(payout.id, adminId, { transactionRef: "x" })).rejects.toMatchObject({ code: "wrong_status" });
    await approveWithdrawal(payout.id, adminId);
    await markWithdrawalPaid(payout.id, adminId, { transactionRef: "NOTPROVIDED-123" });
    const paid = await prisma.affiliatePayout.findUniqueOrThrow({ where: { id: payout.id }, include: { commissions: true, events: true } });
    expect(paid.status).toBe("paid");
    expect(paid.transactionRef).toBe("NOTPROVIDED-123");
    expect(paid.commissions.every((c) => c.status === "paid")).toBe(true);
    expect(paid.events.map((e) => e.status).sort()).toEqual(["approved", "paid", "requested"]);
    expect(await affiliateBalance(affiliateId)).toMatchObject({ availableCents: 0, requestedCents: 0 });
  });
});
