import type { ReactNode } from "react";
import type { TargetMuscle } from "@/lib/domain";
import { cn } from "@/lib/utils";

type View = "front" | "back";

type Region = { muscle: TargetMuscle; view: View | "both"; shape: ReactNode };

/** Static front/back body map. Coordinates are in a 100x200 viewBox. */
const REGIONS: readonly Region[] = [
  { muscle: "traps", view: "back", shape: <polygon points="38,32 62,32 70,46 30,46" /> },
  {
    muscle: "side-delts",
    view: "both",
    shape: (
      <>
        <ellipse cx="24" cy="44" rx="6" ry="8" />
        <ellipse cx="76" cy="44" rx="6" ry="8" />
      </>
    ),
  },
  ...(["front", "back"] as const).map(
    (view): Region => ({
      muscle: view === "front" ? "front-delts" : "rear-delts",
      view,
      shape: (
        <>
          <ellipse cx="33" cy="45" rx="5" ry="7" />
          <ellipse cx="67" cy="45" rx="5" ry="7" />
        </>
      ),
    }),
  ),
  {
    muscle: "glutes",
    view: "back",
    shape: (
      <>
        <ellipse cx="42" cy="101" rx="9" ry="9" />
        <ellipse cx="58" cy="101" rx="9" ry="9" />
      </>
    ),
  },
  ...(["front", "back"] as const).map(
    (view): Region => ({
      muscle: view === "front" ? "quads" : "hamstrings",
      view,
      shape: (
        <>
          <rect x="33" y="112" width="15" height="40" rx="6" />
          <rect x="52" y="112" width="15" height="40" rx="6" />
        </>
      ),
    }),
  ),
];

function Body() {
  return (
    <g className="fill-muted stroke-border">
      <circle cx="50" cy="18" r="12" />
      <rect x="30" y="34" width="40" height="62" rx="8" />
      <rect x="14" y="48" width="9" height="52" rx="4" />
      <rect x="77" y="48" width="9" height="52" rx="4" />
      <rect x="32" y="92" width="36" height="20" rx="6" />
      <rect x="32" y="108" width="17" height="46" rx="6" />
      <rect x="51" y="108" width="17" height="46" rx="6" />
      <rect x="34" y="156" width="13" height="40" rx="5" />
      <rect x="53" y="156" width="13" height="40" rx="5" />
    </g>
  );
}

function Figure({ view, targets }: { view: View; targets: ReadonlySet<TargetMuscle> }) {
  const regions = REGIONS.filter((region) => region.view === view || region.view === "both");
  return (
    <figure className="flex flex-col items-center gap-1">
      <svg viewBox="0 0 100 200" className="h-32 w-16" aria-hidden="true">
        <Body />
        {regions.map((region) => (
          <g
            key={region.muscle}
            className={cn(targets.has(region.muscle) ? "fill-highlight" : "fill-muted-foreground/15")}
          >
            {region.shape}
          </g>
        ))}
      </svg>
      <figcaption className="text-xs text-muted-foreground capitalize">{view}</figcaption>
    </figure>
  );
}

export function MuscleDiagram({ targets }: { targets: readonly TargetMuscle[] }) {
  const set = new Set(targets);
  return (
    <div role="img" aria-label={`Targets: ${targets.join(", ")}`} className="flex justify-center gap-4">
      <Figure view="front" targets={set} />
      <Figure view="back" targets={set} />
    </div>
  );
}
