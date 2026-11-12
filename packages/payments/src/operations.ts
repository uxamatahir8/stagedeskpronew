import { shortError } from "./errors";
import type Stripe from "stripe";
import { randomUUID } from "node:crypto";
import { type FinancialOperation, Prisma, prisma } from "@stagedesk/db";

/**
 * Durable money operations (refunds, payouts).
 *
 * The rule: reserve first, call Stripe second, book last.
 *  1. A FinancialOperation row is created in a transaction that locks the
 *     payment, so its amount is reserved before anything leaves.
 *  2. Stripe is called outside any transaction with keys derived from the
 *     operation id (never from balances that change), and every result is
 *     stored on the operation as soon as it arrives.
 *  3. The ledger, payment and booking are updated in one transaction that
 *     also flips the operation to completed; it can only happen once.
 *
 * If anything between 2 and 3 fails (timeout, crash, database error) the
 * operation stays pending and the worker continues it with the same keys.
 * After a retry, Stripe is searched for objects tagged with the operation id
 * before anything new is created, so recovery also works after Stripe's
 * 24-hour idempotency window. Operations that keep failing go to "review".
 *
 * Ownership: a claim writes a fresh lockToken (fencing token). Every write
 * the claimant makes afterwards (progress, failure, booking) is conditional
 * on that token, so a process whose lease ran out and was taken over can't
 * overwrite the new owner's state; it gets LeaseLostError instead. Its Stripe
 * calls are harmless: the new owner uses the same keys and finds the objects
 * by operation id.
 */

/** This process's claim on an operation was taken over (its lease ran out). */
export class LeaseLostError extends Error {
  constructor(readonly operationId: string) {
    super(`Lease on operation ${operationId} was taken over`);
    this.name = "LeaseLostError";
  }
}

export type OperationStatus = "pending" | "completed" | "failed" | "review";

/** Attempts before an operation is handed to an operator. */
export const MAX_OPERATION_ATTEMPTS = 8;
/** How long one process may work on an operation before another may take over. */
const CLAIM_MS = 5 * 60_000;

export type Operation = FinancialOperation;

/** Backoff for the n-th failed attempt: 1, 2, 4 … minutes, at most 2 hours. */
export function retryDelayMs(attempts: number) {
  return Math.min(2 ** Math.max(0, attempts - 1) * 60_000, 2 * 60 * 60_000);
}

/**
 * Whether Stripe definitely refused the request (nothing happened), as
 * opposed to an outcome we can't know: a timeout, a dropped connection or a
 * server error, where the request may well have gone through.
 */
export function isDefinitiveStripeError(error: unknown) {
  const type = (error as { type?: string } | null)?.type;
  return (
    type === "StripeInvalidRequestError" ||
    type === "StripeCardError" ||
    type === "StripePermissionError" ||
    type === "StripeAuthenticationError" ||
    type === "StripeIdempotencyError"
  );
}

/** Takes an operation for this process; null when it's finished or another process holds it. */
export async function claimOperation(id: string, now = new Date()): Promise<Operation | null> {
  const claimed = await prisma.financialOperation.updateMany({
    where: { id, status: "pending", OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] },
    data: { lockedUntil: new Date(now.getTime() + CLAIM_MS), lockToken: randomUUID(), attempts: { increment: 1 } },
  });
  if (claimed.count === 0) return null;
  return prisma.financialOperation.findUnique({ where: { id } });
}

/** Where-clause for a write by the current owner of a claimed operation. */
export const owned = (op: Pick<Operation, "id" | "lockToken">) => ({ id: op.id, status: "pending", lockToken: op.lockToken });

/** Stores what Stripe returned so far, if this process still owns the claim. */
export async function saveOperationData(op: Pick<Operation, "id" | "lockToken">, data: object) {
  const saved = await prisma.financialOperation.updateMany({ where: owned(op), data: { data: data as Prisma.InputJsonValue } });
  if (saved.count !== 1) throw new LeaseLostError(op.id);
}

/**
 * Records a failed attempt. A definitive refusal before any money moved ends
 * the operation as failed (its reservation is released); anything else is
 * retried with backoff, and after MAX_OPERATION_ATTEMPTS waits for review.
 */
export async function failAttempt(op: Operation, error: unknown, opts: { moneyMoved: boolean }, now = new Date()) {
  // Taken over by another process: its owner decides what happens now.
  if (error instanceof LeaseLostError) return "busy" as const;
  // One readable line for the admin; the whole error goes to the server log.
  const message = shortError(error);
  console.error(`[payments] operation ${op.id} attempt failed`, error);
  if (!opts.moneyMoved && isDefinitiveStripeError(error)) {
    const done = await prisma.financialOperation.updateMany({ where: owned(op), data: { status: "failed", lastError: message, lockedUntil: null, lockToken: null, nextAttemptAt: null } });
    return done.count === 1 ? ("failed" as const) : ("busy" as const);
  }
  const review = op.attempts >= MAX_OPERATION_ATTEMPTS;
  const done = await prisma.financialOperation.updateMany({
    where: owned(op),
    data: {
      status: review ? "review" : "pending",
      lastError: message,
      lockedUntil: null,
      lockToken: null,
      nextAttemptAt: review ? null : new Date(now.getTime() + retryDelayMs(op.attempts)),
    },
  });
  if (done.count !== 1) return "busy" as const;
  if (review) console.error(`[finance] ${op.kind} ${op.id} needs review after ${op.attempts} attempts: ${message}`);
  return review ? ("review" as const) : ("pending" as const);
}

/**
 * Locks a payment for the rest of the transaction, so refunds, payouts and
 * webhook syncs of one payment queue up. Takes the booking row first: the
 * same order as booking operations (recordPayment), so they can't deadlock.
 */
export async function lockPayment(tx: Prisma.TransactionClient, paymentId: string) {
  const rows = await tx.$queryRaw<{ bookingId: string }[]>`SELECT bookingId FROM payments WHERE id = ${paymentId}`;
  if (rows[0]) await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${rows[0].bookingId} FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM payments WHERE id = ${paymentId} FOR UPDATE`;
}

/**
 * Transaction options for money changes. READ COMMITTED, so reads after
 * lockPayment see what other transactions committed while we waited (under
 * MySQL's default REPEATABLE READ they'd see the snapshot from before the lock).
 */
export const moneyTx = { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted };

/** Another refund or payout of this payment that hasn't finished. */
export function openOperation(tx: Prisma.TransactionClient, paymentId: string) {
  return tx.financialOperation.findFirst({ where: { paymentId, status: { in: ["pending", "review"] } } });
}

export const isUniqueViolation = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

/** Finds a Stripe object this operation created in an earlier attempt (searched after an uncertain failure). */
export async function findTagged<T extends { metadata?: Stripe.Metadata | null }>(
  list: () => Promise<{ data: T[] }>,
  operationId: string,
  party?: string,
): Promise<T | null> {
  const page = await list();
  return page.data.find((o) => o.metadata?.["operationId"] === operationId && (!party || o.metadata?.["party"] === party)) ?? null;
}

/**
 * Due operations the worker should continue: pending, not held by another
 * process, and past their backoff.
 */
export function dueOperations(now = new Date(), take = 50) {
  return prisma.financialOperation.findMany({
    where: {
      status: "pending",
      AND: [
        { OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] },
        { OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] },
      ],
      // Give the request that created it a minute to finish on its own.
      createdAt: { lt: new Date(now.getTime() - 60_000) },
    },
    orderBy: { createdAt: "asc" },
    take,
  });
}

/**
 * Operator: run a pending or reviewed operation again now, with a fresh
 * attempt budget. Never touches an operation a process holds right now
 * (live lease): that would let two run it at once. Returns false then.
 */
export async function resetOperation(id: string, now = new Date()) {
  const reset = await prisma.financialOperation.updateMany({
    where: {
      id,
      OR: [{ status: "review" }, { status: "pending", OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] }],
    },
    data: { status: "pending", attempts: 0, nextAttemptAt: null },
  });
  return reset.count === 1;
}
