import { beforeEach, describe, expect, it, vi } from "vitest";
import { jsonRequest, SECRET } from "../../route-helpers.test-utils";
import { POST } from "./route";

const auth = { "x-flexvpt-secret": SECRET };
const ids = ["back-squat", "romanian-deadlift", "lateral-raise", "rear-delt-fly", "face-pull", "front-raise"];

describe("POST /api/tools/split", () => {
  beforeEach(() => vi.stubEnv("TOOL_WEBHOOK_SECRET", SECRET));

  it("returns the split for valid picks", async () => {
    const res = await POST(jsonRequest("/api/tools/split", { primary: "legs", secondary: "shoulders", exerciseIds: ids }, auth));
    const body = (await res.json()) as { split: { exercises: unknown[] } };
    expect(res.status).toBe(200);
    expect(body.split.exercises).toHaveLength(6);
  });

  it("422s with actionable issues when six valid ids break the rule", async () => {
    const threeCompounds = ["back-squat", "romanian-deadlift", "bulgarian-split-squat", "lateral-raise", "face-pull", "front-raise"];
    const res = await POST(
      jsonRequest("/api/tools/split", { primary: "legs", secondary: "shoulders", exerciseIds: threeCompounds }, auth),
    );
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      error: "rule_violation",
      issues: ["expected 2 legs compounds, got 3", "expected 4 shoulders accessories, got 3"],
    });
  });

  it("400s when there are not exactly six ids", async () => {
    const res = await POST(
      jsonRequest("/api/tools/split", { primary: "legs", secondary: "shoulders", exerciseIds: ids.slice(1) }, auth),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; issues: string[] };
    expect(body.error).toBe("invalid_request");
    expect(body.issues.join()).toMatch(/exerciseIds/);
  });

  it("413s on an oversized body", async () => {
    const huge = { primary: "legs", secondary: "shoulders", exerciseIds: ids, padding: "x".repeat(20_000) };
    const res = await POST(jsonRequest("/api/tools/split", huge, auth));
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "payload_too_large", issues: [] });
  });

  it("rejects calls without the shared secret", async () => {
    const res = await POST(jsonRequest("/api/tools/split", {}, {}));
    expect(res.status).toBe(401);
  });
});
