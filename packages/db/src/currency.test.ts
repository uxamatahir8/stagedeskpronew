import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { effectiveFeeSnapshot } from "./billing";
import { createBooking } from "./bookings";
import { prisma } from "./client";
import { exchangeRates, saveExchangeRates } from "./rates";

const run = `c${Date.now().toString(36)}`;
const org = `${run}-org`;

beforeAll(async () => {
  await prisma.organization.create({ data: { id: org, name: "Pound Agency", slug: org, currency: "GBP", feeRule: { type: "fixed", percentageBps: 0, fixedCents: 1_000, minCents: null, maxCents: null } } });
});

afterAll(async () => {
  await prisma.bookingEvent.deleteMany({ where: { booking: { organizationId: org } } });
  await prisma.booking.deleteMany({ where: { organizationId: org } });
  await prisma.organization.deleteMany({ where: { id: org } });
});

describe("agency currency", () => {
  it("is copied onto new bookings, and later changes leave them alone", async () => {
    const first = await createBooking(org, { customerId: null, eventType: "wedding", eventDate: "2027-06-12" }, null);
    expect(first.currency).toBe("GBP");
    await prisma.organization.update({ where: { id: org }, data: { currency: "EUR" } });
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: first.id } })).currency).toBe("GBP");
    const second = await createBooking(org, { customerId: null, eventType: "party", eventDate: "2027-07-01" }, null);
    expect(second.currency).toBe("EUR");
    await prisma.organization.update({ where: { id: org }, data: { currency: "GBP" } });
  });

  it("converts a fixed euro fee into the agency's currency", async () => {
    // Puts the real rate back afterwards; the table is shared with the running app.
    const before = await prisma.exchangeRate.findUnique({ where: { currency: "GBP" } });
    await saveExchangeRates("2026-10-23", { GBP: 0.8 });
    try {
      const { rule } = await effectiveFeeSnapshot(org);
      expect(rule.fixedCents).toBe(800);
    } finally {
      if (before) await prisma.exchangeRate.update({ where: { currency: "GBP" }, data: { perEur: before.perEur, rateDate: before.rateDate } });
      else await prisma.exchangeRate.deleteMany({ where: { currency: "GBP" } });
    }
    expect((await exchangeRates()).rates.GBP).toBe(before ? Number(before.perEur) : undefined);
  });
});
