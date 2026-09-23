import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { exerciseFramePaths } from "./exercise-media";
import { EXERCISES } from "./exercises";

describe("exercise media", () => {
  it.each(EXERCISES.map((e) => e.id))("%s has both motion frames in public/", (id) => {
    for (const frame of exerciseFramePaths(id)) {
      expect(existsSync(path.join("public", frame)), frame).toBe(true);
    }
  });
});
