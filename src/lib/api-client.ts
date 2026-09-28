import { SaveSplitResponseSchema, type SaveSplitResponse } from "./api-schemas";
import type { Split } from "./domain";

/** Must match CLIENT_KEY_HEADER on the server. Public by design: see README "Client key". */
const clientKeyHeaders = { "x-flexvpt-client-key": process.env.NEXT_PUBLIC_CLIENT_API_KEY ?? "" };

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

/** Fetches a signed session URL; every failure becomes an Error with a message fit for the UI. */
export async function requestSignedUrl(): Promise<string> {
  let response: Response;
  try {
    response = await fetch("/api/agent/signed-url", { cache: "no-store", headers: clientKeyHeaders });
  } catch {
    throw new Error("Could not reach the server");
  }
  if (response.status === 429) throw new Error("Too many attempts, wait a minute and try again");

  const body = await readJson(response);
  const signedUrl = typeof body === "object" && body !== null && "signedUrl" in body ? body.signedUrl : undefined;
  if (!response.ok || typeof signedUrl !== "string") {
    throw new Error(`Could not start a voice session (${response.status})`);
  }
  return signedUrl;
}

export async function saveSplit(split: Split): Promise<SaveSplitResponse> {
  const response = await fetch("/api/split/save", {
    method: "POST",
    headers: { "content-type": "application/json", ...clientKeyHeaders },
    body: JSON.stringify({ split }),
  });
  if (!response.ok) throw new Error(`Save failed (${response.status})`);
  return SaveSplitResponseSchema.parse(await response.json());
}
