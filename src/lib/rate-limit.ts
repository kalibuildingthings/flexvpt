export type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

export type RateLimiter = { check(key: string): RateLimitResult; size(): number };

type Options = { limit: number; windowMs: number; maxKeys?: number; now?: () => number };

/**
 * Fixed-window counter per key, bounded to maxKeys entries.
 *
 * Entries are re-inserted whenever their window starts, so Map iteration order is window-start
 * order: expired entries are pruned from the front, and at capacity the oldest window is evicted.
 * Each check is amortized O(1). In-memory, so limits are per server instance (see README).
 */
export function createRateLimiter({ limit, windowMs, maxKeys = 10_000, now = Date.now }: Options): RateLimiter {
  const windows = new Map<string, { start: number; count: number }>();

  function pruneExpired(at: number) {
    for (const [key, entry] of windows) {
      if (at - entry.start < windowMs) break;
      windows.delete(key);
    }
  }

  return {
    size: () => windows.size,
    check(key) {
      const at = now();
      pruneExpired(at);

      const entry = windows.get(key);
      if (entry) {
        if (entry.count >= limit) {
          return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((entry.start + windowMs - at) / 1000)) };
        }
        entry.count += 1;
        return { ok: true };
      }

      if (windows.size >= maxKeys) {
        const oldest = windows.keys().next();
        if (!oldest.done) windows.delete(oldest.value);
      }
      windows.set(key, { start: at, count: 1 });
      return { ok: true };
    },
  };
}

/**
 * Header the hosting platform sets itself and clients cannot forge. `TRUSTED_IP_HEADER` overrides;
 * on Vercel it defaults to `x-vercel-forwarded-for`.
 */
function defaultTrustedHeader(): string | undefined {
  return process.env.TRUSTED_IP_HEADER || (process.env.VERCEL ? "x-vercel-forwarded-for" : undefined);
}

/**
 * Client IP for rate limiting.
 * 1. The platform's trusted header, when configured and present.
 * 2. Otherwise the rightmost `x-forwarded-for` entry: the address our nearest proxy (e.g. ngrok)
 *    appended. Entries to its left are client-supplied and ignored, so they can't be used to dodge limits.
 * 3. Otherwise one shared "unknown" bucket. `x-real-ip` is not trusted.
 */
export function clientIp(request: Request, trustedHeader = defaultTrustedHeader()): string {
  if (trustedHeader) {
    const value = request.headers.get(trustedHeader)?.split(",")[0]?.trim();
    if (value) return value;
  }
  const forwarded = request.headers
    .get("x-forwarded-for")
    ?.split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return forwarded?.at(-1) ?? "unknown";
}
