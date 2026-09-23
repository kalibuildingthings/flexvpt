import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildSplit } from "@/lib/split";
import { jsonRequest } from "../../route-helpers.test-utils";

const query = vi.fn();
const create = vi.fn();
vi.mock("@/lib/notion-client", () => ({
  createNotionClient: () => ({ dataSources: { query }, pages: { create } }),
}));

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
    query.mockReset().mockResolvedValue({ results: [] });
    create.mockReset().mockImplementation(async () => ({ id: `page-${create.mock.calls.length}` }));
  });

  it("saves the split and returns page ids", async () => {
    const res = await POST(jsonRequest("/api/split/save", { split: split() }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      notionPageIds: ["page-1", "page-2", "page-3", "page-4", "page-5", "page-6"],
      alreadySaved: false,
    });
  });

  it("returns existing rows on retry instead of duplicating", async () => {
    query.mockResolvedValue({ results: [{ id: "old-1" }] });
    const res = await POST(jsonRequest("/api/split/save", { split: split() }));
    expect(await res.json()).toEqual({ notionPageIds: ["old-1"], alreadySaved: true });
    expect(create).not.toHaveBeenCalled();
  });

  it("422s on a tampered split that breaks the rule", async () => {
    const tampered = { ...split(), exercises: split().exercises.slice(0, 3) };
    const res = await POST(jsonRequest("/api/split/save", { split: tampered }));
    expect(res.status).toBe(422);
    expect(query).not.toHaveBeenCalled();
  });

  it("502s when Notion fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    query.mockRejectedValue(new Error("boom"));
    const res = await POST(jsonRequest("/api/split/save", { split: split() }));
    expect(res.status).toBe(502);
  });
});
