import { describe, expect, it, vi } from "vitest";
import { saveSplitToNotion, type NotionClient } from "./notion";
import { buildSplit } from "./split";

function validSplit() {
  const result = buildSplit({
    primary: "legs",
    secondary: "shoulders",
    exerciseIds: ["back-squat", "romanian-deadlift", "lateral-raise", "rear-delt-fly", "face-pull", "front-raise"],
  });
  if (!result.ok) throw new Error("fixture invalid");
  return result.split;
}

function fakeClient(existingIds: string[] = []) {
  let n = 0;
  const client = {
    dataSources: { query: vi.fn(async () => ({ results: existingIds.map((id) => ({ id })) })) },
    pages: { create: vi.fn(async () => ({ id: `page-${++n}` })) },
  } satisfies NotionClient;
  return client;
}

describe("saveSplitToNotion", () => {
  it("creates one row per exercise with name, sets, reps, muscle group", async () => {
    const client = fakeClient();
    const split = validSplit();

    const result = await saveSplitToNotion(client, "ds-1", split);

    expect(result).toEqual({ notionPageIds: ["page-1", "page-2", "page-3", "page-4", "page-5", "page-6"], alreadySaved: false });
    expect(client.pages.create).toHaveBeenCalledTimes(6);
    expect(client.pages.create.mock.calls[0]).toEqual([
      {
        parent: { type: "data_source_id", data_source_id: "ds-1" },
        properties: {
          Name: { title: [{ text: { content: "Barbell Back Squat" } }] },
          Sets: { number: 4 },
          Reps: { number: 6 },
          "Muscle Group": { select: { name: "legs" } },
          "Split ID": { rich_text: [{ text: { content: split.id } }] },
        },
      },
    ]);
  });

  it("does not write duplicates when the split was already saved", async () => {
    const client = fakeClient(["old-1", "old-2"]);

    const result = await saveSplitToNotion(client, "ds-1", validSplit());

    expect(result).toEqual({ notionPageIds: ["old-1", "old-2"], alreadySaved: true });
    expect(client.pages.create).not.toHaveBeenCalled();
  });
});
