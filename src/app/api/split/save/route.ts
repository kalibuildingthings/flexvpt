import { SaveSplitRequestSchema, type SaveSplitResponse } from "@/lib/api-schemas";
import { getEnv } from "@/lib/env";
import { errorResponse, parseJsonBody } from "@/lib/http";
import { createNotionClient } from "@/lib/notion-client";
import { saveSplitToNotion } from "@/lib/notion";
import { buildSplit } from "@/lib/split";

/** Browser "Save to Notion" button. Re-derives the split server-side so only rule-valid data is written. */
export async function POST(request: Request): Promise<Response> {
  const parsed = await parseJsonBody(request, SaveSplitRequestSchema);
  if (!parsed.ok) return parsed.response;

  const { primary, secondary, exercises } = parsed.data.split;
  const result = buildSplit({ primary, secondary, exerciseIds: exercises.map((e) => e.id) });
  if (!result.ok) return errorResponse(422, "rule_violation", result.issues);

  try {
    const saved = await saveSplitToNotion(createNotionClient(), getEnv("NOTION_DATA_SOURCE_ID"), result.split);
    return Response.json(saved satisfies SaveSplitResponse);
  } catch (error) {
    console.error("Notion save failed", error);
    return errorResponse(502, "notion_save_failed");
  }
}
