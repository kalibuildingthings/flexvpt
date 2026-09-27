import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CLIENT_KEY, clientHeaders, getRequest, uniqueIp } from "../../route-helpers.test-utils";
import { GET } from "./route";

const URL_PATH = "/api/agent/signed-url";

describe("GET /api/agent/signed-url", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_CLIENT_API_KEY", CLIENT_KEY);
    vi.stubEnv("ELEVENLABS_API_KEY", "xi-key");
    vi.stubEnv("ELEVENLABS_AGENT_ID", "agent_1");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ signed_url: "wss://signed" })));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("returns the signed url for an authorized client", async () => {
    const res = await GET(getRequest(URL_PATH, clientHeaders()));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ signedUrl: "wss://signed" });
  });

  it("401s without the client key, before calling ElevenLabs", async () => {
    const res = await GET(getRequest(URL_PATH, { "x-forwarded-for": uniqueIp() }));
    expect(res.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("401s with a wrong client key", async () => {
    const res = await GET(getRequest(URL_PATH, clientHeaders(uniqueIp(), "wrong-key-0123456789")));
    expect(res.status).toBe(401);
  });

  it("429s after too many requests from one IP", async () => {
    const ip = uniqueIp();
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await GET(getRequest(URL_PATH, clientHeaders(ip)))).status);
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
    const blocked = await GET(getRequest(URL_PATH, clientHeaders(ip)));
    expect(blocked.headers.get("retry-after")).toMatch(/^\d+$/);
  });

  describe("controlled failures", () => {
    beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));

    async function statusAndBody() {
      const res = await GET(getRequest(URL_PATH, clientHeaders()));
      return { status: res.status, body: await res.json() };
    }

    it("500s with server_misconfigured when ElevenLabs env is missing, without calling out", async () => {
      vi.stubEnv("ELEVENLABS_AGENT_ID", "");
      expect(await statusAndBody()).toEqual({ status: 500, body: { error: "server_misconfigured", issues: [] } });
      expect(fetch).not.toHaveBeenCalled();
    });

    it("502s with upstream_unreachable on a network error", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
      expect(await statusAndBody()).toEqual({ status: 502, body: { error: "upstream_unreachable", issues: [] } });
    });

    it("504s with upstream_timeout when ElevenLabs does not answer in time", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => { throw new DOMException("The operation timed out.", "TimeoutError"); }));
      expect(await statusAndBody()).toEqual({ status: 504, body: { error: "upstream_timeout", issues: [] } });
    });

    it("502s with upstream_error on a non-2xx response", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 401 })));
      expect(await statusAndBody()).toEqual({ status: 502, body: { error: "upstream_error", issues: ["status 401"] } });
    });

    it("502s with upstream_invalid_response on non-JSON", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>oops</html>", { status: 200 })));
      expect(await statusAndBody()).toEqual({ status: 502, body: { error: "upstream_invalid_response", issues: [] } });
    });

    it("502s with upstream_invalid_response when signed_url is missing", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => Response.json({ something: "else" })));
      expect(await statusAndBody()).toEqual({ status: 502, body: { error: "upstream_invalid_response", issues: [] } });
    });

    it("passes a timeout signal to the upstream call", async () => {
      await GET(getRequest(URL_PATH, clientHeaders()));
      const init = vi.mocked(fetch).mock.calls[0]?.[1];
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    });
  });
});
