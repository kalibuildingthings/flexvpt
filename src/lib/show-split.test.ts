import { describe, expect, it } from "vitest";
import { handleShowSplit } from "./show-split";

describe("handleShowSplit", () => {
  it("accepts a comma-separated id string from the agent", () => {
    const result = handleShowSplit({
      primary: "legs",
      secondary: "shoulders",
      exerciseIds: "back-squat, romanian-deadlift, lateral-raise, rear-delt-fly, face-pull, front-raise",
    });
    expect(result.ok).toBe(true);
    expect(result.reply).toBe("Showing 6 exercise cards.");
  });

  it("returns a rule_violation reply the agent can act on", () => {
    const result = handleShowSplit({ primary: "legs", secondary: "shoulders", exerciseIds: ["back-squat"] });
    expect(result).toEqual({
      ok: false,
      reply: "rule_violation: expected 2 legs compounds, got 1; expected 4 shoulders accessories, got 0",
    });
  });

  it("rejects malformed params", () => {
    expect(handleShowSplit({ primary: "arms" }).ok).toBe(false);
  });
});
