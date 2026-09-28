import { afterEach, describe, expect, it, vi } from "vitest";
import { requestSignedUrl } from "./api-client";

describe("requestSignedUrl", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns the signed url", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ signedUrl: "wss://ok" })));
    await expect(requestSignedUrl()).resolves.toBe("wss://ok");
  });

  it("explains a rate limit instead of a generic failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "rate_limited", issues: [] }, { status: 429 })));
    await expect(requestSignedUrl()).rejects.toThrow("Too many attempts, wait a minute and try again");
  });

  it("does not leak a JSON parse error when the response is HTML", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>ngrok</html>", { status: 502 })));
    await expect(requestSignedUrl()).rejects.toThrow("Could not start a voice session (502)");
  });

  it("wraps a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    await expect(requestSignedUrl()).rejects.toThrow("Could not reach the server");
  });
});
