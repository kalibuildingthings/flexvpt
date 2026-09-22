import type { Split } from "@/lib/domain";
import { ExerciseCard } from "./exercise-card";
import { SaveToNotionButton } from "./save-to-notion-button";

export function SplitView({ split }: { split: Split }) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold">{split.title}</h2>
        <SaveToNotionButton key={split.id} split={split} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {split.exercises.map((exercise) => (
          <ExerciseCard key={exercise.id} exercise={exercise} />
        ))}
      </div>
    </section>
  );
}
