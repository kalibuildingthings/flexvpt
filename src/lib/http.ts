import "server-only";
import { timingSafeEqual } from "node:crypto";
import type { z } from "zod";
import { getEnv, type Env } from "./env";
import { clientIp, type RateLimiter } from "./rate-limit";

export const TOOL_SECRET_HEADER = "x-flexvpt-secret";
export const CLIENT_KEY_HEADER = "x-flexvpt-client-key";

export type ParseResult<T> = { ok: true; data: T } | { ok: false; response: Response };

export function errorResponse(status: number, error: string, issues: string[] = []): Response {
  return Response.json({ error, issues }, { status });
}

/** Largest JSON body any route accepts. A full split with form cues is ~3 KB. */
export const DEFAULT_MAX_BODY_BYTES = 16 * 1024;

class PayloadTooLargeError extends Error {}

/** Reads the body as text, aborting as soon as it passes maxBytes (content-length can be absent or wrong). */
async function readBodyText(request: Request, maxBytes: number): Promise<string> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new PayloadTooLargeError();
  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new PayloadTooLargeError();
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

export async function parseJsonBody<S extends z.ZodType>(
  request: Request,
  schema: S,
  { maxBytes = DEFAULT_MAX_BODY_BYTES }: { maxBytes?: number } = {},
): Promise<ParseResult<z.infer<S>>> {
  let body: unknown;
  try {
    body = JSON.parse(await readBodyText(request, maxBytes));
  } catch (error) {
    if (error instanceof PayloadTooLargeError) return { ok: false, response: errorResponse(413, "payload_too_large") };
    return { ok: false, response: errorResponse(400, "invalid_json") };
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`);
    return { ok: false, response: errorResponse(400, "invalid_request", issues) };
  }
  return { ok: true, data: result.data };
}

function secretMatches(provided: string | null, expected: string): boolean {
  const a = Buffer.from(provided ?? "");
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

type GuardOptions = {
  header: string;
  secretEnv: keyof Pick<Env, "TOOL_WEBHOOK_SECRET" | "NEXT_PUBLIC_CLIENT_API_KEY">;
  limiter?: RateLimiter;
};

/**
 * Rate limit (per IP), then require a shared-secret header whose value comes from env.
 * Returns an error response to send, or null when the request may proceed.
 */
export function guardRequest(request: Request, { header, secretEnv, limiter }: GuardOptions): Response | null {
  if (limiter) {
    const limited = limiter.check(clientIp(request));
    if (!limited.ok) {
      return Response.json(
        { error: "rate_limited", issues: [] },
        { status: 429, headers: { "retry-after": String(limited.retryAfterSeconds) } },
      );
    }
  }

  let expected: string;
  try {
    expected = getEnv(secretEnv);
  } catch (error) {
    console.error(error);
    return errorResponse(500, "server_misconfigured");
  }
  return secretMatches(request.headers.get(header), expected) ? null : errorResponse(401, "unauthorized");
}

/** Agent webhooks carry a shared secret header configured on the ElevenLabs tool. */
export function guardToolRequest(request: Request): Response | null {
  return guardRequest(request, { header: TOOL_SECRET_HEADER, secretEnv: "TOOL_WEBHOOK_SECRET" });
}
