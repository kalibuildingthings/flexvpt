"use client";

import {
  ConversationProvider,
  useConversationClientTool,
  useConversationControls,
  useConversationStatus,
} from "@elevenlabs/react";
import { Loader2, Mic, MicOff } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { requestSignedUrl } from "@/lib/api-client";
import type { Split } from "@/lib/domain";
import { handleShowSplit } from "@/lib/show-split";

type VoiceAgentProps = { onSplit: (split: Split) => void };

function VoiceControls({ onSplit }: VoiceAgentProps) {
  const { startSession, endSession } = useConversationControls();
  const { status, message } = useConversationStatus();
  const [startError, setStartError] = useState<string | null>(null);

  useConversationClientTool("show_split", (params: Record<string, unknown>) => {
    const result = handleShowSplit(params);
    if (result.ok) onSplit(result.split);
    return result.reply;
  });

  async function start() {
    setStartError(null);
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      startSession({ signedUrl: await requestSignedUrl(), connectionType: "websocket" });
    } catch (error) {
      setStartError(error instanceof Error ? error.message : "Could not start");
    }
  }

  const live = status === "connected";
  const error = startError ?? (status === "error" ? (message ?? "Connection error") : null);

  return (
    <div className="flex flex-col items-center gap-3">
      <Button size="lg" onClick={live ? endSession : start} disabled={status === "connecting"}>
        {status === "connecting" ? <Loader2 className="animate-spin" /> : live ? <MicOff /> : <Mic />}
        {live ? "End session" : "Talk to your trainer"}
      </Button>
      <p className="text-sm text-muted-foreground">
        {live ? 'Listening. Try "legs and shoulders".' : `Status: ${status}`}
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export function VoiceAgent({ onSplit }: VoiceAgentProps) {
  return (
    <ConversationProvider>
      <VoiceControls onSplit={onSplit} />
    </ConversationProvider>
  );
}
