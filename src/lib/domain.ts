import { z } from "zod";

export const MUSCLE_GROUPS = ["legs", "shoulders"] as const;
export const MuscleGroupSchema = z.enum(MUSCLE_GROUPS);
export type MuscleGroup = z.infer<typeof MuscleGroupSchema>;

/** Higher = bigger group. The big group of a day supplies the compounds. */
export const MUSCLE_GROUP_SIZE: Record<MuscleGroup, number> = {
  legs: 2,
  shoulders: 1,
};

export const ExerciseKindSchema = z.enum(["compound", "accessory"]);
export type ExerciseKind = z.infer<typeof ExerciseKindSchema>;

export const TARGET_MUSCLES = [
  "quads",
  "glutes",
  "hamstrings",
  "front-delts",
  "side-delts",
  "rear-delts",
  "traps",
] as const;
export const TargetMuscleSchema = z.enum(TARGET_MUSCLES);
export type TargetMuscle = z.infer<typeof TargetMuscleSchema>;

export const ExerciseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  muscleGroup: MuscleGroupSchema,
  kind: ExerciseKindSchema,
  sets: z.number().int().positive(),
  reps: z.number().int().positive(),
  targets: z.array(TargetMuscleSchema).min(1),
  formCues: z.array(z.string().min(1)).min(1),
});
export type Exercise = z.infer<typeof ExerciseSchema>;

export const SplitSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  primary: MuscleGroupSchema,
  secondary: MuscleGroupSchema,
  exercises: z.array(ExerciseSchema),
});
export type Split = z.infer<typeof SplitSchema>;

/** The split rule: 2 compounds from the big group, 4 accessories from the secondary group. */
export const SPLIT_RULE = { compounds: 2, accessories: 4 } as const;
