// No server-only guard: lib/deliver.ts uses it from auth-config, which the Better Auth CLI loads outside Next.
import { Redis } from "ioredis";

const globalForRedis = globalThis as unknown as { redis?: Redis };

/** One shared Redis connection for rate limits and job queues (kept across dev reloads). */
export const redis = (globalForRedis.redis ??= new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  // Fail fast when Redis is down: rate limits allow the request and emails fall back to direct sending.
  maxRetriesPerRequest: 2,
  lazyConnect: true,
}));
