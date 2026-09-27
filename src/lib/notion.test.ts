import { describe, expect, it } from "vitest";
import type { Split } from "./domain";
import { NOTION_PROPS, saveSplitToNotion, type NotionClient } from "./notion";
import { buildSplit } from "./split";

function validSplit(): Split {
  const result = buildSplit({
    primary: "legs",
    secondary: "shoulders",
    exerciseIds: ["back-squat", "romanian-deadlift", "lateral-raise", "rear-delt-fly", "face-pull", "front-raise"],
  });
  if (!result.ok) throw new Error("fixture invalid");
  return result.split;
}

type Row = { id: string; name: string; splitId: string };

/** In-memory Notion data source that honours the Split ID filter and paginates. */
function fakeNotion({ rows = [] as Row[], failCreateOnCall, pageSize = 100 }: { rows?: Row[]; failCreateOnCall?: number; pageSize?: number } = {}) {
  let createCalls = 0;
  let nextId = rows.length;
  const client: NotionClient = {
    dataSources: {
      async query(args) {
        const filter = args.filter as { rich_text: { equals: string } };
        const matching = rows.filter((row) => row.splitId === filter.rich_text.equals);
        const start = Number(args.start_cursor ?? 0);
        const page = matching.slice(start, start + pageSize);
        const more = start + pageSize < matching.length;
        return {
          results: page.map((row) => ({ id: row.id, properties: { [NOTION_PROPS.name]: { title: [{ plain_text: row.name }] } } })),
          has_more: more,
          next_cursor: more ? String(start + pageSize) : null,
        };
      },
    },
    pages: {
      async create(args) {
        createCalls += 1;
        if (createCalls === failCreateOnCall) throw new Error("Notion 503");
        const props = args.properties as Record<string, { title?: Array<{ text: { content: string } }>; rich_text?: Array<{ text: { content: string } }> }>;
        const row = {
          id: `page-${++nextId}`,
          name: props[NOTION_PROPS.name]?.title?.[0]?.text.content ?? "",
          splitId: props[NOTION_PROPS.splitId]?.rich_text?.[0]?.text.content ?? "",
        };
        rows.push(row);
        return { id: row.id };
      },
    },
  };
  return { client, rows, createCalls: () => createCalls };
}

describe("saveSplitToNotion", () => {
  it("creates one row per exercise, tagged with the deterministic split id", async () => {
    const split = validSplit();
    const notion = fakeNotion();

    const result = await saveSplitToNotion(notion.client, "ds-1", split);

    expect(result).toEqual({
      notionPageIds: ["page-1", "page-2", "page-3", "page-4", "page-5", "page-6"],
      alreadySaved: false,
      createdCount: 6,
    });
    expect(notion.rows.map((r) => r.name)).toEqual(split.exercises.map((e) => e.name));
    expect(new Set(notion.rows.map((r) => r.splitId))).toEqual(new Set([split.id]));
  });

  it("reports alreadySaved only when all six rows exist, and writes nothing", async () => {
    const split = validSplit();
    const notion = fakeNotion({ rows: split.exercises.map((e, i) => ({ id: `old-${i}`, name: e.name, splitId: split.id })) });

    const result = await saveSplitToNotion(notion.client, "ds-1", split);

    expect(result).toEqual({
      notionPageIds: ["old-0", "old-1", "old-2", "old-3", "old-4", "old-5"],
      alreadySaved: true,
      createdCount: 0,
    });
    expect(notion.createCalls()).toBe(0);
  });

  it("repairs a partial save by creating only the missing rows", async () => {
    const split = validSplit();
    const present = split.exercises.slice(0, 3).map((e, i) => ({ id: `old-${i}`, name: e.name, splitId: split.id }));
    const notion = fakeNotion({ rows: present });

    const result = await saveSplitToNotion(notion.client, "ds-1", split);

    expect(result.alreadySaved).toBe(false);
    expect(result.createdCount).toBe(3);
    expect(result.notionPageIds.slice(0, 3)).toEqual(["old-0", "old-1", "old-2"]);
    expect(notion.rows).toHaveLength(6);
    expect(new Set(notion.rows.map((r) => r.name)).size).toBe(6);
  });

  it("fails loudly on a mid-save error, and the retry completes it without duplicates", async () => {
    const split = validSplit();
    const notion = fakeNotion({ failCreateOnCall: 4 });

    await expect(saveSplitToNotion(notion.client, "ds-1", split)).rejects.toThrow("Notion 503");
    expect(notion.rows).toHaveLength(3);

    const retry = await saveSplitToNotion(notion.client, "ds-1", split);
    expect(retry).toMatchObject({ alreadySaved: false, createdCount: 3 });
    expect(notion.rows).toHaveLength(6);
    expect(new Set(notion.rows.map((r) => r.name)).size).toBe(6);
  });

  it("follows query pagination when checking existing rows", async () => {
    const split = validSplit();
    const notion = fakeNotion({
      rows: split.exercises.map((e, i) => ({ id: `old-${i}`, name: e.name, splitId: split.id })),
      pageSize: 4,
    });

    const result = await saveSplitToNotion(notion.client, "ds-1", split);

    expect(result.alreadySaved).toBe(true);
    expect(notion.createCalls()).toBe(0);
  });

  it("refuses to report success if a created row has no confirmed id", async () => {
    const split = validSplit();
    const notion = fakeNotion();
    notion.client.pages.create = async () => ({ id: "" });

    await expect(saveSplitToNotion(notion.client, "ds-1", split)).rejects.toThrow(/incomplete/i);
  });
});
