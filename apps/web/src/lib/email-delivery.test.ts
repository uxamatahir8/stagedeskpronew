import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Queue as QueueType, Worker as WorkerType } from "bullmq";

/**
 * Email delivery through the outbox with the real pieces: BullMQ on Redis,
 * the email_messages table, and SMTP into Mailpit. Redis database 7 keeps the
 * jobs away from a dev worker that may be running on the default database.
 */
process.env["REDIS_URL"] = "redis://localhost:6379/7";
process.env["SMTP_HOST"] = "localhost";
process.env["SMTP_PORT"] = "1025";
process.env["SMTP_USER"] = "";
process.env["MAIL_FROM"] = "StageDesk <no-reply@stagedesk.local>";
vi.mock("server-only", () => ({}));

const MAILPIT = "http://localhost:8025/api/v1";
const run = `ed${Date.now().toString(36)}`;
const to = (n: string) => `${run}-${n}@test.local`;

type Deliver = typeof import("./deliver");
type Db = typeof import("@stagedesk/db");
let deliver: Deliver["deliver"];
let sendStored: Deliver["sendStored"];
let db: Db;
let worker: WorkerType | null = null;
let queue: QueueType;

const job = (address: string) =>
  ({
    kind: "gigAssigned",
    to: address,
    params: { locale: "nl", status: "withdrawn", name: "DJ Test", agency: "Outbox Agency", event: "feest", date: "1 juni", venue: "", url: "http://localhost:3000/app/gigs" },
  }) as const;

/** Messages Mailpit received for an address. */
async function inbox(address: string) {
  const res = await fetch(`${MAILPIT}/search?query=${encodeURIComponent(`to:${address}`)}`);
  return ((await res.json()).messages ?? []) as { ID: string; MessageID: string }[];
}

async function until(check: () => Promise<boolean>, ms = 15_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("timed out");
}

const row = (id: string) => db.prisma.emailMessage.findUniqueOrThrow({ where: { id } });

beforeAll(async () => {
  db = await import("@stagedesk/db");
  ({ deliver, sendStored } = await import("./deliver"));
  const { Queue } = await import("bullmq");
  const { redis } = await import("./redis");
  const { EMAIL_QUEUE } = await import("@stagedesk/emails");
  queue = new Queue(EMAIL_QUEUE, { connection: redis });
  await queue.obliterate({ force: true }).catch(() => undefined);
});

afterAll(async () => {
  await worker?.close();
  await queue.obliterate({ force: true }).catch(() => undefined);
  await queue.close();
  await db.prisma.emailMessage.deleteMany({ where: { to: { startsWith: run } } });
  await db.prisma.$disconnect();
  const { redis } = await import("./redis");
  redis.disconnect();
});

async function startWorker() {
  const { Worker } = await import("bullmq");
  const { Redis } = await import("ioredis");
  const { EMAIL_QUEUE } = await import("@stagedesk/emails");
  // The same processor as apps/worker: send through the outbox claim.
  worker = new Worker(EMAIL_QUEUE, async (j) => sendStored((j.data as { outboxId: string }).outboxId), {
    connection: new Redis("redis://localhost:6379/7", { maxRetriesPerRequest: null }),
  });
  await worker.waitUntilReady();
  await until(async () => (await queue.getWorkersCount()) > 0);
}

describe("email outbox", () => {
  it("goes through the real queue to the mail server once, even when the job is added twice", async () => {
    await startWorker();
    const address = to("queued");
    const receipt = await deliver(job(address), { key: `${run}:queued` });
    expect(receipt.status).toBe("queued");
    await until(async () => (await row(receipt.id!)).status === "sent");
    // A duplicate job for the same row (a retry, a second process) sends nothing more.
    await queue.add("gigAssigned", { outboxId: receipt.id }, { jobId: `${receipt.id}-again` });
    await new Promise((r) => setTimeout(r, 1500));
    const sent = await row(receipt.id!);
    expect(sent).toMatchObject({ status: "sent", attempts: 1 });
    expect(sent.providerMessageId).toContain(receipt.id);
    // Payload with a private link is cleared once it went out.
    expect(sent.job).toBeNull();
    await until(async () => (await inbox(address)).length >= 1);
    await new Promise((r) => setTimeout(r, 500));
    expect(await inbox(address)).toHaveLength(1);
    await worker!.close();
    worker = null;
  });

  it("stores nothing new for a repeated request with the same key", async () => {
    const address = to("dupe");
    const first = await deliver(job(address), { key: `${run}:dupe` });
    const second = await deliver(job(address), { key: `${run}:dupe` });
    expect(second).toEqual({ id: first.id, status: "duplicate" });
    expect(await db.prisma.emailMessage.count({ where: { key: `${run}:dupe` } })).toBe(1);
  });

  it("with Redis down, keeps the message and sends it without the queue", async () => {
    const { Queue } = await import("bullmq");
    const spy = vi.spyOn(Queue.prototype, "getWorkersCount").mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:6379"));
    const address = to("redis-down");
    const receipt = await deliver(job(address), { key: `${run}:redis-down` });
    spy.mockRestore();
    expect(receipt.status).toBe("stored");
    await until(async () => (await row(receipt.id!)).status === "sent");
    await until(async () => (await inbox(address)).length === 1);
  });

  it("the direct fallback and a queue job racing for one message send it once", async () => {
    const address = to("race");
    const stored = await db.recordEmail({ key: `${run}:race`, kind: "gigAssigned", to: address, job: job(address) });
    const results = await Promise.all([sendStored(stored.id), sendStored(stored.id), sendStored(stored.id)]);
    expect(results.filter((r) => r === "sent")).toHaveLength(1);
    expect(results.filter((r) => r === "skipped")).toHaveLength(2);
    await until(async () => (await inbox(address)).length >= 1);
    await new Promise((r) => setTimeout(r, 500));
    expect(await inbox(address)).toHaveLength(1);
  });

  it("an SMTP failure is retried with backoff, then gives up and can be sent again by hand", async () => {
    const address = to("smtp");
    const stored = await db.recordEmail({ kind: "gigAssigned", to: address, job: job(address) });
    const failing = async () => {
      throw new Error("connect ECONNREFUSED 127.0.0.1:25");
    };
    const t0 = new Date();
    expect(await db.processEmail(stored.id, failing, t0)).toBe("failed");
    const failed = await row(stored.id);
    expect(failed.status).toBe("failed");
    expect(failed.lastError).toContain("ECONNREFUSED");
    // Not due before its backoff, due after.
    const due = async (at: Date) => (await db.dueEmails(at, 1000)).some((r) => r.id === stored.id);
    expect(await due(new Date(t0.getTime() + 10_000))).toBe(false);
    expect(await due(new Date(t0.getTime() + db.retryDelayMs(1) + 1_000))).toBe(true);
    for (let i = 2; i <= db.MAX_ATTEMPTS; i++) await db.processEmail(stored.id, failing, new Date(t0.getTime() + i * 7 * 3_600_000));
    expect((await row(stored.id)).status).toBe("dead");
    expect(await due(new Date(t0.getTime() + 100 * 3_600_000))).toBe(false);
    expect(await db.retryEmail(stored.id)).toBe(true);
    expect(await sendStored(stored.id)).toBe("sent");
    await until(async () => (await inbox(address)).length === 1);
  });

  it("a message held by a process that died is sent again after its lease, with the same Message-ID", async () => {
    const address = to("crash");
    const stored = await db.recordEmail({ kind: "gigAssigned", to: address, job: job(address) });
    const t0 = new Date();
    // The process claims it and dies before sending.
    expect(await db.claimEmail(stored.id, t0)).not.toBeNull();
    expect(await sendStored(stored.id)).toBe("skipped");
    expect((await db.dueEmails(t0, 1000)).some((r) => r.id === stored.id)).toBe(false);
    const later = new Date(t0.getTime() + 3 * 60_000);
    expect((await db.dueEmails(later, 1000)).some((r) => r.id === stored.id)).toBe(true);
    expect(await db.processEmail(stored.id, (j, messageId) => import("@stagedesk/emails").then((m) => m.sendEmailJob(j as never, { messageId })), later)).toBe("sent");
    const sent = await row(stored.id);
    expect(sent.attempts).toBe(2);
    await until(async () => (await inbox(address)).length === 1);
    expect((await inbox(address))[0]!.MessageID).toBe(db.messageIdFor(stored.id).slice(1, -1));
  });

  it("fences a stale worker after another worker reclaims its expired lease", async () => {
    const stored = await db.recordEmail({ kind: "gigAssigned", to: to("fenced"), job: job(to("fenced")) });
    const t0 = new Date();
    const workerA = await db.claimEmail(stored.id, t0);
    expect(workerA?.leaseToken).toBeTruthy();

    const workerB = await db.claimEmail(stored.id, new Date(t0.getTime() + 3 * 60_000));
    expect(workerB?.leaseToken).toBeTruthy();
    expect(workerB?.leaseToken).not.toBe(workerA?.leaseToken);

    // A's SMTP call may finish late, but A no longer owns the row.
    expect(await db.completeEmail(stored.id, workerA!.leaseToken!, "<stale@provider.test>")).toBe(false);
    expect(await db.failEmail(stored.id, workerA!.leaseToken!, new Error("late failure"))).toBe("stale");
    expect(await row(stored.id)).toMatchObject({ status: "sending", leaseToken: workerB!.leaseToken });

    expect(await db.completeEmail(stored.id, workerB!.leaseToken!, "<current@provider.test>")).toBe(true);
    expect(await row(stored.id)).toMatchObject({ status: "sent", providerMessageId: "<current@provider.test>", leaseToken: null });
  });

  it("records a deliberately suppressed message without claiming SMTP accepted it", async () => {
    const stored = await db.recordEmail({ kind: "gigAssigned", to: to("suppressed"), job: job(to("suppressed")) });
    expect(await db.processEmail(stored.id, async () => undefined)).toBe("suppressed");
    expect(await row(stored.id)).toMatchObject({ status: "suppressed", providerMessageId: null, sentAt: null });
    expect((await db.dueEmails(new Date(Date.now() + 24 * 60 * 60_000), 1000)).some((r) => r.id === stored.id)).toBe(false);
  });

  it("a message that was never queued (stored while Redis was down) is picked up by the sweep", async () => {
    const stored = await db.recordEmail({ kind: "gigAssigned", to: to("sweep"), job: job(to("sweep")) });
    expect((await db.dueEmails(new Date(), 1000)).some((r) => r.id === stored.id)).toBe(true);
  });
});
