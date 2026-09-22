import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import type { Exercise } from "@/lib/domain";
import { MuscleDiagram } from "./muscle-diagram";
import { VoiceoverButton } from "./voiceover-button";

export function ExerciseCard({ exercise }: { exercise: Exercise }) {
  return (
    <Card className="gap-4">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Badge variant={exercise.kind === "compound" ? "default" : "secondary"}>{exercise.kind}</Badge>
          <Badge variant="outline" className="capitalize">
            {exercise.muscleGroup}
          </Badge>
        </div>
        <CardTitle className="text-lg">{exercise.name}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {exercise.sets} sets × {exercise.reps} reps
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <MuscleDiagram targets={exercise.targets} />
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {exercise.formCues.map((cue) => (
            <li key={cue}>{cue}</li>
          ))}
        </ul>
      </CardContent>
      <CardFooter className="mt-auto">
        <VoiceoverButton exercise={exercise} />
      </CardFooter>
    </Card>
  );
}
