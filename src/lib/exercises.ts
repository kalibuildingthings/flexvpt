import type { Exercise, ExerciseKind, MuscleGroup } from "./domain";

/** Demo library: legs compounds + shoulder accessories, with one spare of each to allow repicks. */
export const EXERCISES: readonly Exercise[] = [
  {
    id: "back-squat",
    name: "Barbell Back Squat",
    muscleGroup: "legs",
    kind: "compound",
    sets: 4,
    reps: 6,
    targets: ["quads", "glutes"],
    formCues: [
      "Brace your core before you unrack.",
      "Sit down between your hips, knees tracking over your toes.",
      "Drive up through your whole foot, chest stays proud.",
    ],
  },
  {
    id: "romanian-deadlift",
    name: "Romanian Deadlift",
    muscleGroup: "legs",
    kind: "compound",
    sets: 4,
    reps: 8,
    targets: ["hamstrings", "glutes"],
    formCues: [
      "Soft knees, push your hips straight back.",
      "Keep the bar dragging along your thighs.",
      "Stop when your hamstrings are loaded, then squeeze your glutes to stand.",
    ],
  },
  {
    id: "bulgarian-split-squat",
    name: "Bulgarian Split Squat",
    muscleGroup: "legs",
    kind: "compound",
    sets: 3,
    reps: 10,
    targets: ["quads", "glutes"],
    formCues: [
      "Rear foot laces-down on the bench.",
      "Drop straight down, front knee over mid-foot.",
      "Push through the front heel to come up.",
    ],
  },
  {
    id: "lateral-raise",
    name: "Dumbbell Lateral Raise",
    muscleGroup: "shoulders",
    kind: "accessory",
    sets: 3,
    reps: 15,
    targets: ["side-delts"],
    formCues: [
      "Slight bend in the elbows, lead with them.",
      "Raise to shoulder height, no higher.",
      "Control the lowering for two seconds.",
    ],
  },
  {
    id: "rear-delt-fly",
    name: "Rear Delt Fly",
    muscleGroup: "shoulders",
    kind: "accessory",
    sets: 3,
    reps: 15,
    targets: ["rear-delts"],
    formCues: [
      "Hinge forward with a flat back.",
      "Sweep the weights out wide, thumbs slightly down.",
      "Pause at the top, don't shrug.",
    ],
  },
  {
    id: "front-raise",
    name: "Dumbbell Front Raise",
    muscleGroup: "shoulders",
    kind: "accessory",
    sets: 3,
    reps: 12,
    targets: ["front-delts"],
    formCues: [
      "Stand tall, ribs down.",
      "Raise to eye level with straight arms.",
      "No swinging, lower slowly.",
    ],
  },
  {
    id: "face-pull",
    name: "Cable Face Pull",
    muscleGroup: "shoulders",
    kind: "accessory",
    sets: 3,
    reps: 15,
    targets: ["rear-delts", "traps"],
    formCues: [
      "Rope at face height, thumbs pointing back.",
      "Pull toward your eyes, elbows high.",
      "Finish by rotating your hands back.",
    ],
  },
  {
    id: "upright-row",
    name: "Cable Upright Row",
    muscleGroup: "shoulders",
    kind: "accessory",
    sets: 3,
    reps: 12,
    targets: ["side-delts", "traps"],
    formCues: [
      "Wide grip, bar close to your body.",
      "Lead with the elbows up to chest height.",
      "Keep your wrists below your elbows.",
    ],
  },
];

export function findExercise(id: string): Exercise | undefined {
  return EXERCISES.find((exercise) => exercise.id === id);
}

export function listExercises(muscleGroup: MuscleGroup, kind?: ExerciseKind): Exercise[] {
  return EXERCISES.filter(
    (exercise) => exercise.muscleGroup === muscleGroup && (kind === undefined || exercise.kind === kind),
  );
}
