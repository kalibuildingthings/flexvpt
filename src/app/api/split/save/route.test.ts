import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildSplit } from "@/lib/split";
import { CLIENT_KEY, clientHeaders, jsonRequest, uniqueIp } from "../../route-helpers.test-utils";

const query = vi.fn();
const create = vi.fn();
const retrieve = vi.fn();
vi.mock("@/lib/notion-client", () => ({
  createNotionClient: () => ({ dataSources: { query, retrieve }, pages: { create } }),
}));

const SCHEMA = {
  properties: {
    Name: { type: "title" },
    Sets: { type: "number" },
    Reps: { type: "number" },
    "Muscle Group": { type: "select" },
    "Split ID": { type: "rich_text" },
    "Exercise ID": { type: "rich_text" },
  },
};

const { POST } = await import("./route");

function split() {
  const result = buildSplit({
    primary: "legs",
    secondary: "shoulders",
    exerciseIds: ["back-squat", "romanian-deadlift", "lateral-raise", "rear-delt-fly", "face-pull", "front-raise"],
  });
  if (!result.ok) throw new Error("fixture invalid");
  return result.split;
}

describe("POST /api/split/save", () => {
  beforeEach(() => {
    vi.stubEnv("NOTION_DATA_SOURCE_ID", "ds-1");
    vi.stubEnv("NEXT_PUBLIC_CLIENT_API_KEY", CLIENT_KEY);
    query.mockReset().mockResolvedValue({ results: [] });
    retrieve.mockReset().mockResolvedValue(SCHEMA);
    create.mockReset().mockImplementation(async () => ({ id: `page-${create.mock.calls.length}` }));
  });

  it("saves the split and returns page ids", async () => {
    const res = await POST(jsonRequest("/api/split/save", { split: split() }, clientHeaders()));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      notionPageIds: ["page-1", "page-2", "page-3", "page-4", "page-5", "page-6"],
      alreadySaved: false,
      createdCount: 6,
    });
  });

  it("returns existing rows on retry instead of duplicating", async () => {
    query.mockResolvedValue({
      results: split().exercises.map((e, i) => ({
        id: `old-${i}`,
        properties: { "Exercise ID": { type: "rich_text", rich_text: [{ plain_text: e.id }] } },
      })),
    });
    const res = await POST(jsonRequest("/api/split/save", { split: split() }, clientHeaders()));
    expect(await res.json()).toEqual({
      notionPageIds: ["old-0", "old-1", "old-2", "old-3", "old-4", "old-5"],
      alreadySaved: true,
      createdCount: 0,
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("422s on a tampered split that breaks the rule", async () => {
    const tampered = { ...split(), exercises: split().exercises.slice(0, 3) };
    const res = await POST(jsonRequest("/api/split/save", { split: tampered }, clientHeaders()));
    expect(res.status).toBe(422);
    expect(query).not.toHaveBeenCalled();
  });

  it("500s with the exact problem when the Notion database is missing a column", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const properties = Object.fromEntries(Object.entries(SCHEMA.properties).filter(([name]) => name !== "Exercise ID"));
    retrieve.mockResolvedValue({ properties });
    const res = await POST(jsonRequest("/api/split/save", { split: split() }, clientHeaders()));
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string; issues: string[] };
    expect(body.error).toBe("notion_schema_mismatch");
    expect(body.issues.join()).toMatch(/Exercise ID/);
    expect(create).not.toHaveBeenCalled();
  });

  it("502s when Notion fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    retrieve.mockRejectedValue(new Error("boom"));
    const res = await POST(jsonRequest("/api/split/save", { split: split() }, clientHeaders()));
    expect(res.status).toBe(502);
  });

  it("401s without the client key and never touches Notion", async () => {
    const res = await POST(jsonRequest("/api/split/save", { split: split() }, { "x-forwarded-for": uniqueIp() }));
    expect(res.status).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });

  it("bad-key saves don't use up the IP's quota", async () => {
    const ip = uniqueIp();
    for (let i = 0; i < 15; i++) {
      const res = await POST(jsonRequest("/api/split/save", { split: split() }, clientHeaders(ip, "wrong-key-0123456789")));
      expect(res.status).toBe(401);
    }
    const res = await POST(jsonRequest("/api/split/save", { split: split() }, clientHeaders(ip)));
    expect(res.status).toBe(200);
  });

  it("429s after too many saves from one IP", async () => {
    const ip = uniqueIp();
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      statuses.push((await POST(jsonRequest("/api/split/save", { split: split() }, clientHeaders(ip)))).status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(statuses[10]).toBe(429);
  });

  it("413s on an oversized body without reading Notion", async () => {
    const res = await POST(jsonRequest("/api/split/save", { split: split(), padding: "x".repeat(40_000) }, clientHeaders()));
    expect(res.status).toBe(413);
    expect(query).not.toHaveBeenCalled();
  });
});
