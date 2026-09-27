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
});
