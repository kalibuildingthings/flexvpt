import { MUSCLE_GROUP_SIZE, SPLIT_RULE, type Exercise, type MuscleGroup, type Split } from "./domain";
import { findExercise } from "./exercises";

export type BuildSplitInput = {
  primary: MuscleGroup;
  secondary: MuscleGroup;
  exerciseIds: readonly string[];
};

export type BuildSplitResult = { ok: true; split: Split } | { ok: false; issues: string[] };

const FNV_OFFSET = BigInt("0xcbf29ce484222325");
const FNV_PRIME = BigInt("0x100000001b3");
const MASK_64 = BigInt("0xffffffffffffffff");

/** FNV-1a 64-bit. Synchronous and isomorphic, since the browser also builds splits (show_split). */
function fnv1a64(input: string): string {
  let hash = FNV_OFFSET;
  for (const byte of new TextEncoder().encode(input)) {
    hash = ((hash ^ BigInt(byte)) * FNV_PRIME) & MASK_64;
  }
  return hash.toString(16).padStart(16, "0");
}

/** Deterministic id: a hash of the sorted exercise ids, so the same picks always map to the same Notion rows. */
export function splitIdFor(exerciseIds: readonly string[]): string {
  return `split_${fnv1a64([...exerciseIds].sort().join(","))}`;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function checkGroups(primary: MuscleGroup, secondary: MuscleGroup): string[] {
  if (primary === secondary) return ["primary and secondary must be different muscle groups"];
  if (MUSCLE_GROUP_SIZE[primary] < MUSCLE_GROUP_SIZE[secondary]) {
    return [`${secondary} is the bigger group, so it must be primary (swap primary and secondary)`];
  }
  return [];
}

function resolveExercises(ids: readonly string[]): { exercises: Exercise[]; issues: string[] } {
  const issues: string[] = [];
  const exercises: Exercise[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      issues.push(`duplicate exercise: ${id}`);
      continue;
    }
    seen.add(id);
    const exercise = findExercise(id);
    if (exercise) exercises.push(exercise);
    else issues.push(`unknown exercise id: ${id}`);
  }
  return { exercises, issues };
}

function checkRule(primary: MuscleGroup, secondary: MuscleGroup, exercises: readonly Exercise[]): string[] {
  const issues: string[] = [];
  const compounds = exercises.filter((e) => e.muscleGroup === primary && e.kind === "compound");
  const accessories = exercises.filter((e) => e.muscleGroup === secondary && e.kind === "accessory");
  for (const e of exercises) {
    if (!compounds.includes(e) && !accessories.includes(e)) {
      issues.push(`${e.id} is a ${e.muscleGroup} ${e.kind}; only ${primary} compounds or ${secondary} accessories fit`);
    }
  }
  if (compounds.length !== SPLIT_RULE.compounds) {
    issues.push(`expected ${SPLIT_RULE.compounds} ${primary} compounds, got ${compounds.length}`);
  }
  if (accessories.length !== SPLIT_RULE.accessories) {
    issues.push(`expected ${SPLIT_RULE.accessories} ${secondary} accessories, got ${accessories.length}`);
  }
  return issues;
}

/** Validates picks against the split rule and returns the canonical split (compounds first). */
export function buildSplit({ primary, secondary, exerciseIds }: BuildSplitInput): BuildSplitResult {
  const groupIssues = checkGroups(primary, secondary);
  if (groupIssues.length > 0) return { ok: false, issues: groupIssues };

  const { exercises, issues: idIssues } = resolveExercises(exerciseIds);
  const issues = [...idIssues, ...checkRule(primary, secondary, exercises)];
  if (issues.length > 0) return { ok: false, issues };

  const ordered = [...exercises].sort((a, b) => Number(a.kind === "accessory") - Number(b.kind === "accessory"));
  return {
    ok: true,
    split: {
      id: splitIdFor(exerciseIds),
      title: `${capitalize(primary)} & ${capitalize(secondary)}`,
      primary,
      secondary,
      exercises: ordered,
    },
  };
}
