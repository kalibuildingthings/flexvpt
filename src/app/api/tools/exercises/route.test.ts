import { beforeEach, describe, expect, it, vi } from "vitest";
import { jsonRequest, SECRET } from "../../route-helpers.test-utils";
import { POST } from "./route";

const auth = { "x-flexvpt-secret": SECRET };

describe("POST /api/tools/exercises", () => {
  beforeEach(() => vi.stubEnv("TOOL_WEBHOOK_SECRET", SECRET));

  it("rejects calls without the shared secret", async () => {
    const res = await POST(jsonRequest("/api/tools/exercises", { muscleGroup: "legs" }, { "x-flexvpt-secret": "wrong" }));
    expect(res.status).toBe(401);
  });

  it("lists exercises filtered by group and kind", async () => {
    const res = await POST(jsonRequest("/api/tools/exercises", { muscleGroup: "shoulders", kind: "accessory" }, auth));
    const body = (await res.json()) as { exercises: Array<{ id: string; kind: string }> };
    expect(res.status).toBe(200);
    expect(body.exercises).toHaveLength(5);
    expect(body.exercises.every((e) => e.kind === "accessory")).toBe(true);
  });

  it("400s on an unsupported muscle group", async () => {
    const res = await POST(jsonRequest("/api/tools/exercises", { muscleGroup: "arms" }, auth));
    expect(res.status).toBe(400);
  });

  it("400s on malformed JSON", async () => {
    const res = await POST(jsonRequest("/api/tools/exercises", "{nope", auth));
    expect(await res.json()).toEqual({ error: "invalid_json", issues: [] });
  });
});
