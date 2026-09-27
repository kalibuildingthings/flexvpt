export type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

export type RateLimiter = { check(key: string): RateLimitResult };

type Options = { limit: number; windowMs: number; now?: () => number };

/**
 * Fixed-window counter per key. In-memory, so limits are per server instance;
 * enough to stop a single client hammering the demo, not a distributed limiter.
 */
export function createRateLimiter({ limit, windowMs, now = Date.now }: Options): RateLimiter {
  const windows = new Map<string, { start: number; count: number }>();

  function prune(at: number) {
    for (const [key, entry] of windows) if (at - entry.start >= windowMs) windows.delete(key);
  }

  return {
    check(key) {
      const at = now();
      if (windows.size > 10_000) prune(at);
      const entry = windows.get(key);
      if (!entry || at - entry.start >= windowMs) {
        windows.set(key, { start: at, count: 1 });
        return { ok: true };
      }
      if (entry.count >= limit) {
        return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((entry.start + windowMs - at) / 1000)) };
      }
      entry.count += 1;
      return { ok: true };
    },
  };
}

/** Best-effort client IP behind a proxy (ngrok, Vercel). Unknown clients share one bucket. */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
}
