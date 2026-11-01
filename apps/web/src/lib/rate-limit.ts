import "server-only";
import { redis } from "./redis";

/**
 * Increments and (re)arms the window in one step. Separate INCR and EXPIRE
 * calls left a counter without expiry when the second never ran (timeout,
 * crash), blocking that key for good; this also repairs such a key.
 */
const INCR_WINDOW = `
local count = redis.call('INCR', KEYS[1])
if count == 1 or redis.call('TTL', KEYS[1]) < 0 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return count`;

/** Used while Redis can't be reached: per process, so limits still hold (per instance) during an outage. */
const local = new Map<string, { count: number; resetAt: number }>();

export function allowLocally(name: string, max: number, windowSeconds: number, now = Date.now()) {
  const entry = local.get(name);
  if (!entry || entry.resetAt <= now) {
    if (local.size > 10_000) for (const [k, v] of local) if (v.resetAt <= now) local.delete(k);
    local.set(name, { count: 1, resetAt: now + windowSeconds * 1000 });
    return 1 <= max;
  }
  entry.count++;
  return entry.count <= max;
}

const withTimeout = <T,>(promise: Promise<T>, ms: number) =>
  Promise.race([promise, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Redis didn't answer within ${ms} ms`)), ms))]);

/**
 * Fixed-window counter. Returns false once `key` has been used more than
 * `max` times in `windowSeconds`. If Redis is down or slow, the same limit is
 * kept in this process's memory instead: public forms stay up, and abuse is
 * still bounded (per instance) rather than unlimited.
 */
export async function allow(key: string, max: number, windowSeconds: number): Promise<boolean> {
  const name = `rl:${key}`;
  try {
    const count = Number(await withTimeout(redis.eval(INCR_WINDOW, 1, name, String(windowSeconds)), 1500));
    return count <= max;
  } catch (error) {
    console.error("[rate-limit] Redis unavailable, limiting in memory", (error as Error).message);
    return allowLocally(name, max, windowSeconds);
  }
}

/**
 * Best-effort client IP. Behind our reverse proxy (Caddy) X-Forwarded-For
 * holds the address the proxy saw; with TRUSTED_PROXIES=n the n-th address
 * from the right is used, so a client can't choose its own by sending the
 * header. Without proxies configured the left-most value is used (dev).
 */
export function clientIp(headers: Headers) {
  const forwarded = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const hops = Number(process.env.TRUSTED_PROXIES ?? 0);
  const fromRight = Number.isInteger(hops) && hops > 0 ? forwarded[forwarded.length - hops] : undefined;
  return fromRight || forwarded[0] || headers.get("x-real-ip") || "unknown";
}
