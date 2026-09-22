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

  it("422s with actionable issues when the rule is broken", async () => {
    const res = await POST(
      jsonRequest("/api/tools/split", { primary: "legs", secondary: "shoulders", exerciseIds: ids.slice(1) }, auth),
    );
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "rule_violation", issues: ["expected 2 legs compounds, got 1"] });
  });

  it("rejects calls without the shared secret", async () => {
    const res = await POST(jsonRequest("/api/tools/split", {}, {}));
    expect(res.status).toBe(401);
  });
});
