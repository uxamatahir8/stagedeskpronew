import { randomUUID } from "node:crypto";
import type Stripe from "stripe";
import { acceptQuote, assignArtist, changeBookingStatus, createBooking, prisma, respondToAssignment, sendQuote } from "@stagedesk/db";

type Failure = { mode: "before" | "after"; error: Error & { type?: string } };

/** A Stripe error as the SDK throws it. Definitive types mean Stripe refused; connection errors leave the outcome unknown. */
export function stripeError(type: "StripeConnectionError" | "StripeAPIError" | "StripeInvalidRequestError", message: string = type) {
  return Object.assign(new Error(message), { type });
}

/**
 * A fake Stripe that records calls and returns just what our code reads. Like
 * Stripe, a repeated idempotency key returns the first result without doing
 * anything again. `failNext(method, mode)` makes the next call fail: "before"
 * it happens, or "after" (it happened, but the response was lost).
 */
export function fakeStripe(opts: { stripeFeeCents?: number } = {}) {
  const calls: { method: string; params: Record<string, unknown>; idempotencyKey?: string }[] = [];
  let n = 0;
  // Unique per fake, so ids stored by an earlier (interrupted) run never collide with this one.
  const run = Math.random().toString(36).slice(2, 8);
  const id = (prefix: string) => `${prefix}_test_${run}_${++n}`;
  const byKey = new Map<string, unknown>();
  const failures = new Map<string, Failure[]>();
  const refunds: { id: string; payment_intent: string; amount: number; metadata: Record<string, string> }[] = [];
  const transfers: { id: string; transfer_group?: string; destination: string; amount: number; metadata: Record<string, string> }[] = [];
  const reversals: { id: string; transfer: string; amount: number; metadata: Record<string, string> }[] = [];
  const coupons = new Set<string>();
  const promos: { id: string; code: string; active: boolean; metadata: Record<string, string> }[] = [];

  /** Runs a creating call with idempotency and injected failures. */
  function create<T>(method: string, params: Record<string, unknown>, options: { idempotencyKey?: string } | undefined, make: () => T): T {
    const key = options?.idempotencyKey;
    if (key && byKey.has(`${method}:${key}`)) return byKey.get(`${method}:${key}`) as T;
    const failure = failures.get(method)?.shift();
    if (failure?.mode === "before") throw failure.error;
    calls.push({ method, params, idempotencyKey: key });
    const result = make();
    if (key) byKey.set(`${method}:${key}`, result);
    if (failure?.mode === "after") throw failure.error;
    return result;
  }
  /** Like the SDK's list result: awaitable for one page, async-iterable for all of them. */
  const page = <T,>(data: T[]) => Object.assign(Promise.resolve({ data }), { [Symbol.asyncIterator]: async function* () { yield* data; } });
  const metadata = (params: Record<string, unknown>) => (params["metadata"] ?? {}) as Record<string, string>;

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
    charges: {
      retrieve: async (chargeId: string) => {
        const intent = chargeId.replace(/^ch_for_/, "");
        return { id: chargeId, amount_refunded: refunds.filter((r) => r.payment_intent === intent).reduce((s, r) => s + r.amount, 0) };
      },
    },
    transfers: {
      create: async (params: Record<string, unknown>, options?: { idempotencyKey?: string }) =>
        create("transfers.create", params, options, () => {
          const t = { id: id("tr"), transfer_group: params["transfer_group"] as string, destination: params["destination"] as string, amount: params["amount"] as number, metadata: metadata(params) };
          transfers.push(t);
          return t;
        }),
      list: (params: { transfer_group?: string; destination?: string }) =>
        page(transfers.filter((t) => (!params.transfer_group || t.transfer_group === params.transfer_group) && (!params.destination || t.destination === params.destination))),
      createReversal: async (transferId: string, params: Record<string, unknown>, options?: { idempotencyKey?: string }) =>
        create("transfers.createReversal", { transferId, ...params }, options, () => {
          const r = { id: id("trr"), transfer: transferId, amount: params["amount"] as number, metadata: metadata(params) };
          reversals.push(r);
          return r;
        }),
      listReversals: (transferId: string) => page(reversals.filter((r) => r.transfer === transferId)),
    },
    refunds: {
      create: async (params: Record<string, unknown>, options?: { idempotencyKey?: string }) =>
        create("refunds.create", params, options, () => {
          const r = { id: id("re"), payment_intent: params["payment_intent"] as string, amount: params["amount"] as number, metadata: metadata(params) };
          refunds.push(r);
          return r;
        }),
      list: (params: { payment_intent: string }) => page(refunds.filter((r) => r.payment_intent === params.payment_intent)),
    },
    invoices: {
      retrieve: async (invoiceId: string) => ({
        id: invoiceId,
        payments: { data: [{ payment: { type: "payment_intent", payment_intent: `pi_for_${invoiceId}` } }] },
      }),
    },
    coupons: {
      retrieve: async (couponId: string) => {
        if (!coupons.has(couponId)) throw stripeError("StripeInvalidRequestError", "No such coupon");
        return { id: couponId };
      },
      create: async (params: Record<string, unknown>, options?: { idempotencyKey?: string }) =>
        create("coupons.create", params, options, () => (coupons.add(params["id"] as string), { id: params["id"] })),
    },
    promotionCodes: {
      create: async (params: Record<string, unknown>, options?: { idempotencyKey?: string }) =>
        create("promotionCodes.create", params, options, () => {
          const code = params["code"] as string;
          // Like Stripe: a code must be unique among active codes.
          if (promos.some((p) => p.active && p.code.toUpperCase() === code.toUpperCase())) throw stripeError("StripeInvalidRequestError", "code already exists");
          const p = { id: id("promo"), code, active: true, metadata: metadata(params) };
          promos.push(p);
          return p;
        }),
      retrieve: async (promoId: string) => {
        const p = promos.find((x) => x.id === promoId);
        if (!p) throw stripeError("StripeInvalidRequestError", "No such promotion code");
        return { ...p };
      },
      update: async (promoId: string, params: { active?: boolean }) => {
        const p = promos.find((x) => x.id === promoId)!;
        calls.push({ method: "promotionCodes.update", params: { promoId, ...params } });
        if (params.active !== undefined) p.active = params.active;
        return { ...p };
      },
      // The SDK's list is async-iterable (auto-pagination); an array is enough here.
      list: (params: { active?: boolean }) => promos.filter((p) => params.active === undefined || p.active === params.active).map((p) => ({ ...p })),
    },
    customers: {
      createBalanceTransaction: async (customerId: string, params: Record<string, unknown>, options?: { idempotencyKey?: string }) =>
        create("customers.createBalanceTransaction", { customerId, ...params }, options, () => ({ id: id("cbtxn") })),
    },
  };
  return {
    stripe: stripe as unknown as Stripe,
    calls,
    refunds,
    transfers,
    reversals,
    promos,
    /** Makes the next call of `method` fail. */
    failNext(method: string, mode: Failure["mode"], error: Failure["error"] = stripeError("StripeConnectionError")) {
      failures.set(method, [...(failures.get(method) ?? []), { mode, error }]);
    },
    /** Forgets idempotency keys, like Stripe does after 24 hours. */
    expireKeys: () => byKey.clear(),
  };
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
  await prisma.financialOperation.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.payment.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.invoice.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.bookingAssignment.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.booking.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgs } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: run } } });
}
