import { randomUUID } from "node:crypto";
import { prisma } from "./client";
import { Prisma } from "./generated/prisma/client";

/**
 * Email outbox. A message is stored here before anything else happens, then
 * handed to the queue; the worker (or, without one, the web process) sends it
 * through claimEmail(), so a duplicate queue job, the direct fallback and the
 * sweeper can never send one row twice. Failures are retried with backoff by
 * the sweeper and stay visible; after MAX_ATTEMPTS a message is dead.
 *
 * What a status means: `queued` = Redis accepted the job; `sent` = the SMTP
 * server accepted the message (its Message-ID is stored). Whether it reached
 * the inbox is not known: there are no bounce or delivery webhooks.
 *
 * At-least-once: if a process dies after the SMTP server accepted a message
 * but before it was marked sent, the lease runs out and it is sent again,
 * with the same Message-ID, which mail clients use to drop the copy.
 */

export type EmailStatus = "pending" | "queued" | "sending" | "sent" | "failed" | "dead";

export const MAX_ATTEMPTS = 8;
const LEASE_MS = 2 * 60_000;
/** A queued message the queue hasn't sent after this long is assumed lost (Redis flushed, worker gone). */
const QUEUED_STALE_MS = 10 * 60_000;

/** Mail that carries a sign-in, verification or setup secret: its payload is cleared once sent. */
// Plus the artist request (may carry a first-password link) and the details request (a private link).
const secretKinds = new Set(["verifyEmail", "resetPassword", "artistAccountSetup", "accountSetup", "invitation", "loginCode", "gigAssigned", "bookingDetailsRequest"]);

export interface EmailRecordInput {
  /** Idempotency key; a second record with the same key returns the first. */
  key?: string | null;
  kind: string;
  to: string;
  job: unknown;
  agencyId?: string | null;
  bookingId?: string | null;
}

/** Stores a message. Returns it, and whether it already existed (same key). */
export async function recordEmail(input: EmailRecordInput, db: Prisma.TransactionClient | typeof prisma = prisma) {
  const key = input.key?.slice(0, 191) ?? null;
  if (key) {
    const existing = await db.emailMessage.findUnique({ where: { key }, select: { id: true, status: true } });
    if (existing) return { id: existing.id, status: existing.status as EmailStatus, duplicate: true };
  }
  const id = randomUUID();
  try {
    await db.emailMessage.create({
      data: { id, key, kind: input.kind.slice(0, 40), to: input.to.slice(0, 191), job: input.job as Prisma.InputJsonValue, agencyId: input.agencyId ?? null, bookingId: input.bookingId ?? null },
    });
  } catch (error) {
    // Two requests with one key at the same moment: the other one stored it.
    if (key && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await db.emailMessage.findUniqueOrThrow({ where: { key }, select: { id: true, status: true } });
      return { id: existing.id, status: existing.status as EmailStatus, duplicate: true };
    }
    throw error;
  }
  return { id, status: "pending" as EmailStatus, duplicate: false };
}

/** The queue accepted the message's job. Only moves pending or failed rows (a fast worker may have sent it already). */
export async function markEmailQueued(id: string, now = new Date()) {
  await prisma.emailMessage.updateMany({ where: { id, status: { in: ["pending", "failed"] } }, data: { status: "queued", queuedAt: now } });
}

/** Claims a message for one send: null when it's sent, dead, or another process holds it. */
export async function claimEmail(id: string, now = new Date()) {
  const claimed = await prisma.emailMessage.updateMany({
    where: {
      id,
      OR: [{ status: { in: ["pending", "queued", "failed"] } }, { status: "sending", lockedUntil: { lt: now } }],
    },
    data: { status: "sending", lockedUntil: new Date(now.getTime() + LEASE_MS), attempts: { increment: 1 } },
  });
  if (claimed.count !== 1) return null;
  return prisma.emailMessage.findUnique({ where: { id } });
}

/** Wait before attempt n+1: 1, 2, 4 … minutes, at most 6 hours. */
export const retryDelayMs = (attempts: number) => Math.min(6 * 60 * 60_000, 60_000 * 2 ** Math.max(0, attempts - 1));

export async function completeEmail(id: string, providerMessageId: string | null, now = new Date()) {
  const row = await prisma.emailMessage.findUnique({ where: { id }, select: { kind: true } });
  await prisma.emailMessage.updateMany({
    where: { id, status: "sending" },
    data: {
      status: "sent",
      sentAt: now,
      lockedUntil: null,
      lastError: null,
      providerMessageId: providerMessageId?.slice(0, 191) ?? null,
      // A link that signs someone in shouldn't stay in the database after it went out.
      ...(row && secretKinds.has(row.kind) ? { job: Prisma.DbNull } : {}),
    },
  });
}

export async function failEmail(id: string, error: unknown, now = new Date()) {
  const row = await prisma.emailMessage.findUnique({ where: { id }, select: { attempts: true } });
  const attempts = row?.attempts ?? MAX_ATTEMPTS;
  const dead = attempts >= MAX_ATTEMPTS;
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  await prisma.emailMessage.updateMany({
    where: { id, status: "sending" },
    data: { status: dead ? "dead" : "failed", lockedUntil: null, lastError: message.slice(0, 2000), nextAttemptAt: new Date(now.getTime() + retryDelayMs(attempts)) },
  });
  return dead ? ("dead" as const) : ("failed" as const);
}

/** Sends one stored message through the claim. `send` returns the Message-ID the SMTP server accepted. */
export async function processEmail(id: string, send: (job: unknown, messageId: string) => Promise<string | null | undefined | void>, now = new Date()) {
  const row = await claimEmail(id, now);
  if (!row) return "skipped" as const;
  if (row.job === null) {
    await failEmail(id, new Error("payload missing"), now);
    return "failed" as const;
  }
  try {
    const accepted = await send(row.job, messageIdFor(row.id));
    await completeEmail(id, accepted || messageIdFor(row.id));
    return "sent" as const;
  } catch (error) {
    return failEmail(id, error);
  }
}

/** A stable Message-ID per outbox row, so a resend after a crash is recognisable as the same message. */
export function messageIdFor(id: string) {
  const domain = (process.env["MAIL_FROM"] ?? "").match(/@([^>\s]+)/)?.[1] ?? "stagedesk.local";
  return `<${id}@${domain}>`;
}

/** Messages the sweeper should (re)send now: never queued, failed and due, lost in the queue, or held by a process that died. */
export async function dueEmails(now = new Date(), take = 100) {
  return prisma.emailMessage.findMany({
    where: {
      OR: [
        { status: { in: ["pending", "failed"] }, nextAttemptAt: { lte: now } },
        { status: "queued", queuedAt: { lt: new Date(now.getTime() - QUEUED_STALE_MS) } },
        { status: "sending", lockedUntil: { lt: now } },
      ],
    },
    orderBy: { nextAttemptAt: "asc" },
    take,
    select: { id: true },
  });
}

/** Puts a failed or dead message back in line (support's "send again"). */
export async function retryEmail(id: string, now = new Date()) {
  const { count } = await prisma.emailMessage.updateMany({ where: { id, status: { in: ["failed", "dead"] }, job: { not: Prisma.DbNull } }, data: { status: "pending", nextAttemptAt: now, attempts: 0, lastError: null } });
  return count === 1;
}

/** A booking's emails, newest first, for its page. */
export function bookingEmails(bookingId: string, take = 10) {
  return prisma.emailMessage.findMany({
    where: { bookingId },
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, kind: true, to: true, status: true, attempts: true, lastError: true, createdAt: true, sentAt: true, nextAttemptAt: true },
  });
}

/** Counts by status, for the admin's email page. */
export async function emailStatusCounts(since: Date) {
  const rows = await prisma.emailMessage.groupBy({ by: ["status"], where: { createdAt: { gte: since } }, _count: { _all: true } });
  return Object.fromEntries(rows.map((r) => [r.status, r._count._all])) as Partial<Record<EmailStatus, number>>;
}

export function undeliveredEmails(take = 50) {
  return prisma.emailMessage.findMany({
    where: { status: { in: ["failed", "dead"] } },
    orderBy: { updatedAt: "desc" },
    take,
    select: { id: true, kind: true, to: true, status: true, attempts: true, lastError: true, updatedAt: true, bookingId: true },
  });
}
