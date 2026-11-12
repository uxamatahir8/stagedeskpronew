// No server-only guard: auth-config imports this, and the Better Auth CLI loads that file outside Next.
import { Queue } from "bullmq";
import { markEmailQueued, processEmail, recordEmail } from "@stagedesk/db";
import { EMAIL_QUEUE, type EmailJob, sendEmailJob } from "@stagedesk/emails";
import { redis } from "./redis";

const globalForQueue = globalThis as unknown as { emailQueue?: Queue };
const emailQueue = (globalForQueue.emailQueue ??= new Queue(EMAIL_QUEUE, { connection: redis }));

/**
 * What happened to an email when the request ended. None of these means it
 * reached the inbox:
 * - "queued": stored, and the queue accepted it; the worker sends it.
 * - "stored": stored, but no queue or worker took it now; it's sent from here
 *   in the background, and if that fails the worker's sweeper retries it.
 * - "duplicate": the same message (same key) was stored before; nothing new.
 * - "unstored": the database refused it; sent best-effort, not retried.
 */
export type DeliveryStatus = "queued" | "stored" | "duplicate" | "unstored";
export interface DeliveryReceipt {
  id: string | null;
  status: DeliveryStatus;
}

export interface DeliverOptions {
  /** Idempotency key from the business record (quote:<id>, gig-new:<assignment>…): a repeat stores nothing new. */
  key?: string;
  agencyId?: string | null;
  bookingId?: string | null;
}

/** Sends a stored message through the outbox claim (one send per row, whoever calls). */
export const sendStored = (id: string) => processEmail(id, (job, messageId) => sendEmailJob(job as EmailJob, { messageId }));

/** Hands a stored message to the queue; false when Redis or the worker isn't there. */
async function enqueue(id: string, kind: string) {
  try {
    if ((await emailQueue.getWorkersCount()) === 0) return false;
    // One attempt in the queue: retries are the outbox's (visible, with backoff), so a message isn't retried twice over.
    await emailQueue.add(kind, { outboxId: id }, { jobId: id, attempts: 1, removeOnComplete: 1000, removeOnFail: 5000 });
    await markEmailQueued(id);
    return true;
  } catch (error) {
    console.error("[mail] queue unavailable; the message stays in the outbox", id, error);
    return false;
  }
}

/**
 * Stores an email in the outbox, then queues it. Never throws: callers that
 * must tell the user whether it was accepted await the receipt; the rest may
 * ignore it, since a stored message is retried by the worker either way.
 * Sign-in codes skip the outbox (a short-lived secret, asked for again in a
 * minute) and go straight to the queue or the mail server.
 */
export async function deliver(job: EmailJob, opts: DeliverOptions = {}): Promise<DeliveryReceipt> {
  if (job.kind === "loginCode") return deliverDirect(job);
  let stored: Awaited<ReturnType<typeof recordEmail>>;
  try {
    stored = await recordEmail({ key: opts.key, kind: job.kind, to: job.to, job, agencyId: opts.agencyId, bookingId: opts.bookingId });
  } catch (error) {
    console.error("[mail] outbox unavailable, sending without a record", job.kind, error);
    return deliverDirect(job);
  }
  if (stored.duplicate) return { id: stored.id, status: "duplicate" };
  if (await enqueue(stored.id, job.kind)) return { id: stored.id, status: "queued" };
  // No worker now: send from here. The row is stored, so if this process dies the sweeper sends it.
  void sendStored(stored.id).catch((error: unknown) => console.error("[mail] direct send failed; left for retry", stored.id, error));
  return { id: stored.id, status: "stored" };
}

/** The old path, for sign-in codes and when the database is down: queue if possible, else send now. */
async function deliverDirect(job: EmailJob): Promise<DeliveryReceipt> {
  try {
    if ((await emailQueue.getWorkersCount()) > 0) {
      await emailQueue.add(job.kind, job, { attempts: 5, backoff: { type: "exponential", delay: 30_000 }, removeOnComplete: 1000, removeOnFail: 5000 });
      return { id: null, status: "queued" };
    }
  } catch (error) {
    console.error("[mail] queue unavailable, sending directly", error);
  }
  void sendEmailJob(job).catch((error: unknown) => console.error("[mail] delivery failed", job.kind, error));
  return { id: null, status: "unstored" };
}

/** Whether a receipt means the message is safely on its way (stored or queued). */
export const accepted = (r: DeliveryReceipt) => r.status !== "unstored";
