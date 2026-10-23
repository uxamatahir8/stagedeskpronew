import "server-only";
import { redis } from "./redis";

/**
 * Fixed-window counter. Returns false once `key` has been used more than
 * `max` times in `windowSeconds`. If Redis is down, requests are allowed so a
 * cache outage can't take public forms offline.
 */
export async function allow(key: string, max: number, windowSeconds: number): Promise<boolean> {
  try {
    const name = `rl:${key}`;
    const count = await redis.incr(name);
    if (count === 1) await redis.expire(name, windowSeconds);
    return count <= max;
  } catch (error) {
    console.error("[rate-limit] Redis unavailable, allowing request", error);
    return true;
  }
}

/** Best-effort client IP behind a proxy (Caddy sets X-Forwarded-For). */
export function clientIp(headers: Headers) {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
}
