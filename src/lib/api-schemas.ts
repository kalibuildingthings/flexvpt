import { z } from "zod";
import { ExerciseKindSchema, MuscleGroupSchema, SplitSchema } from "./domain";

/** LLM tool calls vary in casing ("Legs") and spacing; normalize before validating. */
function normalizeToken(value: unknown): unknown {
  return typeof value === "string" ? value.trim().toLowerCase().replace(/[\s_]+/g, "-") : value;
}

const MuscleGroupInput = z.preprocess(normalizeToken, MuscleGroupSchema);
const ExerciseKindInput = z.preprocess(normalizeToken, ExerciseKindSchema);

/** Accepts ["a", "b"] or "a, b". */
const IdListSchema = z.preprocess(
  (value) => {
    const list = typeof value === "string" ? value.split(",") : value;
    return Array.isArray(list) ? list.map(normalizeToken).filter(Boolean) : list;
  },
  z.array(z.string().min(1)).min(1),
);

/** Agents sometimes snake_case parameter names; map `exercise_ids` onto `exerciseIds`. */
function aliasExerciseIds(body: unknown): unknown {
  if (typeof body !== "object" || body === null || "exerciseIds" in body || !("exercise_ids" in body)) return body;
  const { exercise_ids: exerciseIds, ...rest } = body;
  return { ...rest, exerciseIds };
}

/** POST /api/tools/exercises (agent webhook) */
export const GetExercisesRequestSchema = z.object({
  muscleGroup: MuscleGroupInput,
  kind: ExerciseKindInput.optional(),
});

/** POST /api/tools/split (agent webhook) and the `show_split` client tool */
export const BuildSplitRequestSchema = z.preprocess(
  aliasExerciseIds,
  z.object({
    primary: MuscleGroupInput,
    secondary: MuscleGroupInput,
    exerciseIds: IdListSchema,
  }),
);
export type BuildSplitRequest = z.infer<typeof BuildSplitRequestSchema>;

/** POST /api/split/save (browser, "Save to Notion" button) */
export const SaveSplitRequestSchema = z.object({ split: SplitSchema });

export const SaveSplitResponseSchema = z.object({
  notionPageIds: z.array(z.string()),
  alreadySaved: z.boolean(),
});
export type SaveSplitResponse = z.infer<typeof SaveSplitResponseSchema>;
