import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { artistBalanceOnBooking, BookingError, createBooking, issueInvoice, markArtistPaid, prisma, recordPayment, sendQuote } from "@stagedesk/db";
import { refundPayment } from "./refunds";
import { agencyWithAccounts, cleanup, complete, confirmedBooking, fakeStripe } from "./test/fixtures";

const run = `qa${Date.now().toString(36)}`;
const may = new Date("2027-05-01T10:00:00Z");
const eventDay = new Date("2027-06-12T22:00:00Z");
const TOTAL = 150_004; // 10 × €123.97 + 21% VAT, see the fixtures

describe("money rules found in QA", () => {
  let a: Awaited<ReturnType<typeof agencyWithAccounts>>;
  const pay = (bookingId: string, amountCents: number, allowOverpayment = false) =>
    recordPayment(a.organizationId, bookingId, { amountCents, kind: "balance", method: "bank_transfer", receivedAt: may }, a.owner, { allowOverpayment });

  beforeAll(async () => {
    a = await agencyWithAccounts(run, { artistConnected: false });
  });

  afterAll(async () => {
    await cleanup(run);
    await prisma.$disconnect();
  });

  it("refuses a quote with a total below zero, and allows a discount line", async () => {
    const booking = await createBooking(a.organizationId, { customerId: a.customer, eventType: "wedding", eventDate: "2027-06-13" }, a.owner);
    const send = (lines: { description: string; quantityHundredths: number; unitPriceCents: number; vatBps: number }[]) =>
      sendQuote(a.organizationId, booking.id, { lines, depositBps: 0, expiresInDays: 14 }, a.owner, may);
    await expect(send([{ description: "Discount", quantityHundredths: 100, unitPriceCents: -500, vatBps: 2_100 }])).rejects.toThrow("negative_total");
    await expect(send([{ description: "Huge", quantityHundredths: 100, unitPriceCents: 99_999_999_999, vatBps: 2_100 }])).rejects.toThrow("amount_too_high");
    const quote = await send([
      { description: "DJ", quantityHundredths: 100, unitPriceCents: 10_000, vatBps: 2_100 },
      { description: "Discount", quantityHundredths: 100, unitPriceCents: -2_500, vatBps: 2_100 },
    ]);
    expect(quote.totalCents).toBe(9_075);
  });

  it("refuses a payment above what's due until it's confirmed", async () => {
    const { booking } = await confirmedBooking(a, "2027-06-14", may);
    await pay(booking.id, 45_000);
    await expect(pay(booking.id, 200_000)).rejects.toSatisfy((e) => e instanceof BookingError && e.code === "overpayment");
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).paidCents).toBe(45_000);
    await pay(booking.id, 200_000, true);
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).paidCents).toBe(245_000);
  });

  it("writes one credit note for a refund on an invoiced booking, with the VAT taken out", async () => {
    const { stripe } = fakeStripe();
    const { booking } = await confirmedBooking(a, "2027-06-15", may);
    const payment = await pay(booking.id, 60_500);
    // Refunded before there's an invoice: nothing to correct yet.
    await refundPayment(stripe, { organizationId: a.organizationId, paymentId: payment.id, amountCents: 500, actorId: a.owner });
    expect(await prisma.creditNote.count({ where: { bookingId: booking.id } })).toBe(0);

    const invoice = await issueInvoice(a.organizationId, booking.id, a.owner, may);
    const request = { organizationId: a.organizationId, paymentId: payment.id, amountCents: 12_100, actorId: a.owner, requestId: `${run}-refund` };
    await refundPayment(stripe, request);
    await refundPayment(stripe, request); // a double click refunds once, and credits once

    const notes = await prisma.creditNote.findMany({ where: { bookingId: booking.id } });
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ invoiceId: invoice.id, totalCents: 12_100, subtotalCents: 10_000, vatCents: 2_100 });
    expect(notes[0]!.number).toMatch(/^CN-\d{4}-\d{4}$/);
  });

  it("needs no credit note for returning an overpayment", async () => {
    const { stripe } = fakeStripe();
    const { booking } = await confirmedBooking(a, "2027-06-16", may);
    const payment = await pay(booking.id, TOTAL + 1_000, true);
    await issueInvoice(a.organizationId, booking.id, a.owner, may);
    await refundPayment(stripe, { organizationId: a.organizationId, paymentId: payment.id, amountCents: 1_000, actorId: a.owner });
    expect(await prisma.creditNote.count({ where: { bookingId: booking.id } })).toBe(0);
    await refundPayment(stripe, { organizationId: a.organizationId, paymentId: payment.id, amountCents: 2_000, actorId: a.owner });
    expect((await prisma.creditNote.findFirstOrThrow({ where: { bookingId: booking.id } })).totalCents).toBe(2_000);
  });

  it("shows what the agency owes the artist for offline payments, once the event is done", async () => {
    const { booking } = await confirmedBooking(a, "2027-06-12", may);
    await pay(booking.id, TOTAL);
    // The fixtures' artist has a 40% share; not due before the event.
    expect(await artistBalanceOnBooking(a.organizationId, booking.id)).toMatchObject({ offlineShareCents: 60_002, dueCents: 0 });
    await expect(markArtistPaid(a.organizationId, booking.id, a.owner)).rejects.toThrow("nothing_due");

    await complete(a, booking.id, eventDay);
    expect(await artistBalanceOnBooking(a.organizationId, booking.id)).toMatchObject({ dueCents: 60_002, paidByAgencyCents: 0 });

    await markArtistPaid(a.organizationId, booking.id, a.owner);
    expect(await artistBalanceOnBooking(a.organizationId, booking.id)).toMatchObject({ dueCents: 0, paidByAgencyCents: 60_002 });
    await expect(markArtistPaid(a.organizationId, booking.id, a.owner)).rejects.toThrow("nothing_due");
  });
});
