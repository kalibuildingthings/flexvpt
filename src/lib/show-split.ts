import { BuildSplitRequestSchema } from "./api-schemas";
import type { Split } from "./domain";
import { buildSplit } from "./split";

export type ShowSplitResult = { ok: true; split: Split; reply: string } | { ok: false; reply: string };

/** Handler logic for the `show_split` client tool. `reply` is what the agent hears back. */
export function handleShowSplit(params: unknown): ShowSplitResult {
  const parsed = BuildSplitRequestSchema.safeParse(params);
  if (!parsed.success) return { ok: false, reply: `invalid parameters: ${parsed.error.issues[0]?.message ?? "unknown"}` };

  const result = buildSplit(parsed.data);
  if (!result.ok) return { ok: false, reply: `rule_violation: ${result.issues.join("; ")}` };
  return { ok: true, split: result.split, reply: `Showing ${result.split.exercises.length} exercise cards.` };
}
