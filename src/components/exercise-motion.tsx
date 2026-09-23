import Image from "next/image";
import type { Exercise } from "@/lib/domain";
import { exerciseFramePaths } from "@/lib/exercise-media";

/** A two-frame "GIF": the end-position photo cross-fades over the start position. Pure CSS, no JS. */
export function ExerciseMotion({ exercise }: { exercise: Exercise }) {
  const [start, end] = exerciseFramePaths(exercise.id);
  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-muted">
      <Image
        src={start}
        alt={`${exercise.name}, start position`}
        fill
        sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
        className="object-contain"
      />
      <Image
        src={end}
        alt={`${exercise.name}, end position`}
        fill
        sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
        className="object-contain opacity-0 motion-safe:animate-frame-flip"
      />
    </div>
  );
}
