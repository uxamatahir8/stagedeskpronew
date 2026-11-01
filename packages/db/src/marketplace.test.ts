import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "./client";
import { assignLead, offerLead, submitLead, type LeadInput } from "./leads";
import { acceptLeadOffer, quoteLeadOffer, resumeLeadAcceptances } from "./marketplace";

/**
 * The customer choosing between providers' prices: only one provider wins,
 * the others are told they lost, a second click changes nothing, and an
 * acceptance cut off half-way is finished by the worker.
 */
const run = `mk${Date.now().toString(36)}`;
const orgs: string[] = [];
const may = new Date("2027-05-01T10:00:00Z");
const lines = [{ description: "DJ", quantityHundredths: 100, unitPriceCents: 90_000, vatBps: 2_100 }];

afterAll(async () => {
  await prisma.lead.deleteMany({ where: { email: { startsWith: run } } });
  await prisma.bookingEvent.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.booking.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgs } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: run } } });
  await prisma.$disconnect();
});

let orgCount = 0;
async function provider() {
  const id = `${run}-org${orgCount++}`;
  orgs.push(id);
  await prisma.organization.create({ data: { id, name: id, slug: id } });
  const owner = await prisma.user.create({ data: { id: `${id}-owner`, name: "Owner", email: `${id}-owner@test.local` } });
  await prisma.member.create({ data: { id: randomUUID(), organizationId: id, userId: owner.id, role: "agency_owner" } });
  return { id, ownerId: owner.id, ownerEmail: owner.email };
}

let n = 0;
async function leadWithPrices(count: number, email = `${run}-c${n++}@test.local`) {
  const input: LeadInput = {
    name: "Customer",
    email,
    phone: null,
    locale: "nl",
    eventType: "wedding",
    eventDate: "2027-06-12",
    startTime: null,
    venueName: null,
    venueCity: "Utrecht",
    guestCount: 100,
    budgetRange: null,
    preferredGenre: null,
    partnerName: null,
    ceremony: null,
    message: null,
  };
  const lead = await submitLead(input);
  const providers = await Promise.all(Array.from({ length: count }, provider));
  await offerLead(lead.id, providers.map((p) => p.id));
  const offers = [];
  for (const p of providers) offers.push(await quoteLeadOffer(lead.id, p.id, { lines, depositBps: 3_000, validDays: 14, message: null }, p.ownerId, may));
  return { lead: await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } }), providers, offers };
}

const bookingsIn = (providers: { id: string }[]) => prisma.booking.count({ where: { source: "lead", organizationId: { in: providers.map((p) => p.id) } } });

describe("marketplace acceptance", () => {
  it("gives the lead to exactly one provider when the customer accepts two prices at once", async () => {
    const { lead, offers, providers } = await leadWithPrices(3);
    const results = await Promise.allSettled(offers.slice(0, 2).map((o) => acceptLeadOffer(lead.reference, lead.accessToken!, o.id, may)));
    const won = results.filter((r) => r.status === "fulfilled");
    expect(won).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({ reason: { code: "closed" } });

    const fresh = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id }, include: { offers: true } });
    expect(fresh.status).toBe("assigned");
    expect(await bookingsIn(providers)).toBe(1);
    const accepted = fresh.offers.filter((o) => o.status === "accepted");
    expect(accepted).toHaveLength(1);
    expect(accepted[0]!.agencyId).toBe(fresh.assignedAgencyId);
    // Everyone else is told they lost (not "withdrawn", which reads as the platform's doing).
    expect(fresh.offers.filter((o) => o.status === "lost")).toHaveLength(2);
    const result = (won[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof acceptLeadOffer>>>).value;
    expect(result.lostTo).toHaveLength(2);
    expect(result.booking.status).toBe("booked");
    expect(result.booking.totalCents).toBe(108_900);
  });

  it("treats a second click on the same price as the same acceptance", async () => {
    const { lead, offers, providers } = await leadWithPrices(2);
    const first = await acceptLeadOffer(lead.reference, lead.accessToken!, offers[0]!.id, may);
    const again = await acceptLeadOffer(lead.reference, lead.accessToken!, offers[0]!.id, may);
    expect(again.repeated).toBe(true);
    expect(again.booking.id).toBe(first.booking.id);
    expect(await bookingsIn(providers)).toBe(1);
    // Choosing another price afterwards is refused.
    await expect(acceptLeadOffer(lead.reference, lead.accessToken!, offers[1]!.id, may)).rejects.toMatchObject({ code: "closed" });
  });

  it("finishes an acceptance that stopped after the booking was made", async () => {
    const { lead, offers, providers } = await leadWithPrices(2);
    // The process stopped right after the assignment committed: booking still an inquiry.
    await assignLead(lead.id, providers[0]!.id, null, { chosenOfferId: offers[0]!.id });
    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: (await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).bookingId! } });
    expect(booking.status).toBe("inquiry");

    await resumeLeadAcceptances(new Date(Date.now() + 5 * 60_000));
    const done = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(done.status).toBe("booked");
    expect(await prisma.quote.count({ where: { bookingId: booking.id, status: "accepted" } })).toBe(1);
    // Running it again changes nothing.
    await resumeLeadAcceptances(new Date(Date.now() + 10 * 60_000));
    expect(await prisma.quote.count({ where: { bookingId: booking.id } })).toBe(1);
  });

  it("leaves the lead open and nothing behind when the assignment fails half-way", async () => {
    // The customer's address belongs to someone on the provider's team: no booking may be made.
    const { lead, offers, providers } = await leadWithPrices(2);
    await prisma.lead.update({ where: { id: lead.id }, data: { email: providers[0]!.ownerEmail } });
    await expect(acceptLeadOffer(lead.reference, lead.accessToken!, offers[0]!.id, may)).rejects.toMatchObject({ code: "closed" });

    const fresh = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id }, include: { offers: true } });
    expect(fresh.status).toBe("offered");
    expect(fresh.assignedAgencyId).toBeNull();
    expect(fresh.bookingId).toBeNull();
    expect(fresh.offers.every((o) => o.status === "quoted")).toBe(true);
    expect(await prisma.booking.count({ where: { organizationId: providers[0]!.id } })).toBe(0);
    // The customer can still choose the other provider.
    expect((await acceptLeadOffer(lead.reference, lead.accessToken!, offers[1]!.id, may)).booking.status).toBe("booked");
  });
});
