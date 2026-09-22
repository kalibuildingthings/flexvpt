# FlexVPT – Voice-powered personal trainer

Ask for a workout day by voice ("legs and shoulders"). An ElevenLabs agent builds the split
(2 compounds for the big group + 4 accessories for the secondary group). The split renders as
exercise cards with a muscle diagram and a form-cue voiceover. **Save to Notion** writes one row per exercise.

## Run it

```bash
npm install
cp .env.example .env.local   # fill in values (see below)
npm run voiceovers           # optional: renders public/audio/*.mp3 via ElevenLabs TTS
npm run dev
```

`npm run check` runs typecheck, lint and tests.

If there are no mp3s, the **Form cues** button falls back to browser speech.

## Setup

**Notion.** Create a database with these columns, share it with your integration, and set
`NOTION_DATA_SOURCE_ID` to its data source id:

| Column       | Type   |
| ------------ | ------ |
| Name         | Title  |
| Sets         | Number |
| Reps         | Number |
| Muscle Group | Select |
| Split ID     | Text   |

`Split ID` makes saves idempotent. Saving the same split twice returns the existing rows.

**ElevenLabs agent.** Create an agent with the prompt in `agent/system-prompt.md` and the tools in
`agent/tools.json`. Replace `YOUR_HOST` with the app's public URL (e.g. an ngrok tunnel in dev),
and set the `x-flexvpt-secret` header to `TOOL_WEBHOOK_SECRET`. Enable authentication so the
browser has to use a signed URL.

## How it works

```
voice ─▶ ElevenLabs agent ──webhook──▶ POST /api/tools/exercises   get_exercises
                          ──webhook──▶ POST /api/tools/split       build_split (422 + issues → agent repicks)
                          ──client───▶ show_split (browser)       renders cards
user clicks "Save to Notion" ─────────▶ POST /api/split/save        one row per exercise, deduped by split id
```

| Endpoint | Caller | Body | Response |
| --- | --- | --- | --- |
| `POST /api/tools/exercises` | agent | `{ muscleGroup, kind? }` | `{ exercises: [{ id, name, kind, muscleGroup }] }` |
| `POST /api/tools/split` | agent | `{ primary, secondary, exerciseIds[] }` | `{ split }` or `422 { error: "rule_violation", issues[] }` |
| `POST /api/split/save` | browser | `{ split }` | `{ notionPageIds[], alreadySaved }` |
| `GET /api/agent/signed-url` | browser | – | `{ signedUrl }` |

Agent webhooks require the `x-flexvpt-secret` header. All bodies are validated with Zod, and a bad body gets a
`400 { error, issues[] }`. The save route rebuilds the split from its exercise ids on the server, so a
tampered client payload can't write invalid rows.

## Layout

```
agent/                 agent prompt + tool definitions
scripts/               voiceover generator
src/lib/               domain types, exercise library, split rule, Notion, schemas (framework-free, tested)
src/app/api/           thin route handlers over src/lib
src/components/        VoiceAgent, SplitView, ExerciseCard, MuscleDiagram, SaveToNotionButton
src/components/ui/     shadcn/ui primitives
```

## Scope

Demo library: 3 leg compounds and 5 shoulder accessories, so the agent has something to repick from.
There are no accounts, timers, history or progress tracking.
