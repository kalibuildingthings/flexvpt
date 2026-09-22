"use client";

import { Check, Loader2, Save } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { saveSplit } from "@/lib/api-client";
import type { Split } from "@/lib/domain";

type SaveState = { status: "idle" } | { status: "saving" } | { status: "saved" } | { status: "error"; message: string };

/** Deliberate user action. Disabled after success; the server also dedupes by split id. Key by split.id to reset. */
export function SaveToNotionButton({ split }: { split: Split }) {
  const [state, setState] = useState<SaveState>({ status: "idle" });

  async function onSave() {
    setState({ status: "saving" });
    try {
      await saveSplit(split);
      setState({ status: "saved" });
    } catch (error) {
      setState({ status: "error", message: error instanceof Error ? error.message : "Save failed" });
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Button onClick={onSave} disabled={state.status === "saving" || state.status === "saved"}>
        {state.status === "saving" && <Loader2 className="animate-spin" />}
        {state.status === "saved" && <Check />}
        {(state.status === "idle" || state.status === "error") && <Save />}
        {state.status === "saving" ? "Saving…" : state.status === "saved" ? "Saved" : "Save to Notion"}
      </Button>
      {state.status === "error" && (
        <p role="alert" className="text-sm text-destructive">
          {state.message}. Try again.
        </p>
      )}
    </div>
  );
}
