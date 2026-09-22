import type { Exercise } from "./domain";

export function voiceoverPath(exerciseId: string): string {
  return `/audio/${exerciseId}.mp3`;
}

/** The exact text voiced for an exercise; shared by the generator script and the browser fallback. */
export function voiceoverScript(exercise: Exercise): string {
  return `${exercise.name}. ${exercise.formCues.join(" ")}`;
}
