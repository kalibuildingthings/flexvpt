import { describe, expect, it } from "vitest";
import type { Split } from "./domain";
import { NOTION_PROPS, NotionSchemaError, saveSplitToNotion, type NotionClient } from "./notion";
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

type Row = { id: string; name: string; exerciseId: string; splitId: string };

const GOOD_SCHEMA: Record<string, { type: string }> = {
  [NOTION_PROPS.name]: { type: "title" },
  [NOTION_PROPS.sets]: { type: "number" },
  [NOTION_PROPS.reps]: { type: "number" },
  [NOTION_PROPS.muscleGroup]: { type: "select" },
  [NOTION_PROPS.splitId]: { type: "rich_text" },
  [NOTION_PROPS.exerciseId]: { type: "rich_text" },
};

const text = (value: string) => ({ type: "rich_text", rich_text: value ? [{ plain_text: value }] : [] });

function pageFor(row: Row) {
  return {
    object: "page",
    id: row.id,
    properties: {
      [NOTION_PROPS.name]: { type: "title", title: [{ plain_text: row.name }] },
      [NOTION_PROPS.exerciseId]: text(row.exerciseId),
      [NOTION_PROPS.splitId]: text(row.splitId),
    },
  };
}

/** In-memory Notion data source: honours the Split ID filter, paginates, and records calls. */
function fakeNotion(
  opts: {
    rows?: Row[];
    schema?: Record<string, { type: string }>;
    failCreateOnCall?: number;
    pageSize?: number;
    pageShape?: (row: Row) => unknown;
  } = {},
) {
  const rows = opts.rows ?? [];
  const pageSize = opts.pageSize ?? 100;
  const calls = { retrieve: 0, query: 0, create: 0 };
  let nextId = rows.length;
  const client: NotionClient = {
    dataSources: {
      async retrieve() {
        calls.retrieve += 1;
        return { object: "data_source", properties: opts.schema ?? GOOD_SCHEMA };
      },
      async query(args) {
        calls.query += 1;
        const filter = args.filter as { rich_text: { equals: string } };
        const matching = rows.filter((row) => row.splitId === filter.rich_text.equals);
        const start = Number(args.start_cursor ?? 0);
        const more = start + pageSize < matching.length;
        return {
          results: matching.slice(start, start + pageSize).map(opts.pageShape ?? pageFor),
          has_more: more,
          next_cursor: more ? String(start + pageSize) : null,
        };
      },
    },
    pages: {
      async create(args) {
        calls.create += 1;
        if (calls.create === opts.failCreateOnCall) throw new Error("Notion 503");
        const props = args.properties as Record<string, { title?: Array<{ text: { content: string } }>; rich_text?: Array<{ text: { content: string } }> }>;
        const row: Row = {
          id: `page-${++nextId}`,
          name: props[NOTION_PROPS.name]?.title?.[0]?.text.content ?? "",
          exerciseId: props[NOTION_PROPS.exerciseId]?.rich_text?.[0]?.text.content ?? "",
          splitId: props[NOTION_PROPS.splitId]?.rich_text?.[0]?.text.content ?? "",
        };
        rows.push(row);
        return { object: "page", id: row.id };
      },
    },
  };
  return { client, rows, calls };
}

const existingRows = (split: Split, count = split.exercises.length): Row[] =>
  split.exercises.slice(0, count).map((e, i) => ({ id: `old-${i}`, name: e.name, exerciseId: e.id, splitId: split.id }));

describe("saveSplitToNotion", () => {
  it("creates one row per exercise, tagged with its immutable exercise id and the split id", async () => {
    const split = validSplit();
    const notion = fakeNotion();

    const result = await saveSplitToNotion(notion.client, "ds-1", split);

    expect(result).toEqual({
      notionPageIds: ["page-1", "page-2", "page-3", "page-4", "page-5", "page-6"],
      alreadySaved: false,
      createdCount: 6,
    });
    expect(notion.rows.map((r) => r.exerciseId)).toEqual(split.exercises.map((e) => e.id));
    expect(new Set(notion.rows.map((r) => r.splitId))).toEqual(new Set([split.id]));
  });

  it("reports alreadySaved only when all six rows exist, and writes nothing", async () => {
    const split = validSplit();
    const notion = fakeNotion({ rows: existingRows(split) });

    const result = await saveSplitToNotion(notion.client, "ds-1", split);

    expect(result).toEqual({
      notionPageIds: ["old-0", "old-1", "old-2", "old-3", "old-4", "old-5"],
      alreadySaved: true,
      createdCount: 0,
    });
    expect(notion.calls.create).toBe(0);
  });

  it("matches rows by exercise id, so renaming a row in Notion doesn't cause a duplicate", async () => {
    const split = validSplit();
    const rows = existingRows(split).map((row) => ({ ...row, name: `${row.name} (renamed)` }));
    const notion = fakeNotion({ rows });

    const result = await saveSplitToNotion(notion.client, "ds-1", split);

    expect(result.alreadySaved).toBe(true);
    expect(notion.calls.create).toBe(0);
  });

  it("repairs a partial save by creating only the missing rows", async () => {
    const split = validSplit();
    const notion = fakeNotion({ rows: existingRows(split, 3) });

    const result = await saveSplitToNotion(notion.client, "ds-1", split);

    expect(result).toMatchObject({ alreadySaved: false, createdCount: 3 });
    expect(result.notionPageIds.slice(0, 3)).toEqual(["old-0", "old-1", "old-2"]);
    expect(new Set(notion.rows.map((r) => r.exerciseId)).size).toBe(6);
  });

  it("fails loudly on a mid-save error, and the retry completes it without duplicates", async () => {
    const split = validSplit();
    const notion = fakeNotion({ failCreateOnCall: 4 });

    await expect(saveSplitToNotion(notion.client, "ds-1", split)).rejects.toThrow("Notion 503");
    expect(notion.rows).toHaveLength(3);

    const retry = await saveSplitToNotion(notion.client, "ds-1", split);
    expect(retry).toMatchObject({ alreadySaved: false, createdCount: 3 });
    expect(notion.rows).toHaveLength(6);
    expect(new Set(notion.rows.map((r) => r.exerciseId)).size).toBe(6);
  });

  it("does not add another row when Notion already holds duplicates for an exercise", async () => {
    const split = validSplit();
    const [first] = existingRows(split, 1);
    if (!first) throw new Error("fixture");
    const notion = fakeNotion({ rows: [first, { ...first, id: "dupe" }] });

    const result = await saveSplitToNotion(notion.client, "ds-1", split);

    expect(result.createdCount).toBe(5);
    expect(result.notionPageIds[0]).toBe("old-0");
    expect(notion.rows.filter((r) => r.exerciseId === first.exerciseId)).toHaveLength(2);
  });

  it("follows query pagination when checking existing rows", async () => {
    const split = validSplit();
    const notion = fakeNotion({ rows: existingRows(split), pageSize: 4 });

    const result = await saveSplitToNotion(notion.client, "ds-1", split);

    expect(result.alreadySaved).toBe(true);
    expect(notion.calls.query).toBe(2);
  });

  describe("incompatible database or malformed responses fail clearly", () => {
    it("names a missing column before reading or writing any rows", async () => {
      const schema = Object.fromEntries(Object.entries(GOOD_SCHEMA).filter(([name]) => name !== NOTION_PROPS.exerciseId));
      const notion = fakeNotion({ schema });

      const error = await saveSplitToNotion(notion.client, "ds-1", validSplit()).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(NotionSchemaError);
      expect((error as Error).message).toMatch(/missing column "Exercise ID" \(Text\)/);
      expect(notion.calls.query).toBe(0);
      expect(notion.calls.create).toBe(0);
    });

    it("names a column with the wrong type", async () => {
      const notion = fakeNotion({ schema: { ...GOOD_SCHEMA, [NOTION_PROPS.sets]: { type: "rich_text" } } });
      await expect(saveSplitToNotion(notion.client, "ds-1", validSplit())).rejects.toThrow(
        /column "Sets" must be Number, found rich_text/,
      );
    });

    it("rejects a row whose Exercise ID property is not text", async () => {
      const split = validSplit();
      const notion = fakeNotion({
        rows: existingRows(split, 1),
        pageShape: (row) => ({ id: row.id, properties: { [NOTION_PROPS.exerciseId]: { type: "number", number: 7 } } }),
      });
      await expect(saveSplitToNotion(notion.client, "ds-1", split)).rejects.toBeInstanceOf(NotionSchemaError);
      expect(notion.calls.create).toBe(0);
    });

    it("rejects a row with no properties at all", async () => {
      const split = validSplit();
      const notion = fakeNotion({ rows: existingRows(split, 1), pageShape: (row) => ({ id: row.id }) });
      await expect(saveSplitToNotion(notion.client, "ds-1", split)).rejects.toBeInstanceOf(NotionSchemaError);
    });

    it("refuses to report success if Notion does not confirm a created row", async () => {
      const notion = fakeNotion();
      notion.client.pages.create = async () => ({ object: "page" });
      await expect(saveSplitToNotion(notion.client, "ds-1", validSplit())).rejects.toThrow(/did not confirm/);
    });
  });
});
