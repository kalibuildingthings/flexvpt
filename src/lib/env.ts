import "server-only";
import { z } from "zod";

const EnvSchema = z.object({
  ELEVENLABS_API_KEY: z.string().min(1),
  ELEVENLABS_AGENT_ID: z.string().min(1),
  TOOL_WEBHOOK_SECRET: z.string().min(16),
  NOTION_TOKEN: z.string().min(1),
  NOTION_DATA_SOURCE_ID: z.string().min(1),
});
export type Env = z.infer<typeof EnvSchema>;

/** Read lazily so a missing variable fails the request that needs it, not the build. */
export function getEnv<K extends keyof Env>(key: K): Env[K] {
  const result = EnvSchema.shape[key].safeParse(process.env[key]);
  if (!result.success) throw new Error(`Missing or invalid environment variable: ${key}`);
  return result.data;
}
