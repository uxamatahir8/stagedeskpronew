import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { allow, allowLocally, clientIp } from "./rate-limit";
import { redis } from "./redis";

const run = `rltest${Date.now().toString(36)}`;

afterAll(async () => {
  const keys = await redis.keys(`rl:${run}*`);
  if (keys.length) await redis.del(...keys);
  redis.disconnect();
});

describe("rate limits", () => {
  it("counts within a window and refuses past the limit", async () => {
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await allow(`${run}:a`, 3, 60));
    expect(results).toEqual([true, true, true, false]);
    expect(await redis.ttl(`rl:${run}:a`)).toBeGreaterThan(0);
  });

  it("repairs a counter that lost its expiry, so a key can't stay blocked for good", async () => {
    // What separate INCR/EXPIRE calls could leave behind when the EXPIRE never ran.
    await redis.set(`rl:${run}:stuck`, "99");
    expect(await redis.ttl(`rl:${run}:stuck`)).toBe(-1);
    expect(await allow(`${run}:stuck`, 3, 60)).toBe(false);
    expect(await redis.ttl(`rl:${run}:stuck`)).toBeGreaterThan(0);
  });

  it("still limits (in memory) when Redis is down", async () => {
    const spy = vi.spyOn(redis, "eval").mockRejectedValue(new Error("ECONNREFUSED"));
    try {
      const results = [];
      for (let i = 0; i < 3; i++) results.push(await allow(`${run}:down`, 2, 60));
      expect(results).toEqual([true, true, false]);
    } finally {
      spy.mockRestore();
    }
  });

  it("starts a new window in memory once the old one ends", () => {
    expect(allowLocally("w", 1, 10, 0)).toBe(true);
    expect(allowLocally("w", 1, 10, 5_000)).toBe(false);
    expect(allowLocally("w", 1, 10, 10_001)).toBe(true);
  });

  it("takes the client address the proxy added, not one the client sent", () => {
    const headers = new Headers({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" });
    vi.stubEnv("TRUSTED_PROXIES", "1");
    expect(clientIp(headers)).toBe("203.0.113.9");
    vi.stubEnv("TRUSTED_PROXIES", "");
    expect(clientIp(headers)).toBe("6.6.6.6");
    vi.unstubAllEnvs();
  });
});
