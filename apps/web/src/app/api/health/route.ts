import { timingSafeEqual } from "node:crypto";
import { Queue } from "bullmq";
import { connection } from "next/server";
import { EMAIL_QUEUE } from "@stagedesk/emails";
import { prisma } from "@stagedesk/db";
import { redis } from "@/lib/redis";

/**
 * Liveness and readiness for the load balancer, deploy script and monitoring.
 *
 * GET /api/health → 200 when the database and Redis answer, else 503. Says
 * nothing else, so it's safe to leave public.
 *
 * With `Authorization: Bearer $HEALTH_TOKEN` it adds what monitoring should
 * alert on: worker heartbeat age, failed email jobs, the Stripe webhook
 * backlog and dead events, and refunds/payouts waiting for an operator.
 */
export async function GET(request: Request) {
  await connection();
  const check = async (fn: () => Promise<unknown>) => {
    const started = Date.now();
    try {
      await Promise.race([fn(), new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 3_000))]);
      return { ok: true, ms: Date.now() - started };
    } catch (error) {
      return { ok: false, ms: Date.now() - started, error: (error as Error).message };
    }
  };
  const [database, cache] = await Promise.all([check(() => prisma.$queryRaw`SELECT 1`), check(() => redis.ping())]);
  const ready = database.ok && cache.ok;

  if (!authorized(request)) return Response.json({ ok: ready }, { status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" } });

  const now = Date.now();
  const details = await Promise.allSettled([
    redis.get("worker:heartbeat"),
    new Queue(EMAIL_QUEUE, { connection: redis }).getJobCounts("failed", "waiting", "delayed"),
    prisma.stripeEvent.groupBy({ by: ["status"], where: { status: { in: ["received", "processing", "failed", "dead"] } }, _count: { _all: true } }),
    prisma.financialOperation.groupBy({ by: ["status"], where: { status: { in: ["pending", "review"] } }, _count: { _all: true } }),
  ]);
  const value = <T,>(r: PromiseSettledResult<T>) => (r.status === "fulfilled" ? r.value : null);
  const heartbeat = value(details[0]);
  const counts = (rows: { status: string; _count: { _all: number } }[] | null) => Object.fromEntries((rows ?? []).map((r) => [r.status, r._count._all]));
  const workerAgeSeconds = heartbeat ? Math.round((now - Number(heartbeat)) / 1000) : null;
  const stripeEvents = counts(value(details[2]) as never);
  const operations = counts(value(details[3]) as never);
  const alerts = [
    workerAgeSeconds === null || workerAgeSeconds > 180 ? "worker_down" : null,
    (stripeEvents["dead"] ?? 0) > 0 ? "stripe_events_dead" : null,
    (stripeEvents["failed"] ?? 0) + (stripeEvents["received"] ?? 0) > 50 ? "stripe_events_backlog" : null,
    (operations["review"] ?? 0) > 0 ? "financial_operations_review" : null,
    ((value(details[1]) as { failed?: number } | null)?.failed ?? 0) > 0 ? "email_jobs_failed" : null,
  ].filter(Boolean);
  return Response.json(
    { ok: ready, checks: { database, redis: cache }, worker: { heartbeatAgeSeconds: workerAgeSeconds }, emailQueue: value(details[1]), stripeEvents, financialOperations: operations, alerts },
    { status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}

function authorized(request: Request) {
  const token = process.env.HEALTH_TOKEN;
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!token || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}
