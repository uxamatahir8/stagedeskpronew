import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { prisma } from "@stagedesk/db";

const connection = new Redis(process.env["REDIS_URL"] ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

// Queues are added per phase (emails, stripe-events, payouts, commissions).
// "system" carries housekeeping jobs and proves the worker is alive.
const systemQueue = new Queue("system", { connection });

const worker = new Worker(
  "system",
  async (job) => {
    switch (job.name) {
      case "heartbeat": {
        const settings = await prisma.platformSetting.count();
        return { at: new Date().toISOString(), settings };
      }
      default:
        throw new Error(`Unknown system job: ${job.name}`);
    }
  },
  { connection },
);

worker.on("completed", (job, result) => console.log(`[system] ${job.name} done`, result));
worker.on("failed", (job, err) => console.error(`[system] ${job?.name} failed:`, err.message));

await systemQueue.upsertJobScheduler("heartbeat", { every: 60_000 }, { name: "heartbeat" });
console.log("Worker started. Queues: system");

async function shutdown() {
  await worker.close();
  await systemQueue.close();
  await connection.quit();
  await prisma.$disconnect();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
