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
import { createSessionStarter } from "@/lib/session-starter";
import { handleShowSplit } from "@/lib/show-split";

type VoiceAgentProps = { onSplit: (split: Split) => void };

function VoiceControls({ onSplit }: VoiceAgentProps) {
  const { startSession, endSession } = useConversationControls();
  const { status, message } = useConversationStatus();
  const [startError, setStartError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [starter] = useState(() => createSessionStarter({ getSignedUrl: requestSignedUrl, startSession }));
  const [toolError, setToolError] = useState<string | null>(null);

  useConversationClientTool("show_split", (params: Record<string, unknown>) => {
    const result = handleShowSplit(params);
    console.info("[show_split]", params, "->", result.reply);
    if (result.ok) {
      setToolError(null);
      onSplit(result.split);
    } else {
      setToolError(`show_split rejected: ${result.reply}`);
    }
    return result.reply;
  });

  // The SDK asks for the microphone itself, so there is no separate getUserMedia call.
  async function start() {
    if (starter.isStarting()) return;
    setStartError(null);
    setStarting(true);
    const outcome = await starter.start();
    if (outcome.status === "busy") return;
    setStarting(false);
    if (outcome.status === "failed") setStartError(outcome.message);
  }

  const live = status === "connected";
  const error = startError ?? toolError ?? (status === "error" ? (message ?? "Connection error") : null);

  return (
    <div className="flex flex-col items-center gap-3">
      <Button size="lg" onClick={live ? endSession : start} disabled={starting || status === "connecting"}>
        {starting || status === "connecting" ? <Loader2 className="animate-spin" /> : live ? <MicOff /> : <Mic />}
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
    <ConversationProvider
      onUnhandledClientToolCall={(call) =>
        console.warn(`[agent] called client tool "${call.tool_name}", but only "show_split" is registered`)
      }
    >
      <VoiceControls onSplit={onSplit} />
    </ConversationProvider>
  );
}
