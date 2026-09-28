import { describe, expect, it } from "vitest";
import { clientIp, createRateLimiter } from "./rate-limit";

function clock(start = 0) {
  let now = start;
  return { now: () => now, advance: (ms: number) => (now += ms) };
}

describe("createRateLimiter", () => {
  it("allows up to the limit per key, then reports when to retry", () => {
    const t = clock();
    const limiter = createRateLimiter({ limit: 2, windowMs: 1000, now: t.now });
    expect(limiter.check("a").ok).toBe(true);
    expect(limiter.check("a").ok).toBe(true);
    t.advance(400);
    expect(limiter.check("a")).toEqual({ ok: false, retryAfterSeconds: 1 });
  });

  it("keeps separate clients in separate buckets", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000, now: clock().now });
    expect(limiter.check("a").ok).toBe(true);
    expect(limiter.check("a").ok).toBe(false);
    expect(limiter.check("b").ok).toBe(true);
  });

  it("expiry: a window resets after windowMs and expired entries are dropped", () => {
    const t = clock();
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000, now: t.now });
    limiter.check("a");
    limiter.check("b");
    expect(limiter.check("a").ok).toBe(false);
    expect(limiter.size()).toBe(2);

    t.advance(1000);
    expect(limiter.check("a").ok).toBe(true);
    expect(limiter.size()).toBe(1); // "b" expired and was pruned
  });

  it("capacity: never tracks more than maxKeys, evicting the oldest window first", () => {
    const t = clock();
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, maxKeys: 3, now: t.now });
    for (const key of ["a", "b", "c"]) {
      limiter.check(key);
      t.advance(1);
    }
    expect(limiter.check("c").ok).toBe(false);

    limiter.check("d"); // evicts "a", the oldest
    limiter.check("e"); // evicts "b"
    expect(limiter.size()).toBe(3);
    expect(limiter.check("c").ok).toBe(false); // still tracked
    expect(limiter.check("a").ok).toBe(true); // evicted, so it starts fresh
  });

  it("stays bounded under a flood of unique keys", () => {
    const t = clock();
    const limiter = createRateLimiter({ limit: 5, windowMs: 60_000, maxKeys: 100, now: t.now });
    for (let i = 0; i < 10_000; i++) limiter.check(`ip-${i}`);
    expect(limiter.size()).toBe(100);
  });
});

describe("clientIp", () => {
  const req = (headers: Record<string, string>) => new Request("http://x", { headers });

  it("uses the configured platform header when present", () => {
    expect(clientIp(req({ "x-vercel-forwarded-for": "7.7.7.7", "x-forwarded-for": "1.1.1.1" }), "x-vercel-forwarded-for")).toBe(
      "7.7.7.7",
    );
  });

  it("falls back to the rightmost x-forwarded-for entry, the one our proxy appended", () => {
    expect(clientIp(req({ "x-forwarded-for": "1.2.3.4" }))).toBe("1.2.3.4");
    expect(clientIp(req({ "x-forwarded-for": "6.6.6.6, 1.2.3.4" }))).toBe("1.2.3.4");
  });

  it("ignores spoofed left-hand x-forwarded-for entries, so spoofing can't dodge the limit", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, now: clock().now });
    const first = clientIp(req({ "x-forwarded-for": "10.0.0.1, 9.9.9.9" }));
    const spoofed = clientIp(req({ "x-forwarded-for": "10.0.0.2, 9.9.9.9" }));
    expect(limiter.check(first).ok).toBe(true);
    expect(limiter.check(spoofed).ok).toBe(false);
  });

  it("does not trust x-real-ip, and shares one bucket when nothing trusted is present", () => {
    expect(clientIp(req({ "x-real-ip": "5.6.7.8" }))).toBe("unknown");
    expect(clientIp(req({}))).toBe("unknown");
  });
});
