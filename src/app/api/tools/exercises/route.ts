import { GetExercisesRequestSchema } from "@/lib/api-schemas";
import { listExercises } from "@/lib/exercises";
import { errorResponse, isAuthorizedTool, parseJsonBody } from "@/lib/http";

/** Agent webhook `get_exercises`: the candidate exercises for one muscle group. */
export async function POST(request: Request): Promise<Response> {
  if (!isAuthorizedTool(request)) return errorResponse(401, "unauthorized");

  const parsed = await parseJsonBody(request, GetExercisesRequestSchema);
  if (!parsed.ok) return parsed.response;

  const exercises = listExercises(parsed.data.muscleGroup, parsed.data.kind).map(({ id, name, kind, muscleGroup }) => ({
    id,
    name,
    kind,
    muscleGroup,
  }));
  return Response.json({ exercises });
}
