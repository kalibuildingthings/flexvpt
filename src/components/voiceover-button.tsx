"use client";

import { Pause, Volume2 } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { Exercise } from "@/lib/domain";
import { voiceoverPath, voiceoverScript } from "@/lib/voiceover";

/** Plays the pre-generated ElevenLabs mp3; falls back to browser speech if the file isn't generated yet. */
export function VoiceoverButton({ exercise }: { exercise: Exercise }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);

  function speakFallback() {
    const utterance = new SpeechSynthesisUtterance(voiceoverScript(exercise));
    utterance.onend = () => setPlaying(false);
    window.speechSynthesis.speak(utterance);
  }

  function stop() {
    audioRef.current?.pause();
    window.speechSynthesis.cancel();
    setPlaying(false);
  }

  function play() {
    setPlaying(true);
    const audio = audioRef.current;
    if (!audio) return speakFallback();
    audio.load(); // restart from the beginning
    audio.play().catch(speakFallback);
  }

  return (
    <>
      <audio ref={audioRef} src={voiceoverPath(exercise.id)} preload="none" onEnded={() => setPlaying(false)} />
      <Button variant="outline" size="sm" onClick={playing ? stop : play}>
        {playing ? <Pause /> : <Volume2 />}
        {playing ? "Stop" : "Form cues"}
      </Button>
    </>
  );
}
