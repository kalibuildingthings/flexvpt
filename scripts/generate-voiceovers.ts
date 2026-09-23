/**
 * One-off: renders each exercise's form cues to public/audio/<id>.mp3 via ElevenLabs TTS.
 * Reads ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID from .env.local (or the shell).
 * Usage: npm run voiceovers
 */
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { EXERCISES } from "../src/lib/exercises";
import { voiceoverPath, voiceoverScript } from "../src/lib/voiceover";

const DEFAULT_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb"; // "George", a stock ElevenLabs voice

async function main(): Promise<void> {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is required");
  const voiceId = process.env.ELEVENLABS_VOICE_ID ?? DEFAULT_VOICE_ID;

  await mkdir(path.join("public", "audio"), { recursive: true });
  for (const exercise of EXERCISES) {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": apiKey, "content-type": "application/json" },
      body: JSON.stringify({ text: voiceoverScript(exercise), model_id: "eleven_multilingual_v2" }),
    });
    if (!response.ok) throw new Error(`TTS failed for ${exercise.id}: ${response.status} ${await response.text()}`);
    const file = path.join("public", voiceoverPath(exercise.id));
    await writeFile(file, Buffer.from(await response.arrayBuffer()));
    console.log(`wrote ${file}`);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
