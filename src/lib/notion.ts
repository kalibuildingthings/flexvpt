import "server-only";
import type { CreatePageParameters, QueryDataSourceParameters } from "@notionhq/client";
import type { Exercise, Split } from "./domain";

/** The slice of the Notion SDK we use; narrow so tests can pass a fake. */
export type NotionClient = {
  dataSources: { query(args: QueryDataSourceParameters): Promise<{ results: Array<{ id: string }> }> };
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

export type SaveSplitResult = { notionPageIds: string[]; alreadySaved: boolean };

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

/** Writes one row per exercise. Idempotent per split id: a retry returns the existing rows. */
export async function saveSplitToNotion(
  client: NotionClient,
  dataSourceId: string,
  split: Split,
): Promise<SaveSplitResult> {
  const existing = await client.dataSources.query({
    data_source_id: dataSourceId,
    filter: { property: NOTION_PROPS.splitId, rich_text: { equals: split.id } },
  });
  if (existing.results.length > 0) {
    return { notionPageIds: existing.results.map((page) => page.id), alreadySaved: true };
  }

  const notionPageIds: string[] = [];
  // Sequential keeps row order stable in Notion and stays under its rate limit.
  for (const exercise of split.exercises) {
    const page = await client.pages.create(exerciseRow(dataSourceId, split.id, exercise));
    notionPageIds.push(page.id);
  }
  return { notionPageIds, alreadySaved: false };
}
