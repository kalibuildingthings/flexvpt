"use client";

import { useState } from "react";
import type { Split } from "@/lib/domain";
import { SplitView } from "./split-view";
import { VoiceAgent } from "./voice-agent";

export function FlexVptApp() {
  const [split, setSplit] = useState<Split | null>(null);

  return (
    <div className="flex flex-col gap-10">
      <VoiceAgent onSplit={setSplit} />
      {split ? (
        <SplitView split={split} />
      ) : (
        <p className="text-center text-sm text-muted-foreground">Your split will appear here.</p>
      )}
    </div>
  );
}
