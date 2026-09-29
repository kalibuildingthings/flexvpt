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
| Exercise ID  | Text   |

Rows are keyed by (`Split ID`, `Exercise ID`). The split id is the sorted exercise ids joined with `+`
(e.g. `back-squat+face-pull+…`). Saving a split creates only the rows that are missing, so saving twice
adds nothing and a retry after a partial failure fills the gaps. Each save first checks the columns
above; if one is missing or has the wrong type it fails with `500 notion_schema_mismatch` naming the
column, and writes nothing.

**ElevenLabs agent.** Create an agent with the prompt in `agent/system-prompt.md` and the tools in
`agent/tools.json`. Replace `YOUR_HOST` with the app's public URL (e.g. an ngrok tunnel in dev),
and set the `x-flexvpt-secret` header to `TOOL_WEBHOOK_SECRET`. Enable authentication so the
browser has to use a signed URL. Set the agent's LLM to GPT 5.6 Luna; the previous model produced
stray words during tool calls.

## How it works

```
voice ─▶ ElevenLabs agent ──webhook──▶ POST /api/tools/exercises   get_exercises
                          ──webhook──▶ POST /api/tools/split       build_split (422 + issues → agent repicks)
                          ──client───▶ show_split (browser)       renders cards
user clicks "Save to Notion" ─────────▶ POST /api/split/save        one row per exercise, deduped by (split id, exercise id)
```

| Endpoint | Caller | Auth header | Body | Success |
| --- | --- | --- | --- | --- |
| `POST /api/tools/exercises` | agent | `x-flexvpt-secret` | `{ muscleGroup, kind? }` | `{ exercises: [{ id, name, kind, muscleGroup }] }` |
| `POST /api/tools/split` | agent | `x-flexvpt-secret` | `{ primary, secondary, exerciseIds[6] }` | `{ split }` |
| `POST /api/split/save` | browser | `x-flexvpt-client-key` | `{ split }` | `{ notionPageIds[], alreadySaved, createdCount }` |
| `GET /api/agent/signed-url` | browser | `x-flexvpt-client-key` | – | `{ signedUrl }` |

Every error is `{ error, issues[] }`:

| Status | `error` | When |
| --- | --- | --- |
| 400 | `invalid_json`, `invalid_request` | Unparseable body, or fails validation (unknown `kind`, malformed id, not exactly 6 ids) |
| 401 | `unauthorized` | Missing or wrong secret / client key |
| 413 | `payload_too_large` | Body over 16 KiB |
| 422 | `rule_violation` | Six valid ids that break the 2 + 4 rule (issues say what to repick) |
| 429 | `rate_limited` | Over the per-IP limit (`Retry-After` header set) |
| 500 | `server_misconfigured`, `notion_schema_mismatch` | Missing env var; Notion columns missing or wrong type |
| 502 / 504 | `upstream_*`, `notion_save_failed` | ElevenLabs or Notion failed / timed out |

The save route rebuilds the split from its exercise ids on the server, so a tampered client payload
can't write invalid rows.

## Security and production limits

This is an MVP. What the safeguards do, and what they don't:

- **The client key is not authentication.** `NEXT_PUBLIC_CLIENT_API_KEY` ships in the page bundle, so
  anyone who loads the page can read it. It only stops drive-by and cross-site callers. There are no
  user accounts; production needs real user auth (sessions or tokens per user) on the browser routes.
- **Rate limits are in memory and per instance.** `signed-url` allows 5 and `save` 10 requests per
  minute per client IP, tracked in a bounded map (10k clients) inside each server process. Only
  requests with a valid key are counted, so bad-key traffic (rejected with 401) can't use up a
  legitimate user's quota. Limits reset
  on restart and are not shared across instances or serverless invocations. Production needs a
  distributed limiter (e.g. Redis) at the edge.
- **Client IP.** Taken from the host's trusted header (`TRUSTED_IP_HEADER`, or `x-vercel-forwarded-for`
  on Vercel); otherwise the rightmost `x-forwarded-for` entry, i.e. the address our proxy (ngrok)
  appended. Earlier, client-supplied entries and `x-real-ip` are ignored. Behind more than one proxy,
  set `TRUSTED_IP_HEADER`.
- **Notion writes are not transactional.** Six rows are created one by one; a failure part-way leaves a
  partial split, which the next save completes. Saves of the same split are serialized within one
  server process, but two instances saving at the same moment can still both create rows, and Notion's
  query results can lag a fresh write. Notion has no unique constraints, so this can't be fully closed
  here. Production should store splits in a real database with a unique `(split_id, exercise_id)`
  constraint, and sync to Notion from there if needed.

## Layout

```
agent/                 agent prompt + tool definitions
scripts/               voiceover generator
src/lib/               domain types, exercise library, split rule, Notion, schemas (framework-free, tested)
src/app/api/           thin route handlers over src/lib
src/components/        VoiceAgent, SplitView, ExerciseCard, MuscleDiagram, SaveToNotionButton
src/components/ui/     shadcn/ui primitives
```

## Credits

Exercise photos in `public/exercises/` come from [free-exercise-db](https://github.com/yuhonas/free-exercise-db) (public domain, Unlicense).

## Scope

Demo library: 3 leg compounds and 5 shoulder accessories, so the agent has something to repick from.
There are no accounts, timers, history or progress tracking.
