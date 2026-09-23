import { SaveSplitResponseSchema, type SaveSplitResponse } from "./api-schemas";
import type { Split } from "./domain";

export async function requestSignedUrl(): Promise<string> {
  const response = await fetch("/api/agent/signed-url", { cache: "no-store" });
  const body: unknown = await response.json();
  if (!response.ok || typeof body !== "object" || body === null || !("signedUrl" in body)) {
    throw new Error("Could not start a voice session");
  }
  const { signedUrl } = body;
  if (typeof signedUrl !== "string") throw new Error("Could not start a voice session");
  return signedUrl;
}

export async function saveSplit(split: Split): Promise<SaveSplitResponse> {
  const response = await fetch("/api/split/save", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ split }),
  });
  if (!response.ok) throw new Error(`Save failed (${response.status})`);
  return SaveSplitResponseSchema.parse(await response.json());
}
