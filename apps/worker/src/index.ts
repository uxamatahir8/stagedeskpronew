import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { expireQuotes, prisma } from "@stagedesk/db";
import { getStripe, processStoredEvent, runDuePayouts } from "@stagedesk/payments";

const connection = new Redis(process.env["REDIS_URL"] ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

// "system": housekeeping on a schedule. "stripe-events": webhooks stored by the
// web app, processed here with retries so a hiccup never loses a payment.
const systemQueue = new Queue("system", { connection });
const stripe = getStripe();

const systemWorker = new Worker(
  "system",
  async (job) => {
    switch (job.name) {
      case "heartbeat": {
        const settings = await prisma.platformSetting.count();
        return { at: new Date().toISOString(), settings };
      }
      case "expire-quotes":
        return { expired: await expireQuotes() };
      case "payouts":
        return stripe ? { paidOut: await runDuePayouts(stripe) } : { skipped: "Stripe not configured" };
      case "retry-stripe-events": {
        // Picks up events whose immediate processing failed or never ran.
        if (!stripe) return { skipped: "Stripe not configured" };
        const stuck = await prisma.stripeEvent.findMany({
          where: { status: { in: ["received", "failed"] }, receivedAt: { lt: new Date(Date.now() - 60_000) } },
          select: { id: true },
          take: 100,
        });
        for (const e of stuck) await processStoredEvent(stripe, e.id).catch(() => undefined);
        return { retried: stuck.length };
      }
      default:
        throw new Error(`Unknown system job: ${job.name}`);
    }
  },
  { connection },
);

const stripeWorker = new Worker(
  "stripe-events",
  async (job) => {
    if (!stripe) throw new Error("Stripe not configured");
    return { status: await processStoredEvent(stripe, String(job.data.eventId)) };
  },
  { connection },
);

for (const w of [systemWorker, stripeWorker]) {
  w.on("completed", (job, result) => console.log(`[${w.name}] ${job.name} done`, result));
  w.on("failed", (job, err) => console.error(`[${w.name}] ${job?.name} failed:`, err.message));
}

await systemQueue.upsertJobScheduler("heartbeat", { every: 60_000 }, { name: "heartbeat" });
await systemQueue.upsertJobScheduler("expire-quotes", { every: 15 * 60_000 }, { name: "expire-quotes" });
await systemQueue.upsertJobScheduler("payouts", { every: 60 * 60_000 }, { name: "payouts" });
await systemQueue.upsertJobScheduler("retry-stripe-events", { every: 5 * 60_000 }, { name: "retry-stripe-events" });
console.log(`Worker started. Queues: system, stripe-events. Stripe ${stripe ? "configured" : "not configured"}.`);

async function shutdown() {
  await Promise.all([systemWorker.close(), stripeWorker.close()]);
  await systemQueue.close();
  await connection.quit();
  await prisma.$disconnect();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
