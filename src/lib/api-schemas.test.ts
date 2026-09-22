import { describe, expect, it } from "vitest";
import { BuildSplitRequestSchema, GetExercisesRequestSchema } from "./api-schemas";

describe("tool request schemas", () => {
  it("normalizes casing and spacing from the agent", () => {
    expect(
      BuildSplitRequestSchema.parse({
        primary: "Legs",
        secondary: " SHOULDERS ",
        exerciseIds: ["Back Squat", "romanian_deadlift"],
      }),
    ).toEqual({ primary: "legs", secondary: "shoulders", exerciseIds: ["back-squat", "romanian-deadlift"] });
    expect(GetExercisesRequestSchema.parse({ muscleGroup: "Legs", kind: "Compound" })).toEqual({
      muscleGroup: "legs",
      kind: "compound",
    });
  });

  it("drops an unrecognized kind instead of failing", () => {
    expect(GetExercisesRequestSchema.parse({ muscleGroup: "shoulders", kind: "necessary" })).toEqual({
      muscleGroup: "shoulders",
    });
  });

  it("accepts snake_case exercise_ids", () => {
    const parsed = BuildSplitRequestSchema.parse({ primary: "legs", secondary: "shoulders", exercise_ids: "a, b" });
    expect(parsed.exerciseIds).toEqual(["a", "b"]);
  });

  it("still rejects unknown groups", () => {
    expect(BuildSplitRequestSchema.safeParse({ primary: "arms", secondary: "legs", exerciseIds: ["a"] }).success).toBe(
      false,
    );
  });
});
