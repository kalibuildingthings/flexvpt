import { getEnv } from "@/lib/env";
import { errorResponse } from "@/lib/http";

const SIGNED_URL_ENDPOINT = "https://api.elevenlabs.io/v1/convai/conversation/get-signed-url";

/** Keeps the ElevenLabs API key server-side; the browser starts the session with this URL. */
export async function GET(): Promise<Response> {
  const url = `${SIGNED_URL_ENDPOINT}?agent_id=${encodeURIComponent(getEnv("ELEVENLABS_AGENT_ID"))}`;
  const upstream = await fetch(url, {
    headers: { "xi-api-key": getEnv("ELEVENLABS_API_KEY") },
    cache: "no-store",
  });
  if (!upstream.ok) return errorResponse(502, "signed_url_failed");

  const body: unknown = await upstream.json();
  const signedUrl =
    typeof body === "object" && body !== null && "signed_url" in body ? body.signed_url : undefined;
  if (typeof signedUrl !== "string") return errorResponse(502, "signed_url_failed");
  return Response.json({ signedUrl });
}
