import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { approveDueCommissions, expireQuotes, prisma } from "@stagedesk/db";
import { EMAIL_QUEUE, type EmailJob, sendEmailJob } from "@stagedesk/emails";
import { getStripe, processStoredEvent, runAffiliatePayouts, runDuePayouts } from "@stagedesk/payments";
import { sendReminders } from "./reminders";

const connection = new Redis(process.env["REDIS_URL"] ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

// Housekeeping on a schedule. Stripe webhooks are stored and processed by the
// web app; "retry-stripe-events" picks up any that failed, so none are lost.
const systemQueue = new Queue("system", { connection });

// Every email goes through this queue: the web app and the jobs below add
// { kind, to, params }; failed sends are retried with backoff.
const emailQueue = new Queue(EMAIL_QUEUE, { connection });
const queueEmail = (job: EmailJob) =>
  emailQueue.add(job.kind, job, { attempts: 5, backoff: { type: "exponential", delay: 30_000 }, removeOnComplete: 1000, removeOnFail: 5000 });

const emailWorker = new Worker(EMAIL_QUEUE, async (job) => {
  await sendEmailJob(job.data as EmailJob);
  return { to: (job.data as EmailJob).to };
}, { connection, concurrency: 5 });

const systemWorker = new Worker(
  "system",
  async (job) => {
    // Looked up per job: the admin can enter or change the keys while the worker runs.
    const stripe = await getStripe();
    switch (job.name) {
      case "heartbeat": {
        const settings = await prisma.platformSetting.count();
        return { at: new Date().toISOString(), settings };
      }
      case "expire-quotes":
        return { expired: await expireQuotes() };
      case "reminders":
        return sendReminders(queueEmail);
      case "payouts":
        return stripe ? { paidOut: await runDuePayouts(stripe) } : { skipped: "Stripe not configured" };
      case "approve-commissions":
        return approveDueCommissions();
      case "affiliate-payouts": {
        // Runs hourly but only pays on the program's payout day; paid commissions aren't paid twice.
        if (!stripe) return { skipped: "Stripe not configured" };
        const paid = await runAffiliatePayouts(stripe);
        for (const p of paid) await queuePayoutStatement(p.payoutId).catch((e) => console.error("[affiliates] statement email failed", e));
        return { paid: paid.length };
      }
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

/** Emails the affiliate a statement listing every commission in the payout. */
async function queuePayoutStatement(payoutId: string) {
  const payout = await prisma.affiliatePayout.findUniqueOrThrow({
    where: { id: payoutId },
    include: { affiliate: { include: { user: true } }, commissions: { include: { referral: { include: { agency: { select: { name: true } } } } } } },
  });
  const user = payout.affiliate.user;
  const locale = user.locale === "en" ? "en" : "nl";
  const money = (cents: number) => new Intl.NumberFormat(locale === "en" ? "en-GB" : "nl-NL", { style: "currency", currency: "EUR" }).format(cents / 100);
  const date = (d: Date) => new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "nl-NL", { day: "numeric", month: "short", year: "numeric" }).format(d);
  const base = process.env["APP_URL"] ?? process.env["BETTER_AUTH_URL"] ?? "http://localhost:3000";
  await queueEmail({
    kind: "affiliatePayout",
    to: user.email,
    params: {
      locale,
      name: user.name.split(/\s+/)[0] ?? user.name,
      amount: money(payout.amountCents),
      lines: payout.commissions.map((c) => `${c.referral.agency.name} · ${date(c.createdAt)} · ${money(c.amountCents)}`),
      url: `${base}${locale === "en" ? "/en" : ""}/app/payouts`,
    },
  });
}

for (const w of [systemWorker, emailWorker]) {
  w.on("completed", (job, result) => console.log(`[${w.name}] ${job.name} done`, result));
  w.on("failed", (job, err) => console.error(`[${w.name}] ${job?.name} failed (attempt ${job?.attemptsMade}):`, err.message));
}

await systemQueue.upsertJobScheduler("heartbeat", { every: 60_000 }, { name: "heartbeat" });
await systemQueue.upsertJobScheduler("expire-quotes", { every: 15 * 60_000 }, { name: "expire-quotes" });
await systemQueue.upsertJobScheduler("reminders", { every: 60 * 60_000 }, { name: "reminders" });
await systemQueue.upsertJobScheduler("payouts", { every: 60 * 60_000 }, { name: "payouts" });
await systemQueue.upsertJobScheduler("approve-commissions", { every: 60 * 60_000 }, { name: "approve-commissions" });
await systemQueue.upsertJobScheduler("affiliate-payouts", { every: 60 * 60_000 }, { name: "affiliate-payouts" });
await systemQueue.upsertJobScheduler("retry-stripe-events", { every: 5 * 60_000 }, { name: "retry-stripe-events" });
console.log(`Worker started. Queues: system, ${EMAIL_QUEUE}. Stripe ${(await getStripe()) ? "configured" : "not configured"}.`);

async function shutdown() {
  await Promise.all([systemWorker.close(), emailWorker.close()]);
  await Promise.all([systemQueue.close(), emailQueue.close()]);
  await connection.quit();
  await prisma.$disconnect();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
