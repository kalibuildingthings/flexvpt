import "server-only";
import type { CreatePageParameters, QueryDataSourceParameters } from "@notionhq/client";
import { z } from "zod";
import type { Exercise, Split } from "./domain";

/**
 * The slice of the Notion SDK we use. Responses are typed `unknown` on purpose: every one is
 * parsed below before use, so a changed database or API shape fails loudly instead of silently.
 */
export type NotionClient = {
  dataSources: {
    retrieve(args: { data_source_id: string }): Promise<unknown>;
    query(args: QueryDataSourceParameters): Promise<unknown>;
  };
  pages: { create(args: CreatePageParameters): Promise<unknown> };
};

/** Column names in the Notion database. */
export const NOTION_PROPS = {
  name: "Name",
  sets: "Sets",
  reps: "Reps",
  muscleGroup: "Muscle Group",
  splitId: "Split ID",
  exerciseId: "Exercise ID",
} as const;

/** Required columns: Notion property type, and the label Notion's UI shows for it. */
const REQUIRED_COLUMNS: ReadonlyArray<{ name: string; type: string; label: string }> = [
  { name: NOTION_PROPS.name, type: "title", label: "Title" },
  { name: NOTION_PROPS.sets, type: "number", label: "Number" },
  { name: NOTION_PROPS.reps, type: "number", label: "Number" },
  { name: NOTION_PROPS.muscleGroup, type: "select", label: "Select" },
  { name: NOTION_PROPS.splitId, type: "rich_text", label: "Text" },
  { name: NOTION_PROPS.exerciseId, type: "rich_text", label: "Text" },
];

/** The database doesn't have the columns this app writes, or Notion returned an unexpected shape. */
export class NotionSchemaError extends Error {
  override name = "NotionSchemaError";
}

export type SaveSplitResult = { notionPageIds: string[]; alreadySaved: boolean; createdCount: number };

const DataSourceSchema = z.object({ properties: z.record(z.string(), z.object({ type: z.string() })) });
const QueryPageSchema = z.object({
  results: z.array(z.unknown()),
  has_more: z.boolean().optional(),
  next_cursor: z.string().nullable().optional(),
});
const RowSchema = z.object({ id: z.string().min(1), properties: z.record(z.string(), z.unknown()) });
const TextPropertySchema = z.object({
  type: z.literal("rich_text"),
  rich_text: z.array(z.object({ plain_text: z.string() })),
});
const CreatedPageSchema = z.object({ id: z.string().min(1) });

async function assertCompatibleSchema(client: NotionClient, dataSourceId: string): Promise<void> {
  const parsed = DataSourceSchema.safeParse(await client.dataSources.retrieve({ data_source_id: dataSourceId }));
  if (!parsed.success) throw new NotionSchemaError("Notion returned an unexpected data source shape");

  const problems = REQUIRED_COLUMNS.flatMap(({ name, type, label }) => {
    const actual = parsed.data.properties[name]?.type;
    if (actual === undefined) return [`missing column "${name}" (${label})`];
    if (actual !== type) return [`column "${name}" must be ${label}, found ${actual}`];
    return [];
  });
  if (problems.length > 0) throw new NotionSchemaError(`Notion database is incompatible: ${problems.join("; ")}`);
}

/** The row's Exercise ID, or undefined if it's blank (e.g. a row added by hand). */
function exerciseIdOf(row: unknown): { pageId: string; exerciseId: string | undefined } {
  const parsedRow = RowSchema.safeParse(row);
  if (!parsedRow.success) throw new NotionSchemaError("Notion returned a row without readable properties");

  const property = TextPropertySchema.safeParse(parsedRow.data.properties[NOTION_PROPS.exerciseId]);
  if (!property.success) {
    throw new NotionSchemaError(`Row ${parsedRow.data.id} has no readable "${NOTION_PROPS.exerciseId}" text property`);
  }
  const value = property.data.rich_text.map((part) => part.plain_text).join("").trim();
  return { pageId: parsedRow.data.id, exerciseId: value || undefined };
}

/** Existing rows for this split, keyed by immutable exercise id. Follows pagination. */
async function existingRowsByExerciseId(
  client: NotionClient,
  dataSourceId: string,
  splitId: string,
): Promise<Map<string, string>> {
  const rows = new Map<string, string>();
  let cursor: string | undefined;
  do {
    const page = QueryPageSchema.safeParse(
      await client.dataSources.query({
        data_source_id: dataSourceId,
        filter: { property: NOTION_PROPS.splitId, rich_text: { equals: splitId } },
        ...(cursor ? { start_cursor: cursor } : {}),
      }),
    );
    if (!page.success) throw new NotionSchemaError("Notion returned an unexpected query response");

    for (const result of page.data.results) {
      const { pageId, exerciseId } = exerciseIdOf(result);
      if (exerciseId && !rows.has(exerciseId)) rows.set(exerciseId, pageId);
    }
    cursor = page.data.has_more && page.data.next_cursor ? page.data.next_cursor : undefined;
  } while (cursor);
  return rows;
}

function exerciseRow(dataSourceId: string, splitId: string, exercise: Exercise): CreatePageParameters {
  return {
    parent: { type: "data_source_id", data_source_id: dataSourceId },
    properties: {
      [NOTION_PROPS.name]: { title: [{ text: { content: exercise.name } }] },
      [NOTION_PROPS.sets]: { number: exercise.sets },
      [NOTION_PROPS.reps]: { number: exercise.reps },
      [NOTION_PROPS.muscleGroup]: { select: { name: exercise.muscleGroup } },
      [NOTION_PROPS.splitId]: { rich_text: [{ text: { content: splitId } }] },
      [NOTION_PROPS.exerciseId]: { rich_text: [{ text: { content: exercise.id } }] },
    },
  };
}

/**
 * Saves of the same split on this server run one at a time, so the second sees the first's rows
 * instead of racing it. Entries are removed when their save settles, so the map stays small.
 *
 * Per-process only: two server instances can still race. Notion has no transactions or unique
 * constraints, so that can't be closed here; a real database with a unique (split_id, exercise_id)
 * constraint would (see README).
 */
const savesInFlight = new Map<string, Promise<void>>();

async function withSplitLock<T>(key: string, run: () => Promise<T>): Promise<T> {
  const previous = savesInFlight.get(key) ?? Promise.resolve();
  let release!: () => void;
  const mine = new Promise<void>((resolve) => (release = resolve));
  const tail = previous.then(() => mine);
  savesInFlight.set(key, tail);
  try {
    await previous;
    return await run();
  } finally {
    release();
    if (savesInFlight.get(key) === tail) savesInFlight.delete(key);
  }
}

/**
 * Check-then-create per exercise, keyed by (split id, exercise id).
 * A retry after a partial failure creates only the missing rows, and success is reported only
 * once every exercise has a Notion page id confirmed by Notion itself.
 */
export async function saveSplitToNotion(
  client: NotionClient,
  dataSourceId: string,
  split: Split,
): Promise<SaveSplitResult> {
  return withSplitLock(`${dataSourceId}:${split.id}`, () => saveUnlocked(client, dataSourceId, split));
}

async function saveUnlocked(client: NotionClient, dataSourceId: string, split: Split): Promise<SaveSplitResult> {
  await assertCompatibleSchema(client, dataSourceId);
  const existing = await existingRowsByExerciseId(client, dataSourceId, split.id);

  let createdCount = 0;
  const notionPageIds: string[] = [];
  // Sequential keeps row order stable in Notion and stays under its rate limit.
  for (const exercise of split.exercises) {
    let pageId = existing.get(exercise.id);
    if (!pageId) {
      const created = CreatedPageSchema.safeParse(await client.pages.create(exerciseRow(dataSourceId, split.id, exercise)));
      if (!created.success) throw new Error(`Notion did not confirm the row for ${exercise.id} in ${split.id}`);
      pageId = created.data.id;
      createdCount += 1;
    }
    notionPageIds.push(pageId);
  }
  return { notionPageIds, alreadySaved: createdCount === 0, createdCount };
}
