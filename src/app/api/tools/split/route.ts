import { BuildSplitRequestSchema } from "@/lib/api-schemas";
import { errorResponse, isAuthorizedTool, parseJsonBody } from "@/lib/http";
import { buildSplit } from "@/lib/split";

/** Agent webhook `build_split`: validates picks against the 2+4 rule. 422 lists what to repick. */
export async function POST(request: Request): Promise<Response> {
  if (!isAuthorizedTool(request)) return errorResponse(401, "unauthorized");

  const parsed = await parseJsonBody(request, BuildSplitRequestSchema);
  if (!parsed.ok) return parsed.response;

  const result = buildSplit(parsed.data);
  if (!result.ok) return errorResponse(422, "rule_violation", result.issues);
  return Response.json({ split: result.split });
}
