import { describe, expect, it } from "vitest";
import { buildSplit, splitIdFor } from "./split";

const VALID = {
  primary: "legs",
  secondary: "shoulders",
  exerciseIds: ["lateral-raise", "back-squat", "rear-delt-fly", "romanian-deadlift", "face-pull", "front-raise"],
} as const;

describe("buildSplit", () => {
  it("builds a valid legs & shoulders split with compounds first", () => {
    const result = buildSplit(VALID);
    if (!result.ok) throw new Error(result.issues.join("; "));
    expect(result.split.title).toBe("Legs & Shoulders");
    expect(result.split.exercises.map((e) => e.kind)).toEqual([
      "compound",
      "compound",
      "accessory",
      "accessory",
      "accessory",
      "accessory",
    ]);
  });

  it("gives the same id regardless of pick order", () => {
    expect(splitIdFor("legs", "shoulders", ["b", "a"])).toBe(splitIdFor("legs", "shoulders", ["a", "b"]));
  });

  it("reports wrong counts so the agent can repick", () => {
    const result = buildSplit({ ...VALID, exerciseIds: ["back-squat", "lateral-raise"] });
    expect(result).toEqual({
      ok: false,
      issues: ["expected 2 legs compounds, got 1", "expected 4 shoulders accessories, got 1"],
    });
  });

  it("flags unknown and duplicate ids", () => {
    const result = buildSplit({ ...VALID, exerciseIds: [...VALID.exerciseIds, "nope", "face-pull"] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toContain("unknown exercise id: nope");
    expect(result.issues).toContain("duplicate exercise: face-pull");
  });

  it("flags too many compounds", () => {
    const result = buildSplit({
      ...VALID,
      exerciseIds: ["back-squat", "romanian-deadlift", "bulgarian-split-squat", "lateral-raise", "face-pull", "front-raise"],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toEqual([
      "expected 2 legs compounds, got 3",
      "expected 4 shoulders accessories, got 3",
    ]);
  });

  it("requires the bigger group as primary", () => {
    const result = buildSplit({ ...VALID, primary: "shoulders", secondary: "legs" });
    expect(result).toEqual({
      ok: false,
      issues: ["legs is the bigger group, so it must be primary (swap primary and secondary)"],
    });
  });

  it("rejects the same group twice", () => {
    expect(buildSplit({ ...VALID, secondary: "legs" }).ok).toBe(false);
  });
});
