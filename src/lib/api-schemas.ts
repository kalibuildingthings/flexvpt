import { z } from "zod";
import { ExerciseKindSchema, MuscleGroupSchema, SplitSchema } from "./domain";

/** LLM tool calls sometimes send a list as "a, b, c"; accept both shapes. */
const IdListSchema = z.preprocess(
  (value) =>
    typeof value === "string"
      ? value
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean)
      : value,
  z.array(z.string().min(1)).min(1),
);

/** POST /api/tools/exercises (agent webhook) */
export const GetExercisesRequestSchema = z.object({
  muscleGroup: MuscleGroupSchema,
  kind: ExerciseKindSchema.optional(),
});

/** POST /api/tools/split (agent webhook) and the `show_split` client tool */
export const BuildSplitRequestSchema = z.object({
  primary: MuscleGroupSchema,
  secondary: MuscleGroupSchema,
  exerciseIds: IdListSchema,
});
export type BuildSplitRequest = z.infer<typeof BuildSplitRequestSchema>;

/** POST /api/split/save (browser, "Save to Notion" button) */
export const SaveSplitRequestSchema = z.object({ split: SplitSchema });

export const SaveSplitResponseSchema = z.object({
  notionPageIds: z.array(z.string()),
  alreadySaved: z.boolean(),
});
export type SaveSplitResponse = z.infer<typeof SaveSplitResponseSchema>;
