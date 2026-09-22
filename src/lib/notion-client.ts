import "server-only";
import { Client } from "@notionhq/client";
import { getEnv } from "./env";
import type { NotionClient } from "./notion";

export function createNotionClient(): NotionClient {
  return new Client({ auth: getEnv("NOTION_TOKEN") });
}
