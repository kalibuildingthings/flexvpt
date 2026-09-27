import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseJsonBody } from "./http";

const schema = z.object({ a: z.number() });

function streamingRequest(chunks: string[], headers: Record<string, string> = {}): Request {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Request("http://x", { method: "POST", body, headers, duplex: "half" } as RequestInit);
}

describe("parseJsonBody size limit", () => {
  it("rejects a declared content-length over the limit up front", async () => {
    const req = new Request("http://x", { method: "POST", body: '{"a":1}', headers: { "content-length": "999999" } });
    const result = await parseJsonBody(req, schema, { maxBytes: 100 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(413);
  });

  it("rejects a streamed body that exceeds the limit even without content-length", async () => {
    const result = await parseJsonBody(streamingRequest(['{"a":', "1".repeat(200), "}"]), schema, { maxBytes: 100 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(413);
  });

  it("parses a body within the limit", async () => {
    const result = await parseJsonBody(streamingRequest(['{"a":', "1}"]), schema, { maxBytes: 100 });
    expect(result).toEqual({ ok: true, data: { a: 1 } });
  });
});
