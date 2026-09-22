import "server-only";
import { timingSafeEqual } from "node:crypto";
import type { z } from "zod";
import { getEnv } from "./env";

export const TOOL_SECRET_HEADER = "x-flexvpt-secret";

export type ParseResult<T> = { ok: true; data: T } | { ok: false; response: Response };

export function errorResponse(status: number, error: string, issues: string[] = []): Response {
  return Response.json({ error, issues }, { status });
}

export async function parseJsonBody<S extends z.ZodType>(
  request: Request,
  schema: S,
): Promise<ParseResult<z.infer<S>>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { ok: false, response: errorResponse(400, "invalid_json") };
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`);
    return { ok: false, response: errorResponse(400, "invalid_request", issues) };
  }
  return { ok: true, data: result.data };
}

/** Agent webhooks carry a shared secret header configured on the ElevenLabs tool. */
export function isAuthorizedTool(request: Request): boolean {
  const provided = Buffer.from(request.headers.get(TOOL_SECRET_HEADER) ?? "");
  const expected = Buffer.from(getEnv("TOOL_WEBHOOK_SECRET"));
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
