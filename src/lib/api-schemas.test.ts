import { describe, expect, it } from "vitest";
import { BuildSplitRequestSchema, GetExercisesRequestSchema } from "./api-schemas";

const SIX = ["back-squat", "romanian-deadlift", "lateral-raise", "rear-delt-fly", "face-pull", "front-raise"];

function issuesOf(result: { success: boolean; error?: { issues: Array<{ path: PropertyKey[]; message: string }> } }) {
  return result.error?.issues.map((i) => `${i.path.join(".")}: ${i.message}`) ?? [];
}

describe("GetExercisesRequestSchema", () => {
  it("normalizes casing from the agent", () => {
    expect(GetExercisesRequestSchema.parse({ muscleGroup: "Legs", kind: "Compound" })).toEqual({
      muscleGroup: "legs",
      kind: "compound",
    });
  });

  it("rejects an unrecognized kind instead of silently dropping the filter", () => {
    const result = GetExercisesRequestSchema.safeParse({ muscleGroup: "shoulders", kind: "necessary" });
    expect(result.success).toBe(false);
    expect(issuesOf(result)[0]).toMatch(/^kind:/);
  });

  it("still allows kind to be omitted", () => {
    expect(GetExercisesRequestSchema.parse({ muscleGroup: "legs" })).toEqual({ muscleGroup: "legs" });
  });
});

describe("BuildSplitRequestSchema", () => {
  it("normalizes casing and spacing of groups and ids", () => {
    const parsed = BuildSplitRequestSchema.parse({
      primary: "Legs",
      secondary: " SHOULDERS ",
      exerciseIds: ["Back Squat", "romanian_deadlift", ...SIX.slice(2)],
    });
    expect(parsed).toEqual({ primary: "legs", secondary: "shoulders", exerciseIds: SIX });
  });

  it("accepts a comma-separated string and snake_case exercise_ids", () => {
    const parsed = BuildSplitRequestSchema.parse({ primary: "legs", secondary: "shoulders", exercise_ids: SIX.join(", ") });
    expect(parsed.exerciseIds).toEqual(SIX);
  });

  it("requires exactly six ids", () => {
    for (const ids of [SIX.slice(0, 5), [...SIX, "upright-row"]]) {
      const result = BuildSplitRequestSchema.safeParse({ primary: "legs", secondary: "shoulders", exerciseIds: ids });
      expect(result.success).toBe(false);
      expect(issuesOf(result).join()).toMatch(/exerciseIds/);
    }
  });

  it("rejects malformed ids instead of dropping them", () => {
    const bad: unknown[] = [
      [...SIX.slice(0, 5), ""],
      [...SIX.slice(0, 5), null],
      [...SIX.slice(0, 5), 42],
      [...SIX.slice(0, 5), "back squat!"],
      `${SIX.slice(0, 5).join(",")},,`,
    ];
    for (const exerciseIds of bad) {
      const result = BuildSplitRequestSchema.safeParse({ primary: "legs", secondary: "shoulders", exerciseIds });
      expect(result.success, JSON.stringify(exerciseIds)).toBe(false);
    }
  });

  it("still rejects unknown groups", () => {
    expect(BuildSplitRequestSchema.safeParse({ primary: "arms", secondary: "legs", exerciseIds: SIX }).success).toBe(false);
  });
});
