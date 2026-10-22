import { randomUUID } from "node:crypto";
import type Stripe from "stripe";
import { acceptQuote, assignArtist, changeBookingStatus, createBooking, prisma, respondToAssignment, sendQuote } from "@stagedesk/db";

/** A fake Stripe that records calls and returns just what our code reads. */
export function fakeStripe(opts: { stripeFeeCents?: number } = {}) {
  const calls: { method: string; params: Record<string, unknown>; idempotencyKey?: string }[] = [];
  let n = 0;
  const id = (prefix: string) => `${prefix}_test_${++n}`;
  const record = (method: string, params: Record<string, unknown>, options?: { idempotencyKey?: string }) =>
    calls.push({ method, params, idempotencyKey: options?.idempotencyKey });

  const stripe = {
    paymentIntents: {
      retrieve: async (intentId: string) => ({
        id: intentId,
        amount: 0,
        latest_charge: {
          id: `ch_for_${intentId}`,
          created: Math.floor(Date.now() / 1000),
          payment_method_details: { type: "ideal" },
          balance_transaction: { id: `txn_for_${intentId}`, fee: opts.stripeFeeCents ?? 0 },
        },
      }),
    },
    transfers: {
      create: async (params: Record<string, unknown>, options?: { idempotencyKey?: string }) => {
        record("transfers.create", params, options);
        return { id: id("tr") };
      },
      createReversal: async (transferId: string, params: Record<string, unknown>, options?: { idempotencyKey?: string }) => {
        record("transfers.createReversal", { transferId, ...params }, options);
        return { id: id("trr") };
      },
    },
    refunds: {
      create: async (params: Record<string, unknown>, options?: { idempotencyKey?: string }) => {
        record("refunds.create", params, options);
        return { id: id("re") };
      },
    },
  };
  return { stripe: stripe as unknown as Stripe, calls };
}

export const lines = [{ description: "DJ, per uur", quantityHundredths: 1_000, unitPriceCents: 12_397, vatBps: 2_100 }];

/** An agency with a connected Stripe account, a connected artist and a customer. */
export async function agencyWithAccounts(run: string, opts: { artistConnected: boolean }) {
  const organizationId = `${run}-org`;
  const owner = `${run}-owner`;
  const customer = `${run}-cust`;
  const artistUser = `${run}-artist`;
  const artistId = `${run}-a`;
  await prisma.organization.create({ data: { id: organizationId, name: "Pay Agency", slug: `${run}-pay` } });
  await prisma.user.createMany({
    data: [
      { id: owner, name: "Owner", email: `${run}-o@test.local` },
      { id: customer, name: "Customer", email: `${run}-c@test.local` },
      { id: artistUser, name: "Artist", email: `${run}-ar@test.local` },
    ],
  });
  await prisma.artist.create({ data: { id: artistId, organizationId, userId: artistUser, stageName: "DJ Pay", genres: [], defaultShareBps: 4_000 } });
  await prisma.connectedAccount.createMany({
    data: [
      { id: randomUUID(), organizationId, artistId: null, stripeAccountId: `acct_${run}_agency`, chargesEnabled: true, payoutsEnabled: true },
      ...(opts.artistConnected
        ? [{ id: randomUUID(), organizationId, artistId, stripeAccountId: `acct_${run}_artist`, chargesEnabled: false, payoutsEnabled: true }]
        : []),
    ],
  });
  return { organizationId, owner, customer, artistUser, artistId };
}

/** A confirmed booking whose quote total is exactly €1,500. */
export async function confirmedBooking(a: Awaited<ReturnType<typeof agencyWithAccounts>>, eventDate: string, now: Date) {
  const booking = await createBooking(a.organizationId, { customerId: a.customer, eventType: "wedding", eventDate }, a.owner);
  const quote = await sendQuote(a.organizationId, booking.id, { lines, depositBps: 3_000, expiresInDays: 14 }, a.owner, now);
  await acceptQuote(a.organizationId, quote.id, { actor: "customer", actorId: a.customer, name: "Customer" }, now);
  await assignArtist(a.organizationId, booking.id, a.artistId, a.owner, now);
  const pending = await prisma.bookingAssignment.findFirstOrThrow({ where: { bookingId: booking.id, status: "pending" } });
  await respondToAssignment(pending.id, a.artistUser, { accept: true }, now);
  return { booking, quote };
}

export function paidSession(organizationId: string, bookingId: string, amount: number, kind: "deposit" | "balance"): Stripe.Checkout.Session {
  return {
    id: `cs_${bookingId}_${kind}`,
    object: "checkout.session",
    mode: "payment",
    payment_status: "paid",
    amount_total: amount,
    payment_intent: `pi_${bookingId}_${kind}`,
    metadata: { bookingId, organizationId, kind },
  } as unknown as Stripe.Checkout.Session;
}

export async function complete(a: { organizationId: string; owner: string }, bookingId: string, at: Date) {
  await changeBookingStatus(a.organizationId, bookingId, "complete", { actor: "agency", actorId: a.owner }, at);
}

export async function cleanup(run: string) {
  const orgs = (await prisma.organization.findMany({ where: { slug: { startsWith: run } }, select: { id: true } })).map((o) => o.id);
  await prisma.ledgerEntry.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.payment.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.invoice.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.bookingAssignment.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.booking.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgs } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: run } } });
}
