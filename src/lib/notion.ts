import "server-only";
import type { CreatePageParameters, QueryDataSourceParameters } from "@notionhq/client";
import type { Exercise, Split } from "./domain";

type QueriedPage = { id: string; properties?: Record<string, unknown> };

/** The slice of the Notion SDK we use; narrow so tests can pass a fake. */
export type NotionClient = {
  dataSources: {
    query(
      args: QueryDataSourceParameters,
    ): Promise<{ results: QueriedPage[]; has_more?: boolean; next_cursor?: string | null }>;
  };
  pages: { create(args: CreatePageParameters): Promise<{ id: string }> };
};

/** Column names in the Notion database. */
export const NOTION_PROPS = {
  name: "Name",
  sets: "Sets",
  reps: "Reps",
  muscleGroup: "Muscle Group",
  splitId: "Split ID",
} as const;

export type SaveSplitResult = { notionPageIds: string[]; alreadySaved: boolean; createdCount: number };

function exerciseRow(dataSourceId: string, splitId: string, exercise: Exercise): CreatePageParameters {
  return {
    parent: { type: "data_source_id", data_source_id: dataSourceId },
    properties: {
      [NOTION_PROPS.name]: { title: [{ text: { content: exercise.name } }] },
      [NOTION_PROPS.sets]: { number: exercise.sets },
      [NOTION_PROPS.reps]: { number: exercise.reps },
      [NOTION_PROPS.muscleGroup]: { select: { name: exercise.muscleGroup } },
      [NOTION_PROPS.splitId]: { rich_text: [{ text: { content: splitId } }] },
    },
  };
}

function titleOf(page: QueriedPage): string | undefined {
  const title = (page.properties?.[NOTION_PROPS.name] as { title?: Array<{ plain_text?: string }> } | undefined)?.title;
  return title?.map((part) => part.plain_text ?? "").join("");
}

/** Existing rows for this split, keyed by exercise name (the row title). Follows pagination. */
async function existingRowsByName(client: NotionClient, dataSourceId: string, splitId: string): Promise<Map<string, string>> {
  const rows = new Map<string, string>();
  let cursor: string | undefined;
  do {
    const page = await client.dataSources.query({
      data_source_id: dataSourceId,
      filter: { property: NOTION_PROPS.splitId, rich_text: { equals: splitId } },
      ...(cursor ? { start_cursor: cursor } : {}),
    });
    for (const result of page.results) {
      const name = titleOf(result);
      if (name && !rows.has(name)) rows.set(name, result.id);
    }
    cursor = page.has_more && page.next_cursor ? page.next_cursor : undefined;
  } while (cursor);
  return rows;
}

/**
 * Check-then-create per exercise, keyed by the deterministic split id.
 * A retry after a partial failure creates only the missing rows, and success is
 * reported only once every exercise has a confirmed Notion page id.
 */
export async function saveSplitToNotion(
  client: NotionClient,
  dataSourceId: string,
  split: Split,
): Promise<SaveSplitResult> {
  const existing = await existingRowsByName(client, dataSourceId, split.id);

  let createdCount = 0;
  const notionPageIds: string[] = [];
  // Sequential keeps row order stable in Notion and stays under its rate limit.
  for (const exercise of split.exercises) {
    let pageId = existing.get(exercise.name);
    if (!pageId) {
      pageId = (await client.pages.create(exerciseRow(dataSourceId, split.id, exercise))).id;
      createdCount += 1;
    }
    notionPageIds.push(pageId);
  }

  const confirmed = notionPageIds.filter(Boolean);
  if (confirmed.length !== split.exercises.length) {
    throw new Error(`Incomplete Notion save for ${split.id}: ${confirmed.length}/${split.exercises.length} rows confirmed`);
  }
  return { notionPageIds, alreadySaved: createdCount === 0, createdCount };
}
