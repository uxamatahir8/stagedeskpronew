// No server-only guard: auth-config imports this, and the Better Auth CLI loads that file outside Next.
import { Queue } from "bullmq";
import { EMAIL_QUEUE, type EmailJob, sendEmailJob } from "@stagedesk/emails";
import { redis } from "./redis";

const globalForQueue = globalThis as unknown as { emailQueue?: Queue };
const emailQueue = (globalForQueue.emailQueue ??= new Queue(EMAIL_QUEUE, { connection: redis }));

/**
 * Hands an email to the worker, which renders and sends it with retries, so
 * the visitor never waits on the mail server. If Redis is down or no worker
 * is running, it's sent from here instead so sign-in codes always arrive.
 */
export function deliver(job: EmailJob) {
  void (async () => {
    try {
      if ((await emailQueue.getWorkersCount()) > 0) {
        await emailQueue.add(job.kind, job, { attempts: 5, backoff: { type: "exponential", delay: 30_000 }, removeOnComplete: 1000, removeOnFail: 5000 });
        return;
      }
    } catch (error) {
      console.error("[mail] queue unavailable, sending directly", error);
    }
    await sendEmailJob(job).catch((error: unknown) => console.error("[mail] delivery failed", job.kind, error));
  })();
}
