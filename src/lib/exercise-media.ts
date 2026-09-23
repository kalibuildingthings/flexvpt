/** Start/end position photos, from the public-domain free-exercise-db (github.com/yuhonas/free-exercise-db). */
export function exerciseFramePaths(exerciseId: string): readonly [start: string, end: string] {
  return [`/exercises/${exerciseId}/0.jpg`, `/exercises/${exerciseId}/1.jpg`];
}
