import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createBooking } from "./bookings";
import { prisma } from "./client";
import {
  attachBookingPromo,
  bookingPromoOf,
  createPlatformPromoCode,
  deleteBookingPromoCode,
  detachBookingPromo,
  findBookingPromo,
  findPlatformPromo,
  PromoCodeError,
  recordPlatformPromoUse,
  saveBookingPromoCode,
} from "./promo-codes";
import { seedPlans } from "./seed-plans";

const run = `promo${Date.now().toString(36)}`;
const org = `${run}-org`;
const other = `${run}-other`;
const customer = `${run}-cust`;
const fails = (code: string) => (e: unknown) => e instanceof PromoCodeError && e.code === code;
const base = { description: null, discountType: "percentage" as const, percentBps: 1_000, amountCents: null, minTotalCents: null, validFrom: null, validUntil: null, maxRedemptions: null, active: true };

beforeAll(async () => {
  await seedPlans(prisma);
  await prisma.organization.createMany({ data: [{ id: org, name: "Promo Agency", slug: `${run}-a` }, { id: other, name: "Other", slug: `${run}-b` }] });
  await prisma.user.create({ data: { id: customer, name: "Customer", email: `${customer}@test.local` } });
});

afterAll(async () => {
  await prisma.booking.deleteMany({ where: { organizationId: { in: [org, other] } } });
  await prisma.organization.deleteMany({ where: { id: { in: [org, other] } } });
  await prisma.platformPromoCode.deleteMany({ where: { code: { startsWith: run.toUpperCase() } } });
  await prisma.user.deleteMany({ where: { id: customer } });
});

const booking = () => createBooking(org, { customerId: customer, eventType: "wedding", eventDate: "2027-09-18" }, null);

describe("agency promo codes", () => {
  it("stores codes in capitals, refuses bad values and a code the agency already has", async () => {
    const saved = await saveBookingPromoCode(org, null, { ...base, code: " wedding10 " });
    expect(saved).toMatchObject({ code: "WEDDING10", percentBps: 1_000, amountCents: null });
    await expect(saveBookingPromoCode(org, null, { ...base, code: "WEDDING10" })).rejects.toSatisfy(fails("code_taken"));
    await expect(saveBookingPromoCode(org, null, { ...base, code: "x!" })).rejects.toSatisfy(fails("invalid"));
    await expect(saveBookingPromoCode(org, null, { ...base, code: "HALF", percentBps: 20_000 })).rejects.toSatisfy(fails("invalid"));
    await expect(saveBookingPromoCode(org, null, { ...base, code: "DATES", validFrom: new Date("2027-02-01"), validUntil: new Date("2027-01-01") })).rejects.toSatisfy(fails("invalid"));
    // Another agency may use the same code: codes are per agency.
    await expect(saveBookingPromoCode(other, null, { ...base, code: "WEDDING10" })).resolves.toMatchObject({ code: "WEDDING10", organizationId: other });
  });

  it("puts a code on a booking, checks limits, and only deletes unused codes", async () => {
    await saveBookingPromoCode(org, null, { ...base, code: "ONCE", discountType: "fixed", percentBps: null, amountCents: 5_000, maxRedemptions: 1 });
    const first = await booking();
    const second = await booking();
    await attachBookingPromo(org, first.id, "once", "customer");
    expect(await bookingPromoOf(org, first.id)).toMatchObject({ code: "ONCE", discount: { type: "fixed", cents: 5_000 }, addedBy: "customer" });
    await expect(attachBookingPromo(org, second.id, "ONCE", "staff")).rejects.toSatisfy(fails("used_up"));
    await expect(attachBookingPromo(org, second.id, "NOPE", "staff")).rejects.toSatisfy(fails("unknown"));
    // Another agency's booking can't be reached with this agency's code.
    await expect(attachBookingPromo(other, first.id, "WEDDING10", "staff")).rejects.toSatisfy(fails("not_found"));

    const once = (await findBookingPromo(org, "ONCE")).promo!;
    await expect(deleteBookingPromoCode(org, once.id)).rejects.toSatisfy(fails("in_use"));
    await detachBookingPromo(org, first.id);
    expect(await bookingPromoOf(org, first.id)).toBeNull();
    await deleteBookingPromoCode(org, once.id);
    expect((await findBookingPromo(org, "ONCE")).problem).toBe("unknown");
  });

  it("explains why a code can't be used", async () => {
    await saveBookingPromoCode(org, null, { ...base, code: "LATER", validFrom: new Date("2099-01-01") });
    await saveBookingPromoCode(org, null, { ...base, code: "OFF", active: false });
    expect((await findBookingPromo(org, "LATER")).problem).toBe("not_started");
    expect((await findBookingPromo(org, "OFF")).problem).toBe("inactive");
    expect((await findBookingPromo(org, "WEDDING10")).problem).toBeNull();
  });
});

describe("platform promo codes", () => {
  const input = { description: "Pilot", discountType: "percentage" as const, percentBps: 5_000, amountCents: null, duration: "repeating" as const, durationMonths: 12, planKeys: ["pro"], firstSubscriptionOnly: true, maxRedemptions: 10, expiresAt: null };

  it("makes a code for chosen plans and refuses duplicates and nonsense", async () => {
    const promo = await createPlatformPromoCode({ ...input, code: `${run}-pilot` }, null);
    expect(promo).toMatchObject({ code: `${run}-PILOT`.toUpperCase(), durationMonths: 12, active: true });
    await expect(createPlatformPromoCode({ ...input, code: `${run}-pilot` }, null)).rejects.toSatisfy(fails("code_taken"));
    await expect(createPlatformPromoCode({ ...input, code: `${run}-x1`, duration: "repeating", durationMonths: null }, null)).rejects.toSatisfy(fails("invalid"));
    await expect(createPlatformPromoCode({ ...input, code: `${run}-x2`, planKeys: ["no-such-plan"] }, null)).rejects.toSatisfy(fails("invalid"));
    await expect(createPlatformPromoCode({ ...input, code: `${run}-x3`, expiresAt: new Date("2020-01-01") }, null)).rejects.toSatisfy(fails("invalid"));
  });

  it("checks the plan and first subscription, and counts each agency once", async () => {
    const plans = await prisma.plan.findMany({ where: { key: { in: ["pro", "starter"] } }, select: { id: true, key: true } });
    const pro = plans.find((p) => p.key === "pro")!.id;
    const starter = plans.find((p) => p.key === "starter")!.id;
    const code = `${run}-pilot`;
    expect((await findPlatformPromo(code, { organizationId: org, planId: pro })).problem).toBeNull();
    expect((await findPlatformPromo(code, { organizationId: org, planId: starter })).problem).toBe("wrong_plan");

    await prisma.subscription.create({ data: { id: randomUUID(), organizationId: other, planId: pro, status: "canceled", stripeSubscriptionId: `sub_${run}` } });
    expect((await findPlatformPromo(code, { organizationId: other, planId: pro })).problem).toBe("first_only");

    const promo = await prisma.platformPromoCode.update({ where: { code: code.toUpperCase() }, data: { stripePromotionCodeId: `promo_${run}` } });
    expect(await recordPlatformPromoUse(`promo_${run}`, org, "sub_1")).toBe(true);
    expect(await recordPlatformPromoUse(`promo_${run}`, org, "sub_2")).toBe(true);
    expect(await recordPlatformPromoUse("promo_unknown", org, "sub_3")).toBe(false);
    expect(await prisma.platformPromoRedemption.count({ where: { promoCodeId: promo.id } })).toBe(1);
  });
});
