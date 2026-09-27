import { z } from "zod";
import { ExerciseKindSchema, MuscleGroupSchema, SPLIT_RULE, SplitSchema } from "./domain";

const SPLIT_SIZE = SPLIT_RULE.compounds + SPLIT_RULE.accessories;

/** LLM tool calls vary in casing ("Legs") and spacing; normalize before validating. */
function normalizeToken(value: unknown): unknown {
  return typeof value === "string" ? value.trim().toLowerCase().replace(/[\s_]+/g, "-") : value;
}

const MuscleGroupInput = z.preprocess(normalizeToken, MuscleGroupSchema);
const ExerciseKindInput = z.preprocess(normalizeToken, ExerciseKindSchema);

const EXERCISE_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Accepts ["a", "b"] or "a, b". Every entry is normalized and validated; malformed or empty
 * entries fail the request rather than being dropped, and a split is always exactly six ids.
 */
const IdListSchema = z.preprocess(
  (value) => {
    const list = typeof value === "string" ? value.split(",") : value;
    return Array.isArray(list) ? list.map(normalizeToken) : list;
  },
  z
    .array(z.string().regex(EXERCISE_ID, "must be an exercise id like back-squat"))
    .length(SPLIT_SIZE, `must contain exactly ${SPLIT_SIZE} exercise ids`),
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
  createdCount: z.number().int().nonnegative(),
});
export type SaveSplitResponse = z.infer<typeof SaveSplitResponseSchema>;
