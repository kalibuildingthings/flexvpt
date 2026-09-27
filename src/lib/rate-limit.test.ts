import { describe, expect, it } from "vitest";
import { clientIp, createRateLimiter } from "./rate-limit";

describe("createRateLimiter", () => {
  it("allows up to the limit per key, then blocks until the window resets", () => {
    let now = 0;
    const limiter = createRateLimiter({ limit: 2, windowMs: 1000, now: () => now });

    expect(limiter.check("a").ok).toBe(true);
    expect(limiter.check("a").ok).toBe(true);
    expect(limiter.check("a")).toEqual({ ok: false, retryAfterSeconds: 1 });
    expect(limiter.check("b").ok).toBe(true);

    now = 1000;
    expect(limiter.check("a").ok).toBe(true);
  });
});

describe("clientIp", () => {
  it("uses the first x-forwarded-for entry", () => {
    const req = new Request("http://x", { headers: { "x-forwarded-for": "1.2.3.4, 10.0.0.1" } });
    expect(clientIp(req)).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip, then a shared bucket", () => {
    expect(clientIp(new Request("http://x", { headers: { "x-real-ip": "5.6.7.8" } }))).toBe("5.6.7.8");
    expect(clientIp(new Request("http://x"))).toBe("unknown");
  });
});
