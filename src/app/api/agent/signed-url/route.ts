import { guardSignedUrlRequest } from "@/lib/client-route-limits";
import { getEnv } from "@/lib/env";
import { errorResponse } from "@/lib/http";

const SIGNED_URL_ENDPOINT = "https://api.elevenlabs.io/v1/convai/conversation/get-signed-url";
const UPSTREAM_TIMEOUT_MS = 10_000;

function readConfig(): { agentId: string; apiKey: string } | null {
  try {
    return { agentId: getEnv("ELEVENLABS_AGENT_ID"), apiKey: getEnv("ELEVENLABS_API_KEY") };
  } catch (error) {
    console.error(error);
    return null;
  }
}

function isTimeout(error: unknown): boolean {
  return error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError");
}

/**
 * Keeps the ElevenLabs API key server-side; the browser starts the session with this URL.
 * Every failure maps to a stable { error, issues } body: 500 config, 502 upstream, 504 timeout.
 */
export async function GET(request: Request): Promise<Response> {
  const denied = guardSignedUrlRequest(request);
  if (denied) return denied;

  const config = readConfig();
  if (!config) return errorResponse(500, "server_misconfigured");

  let upstream: Response;
  try {
    upstream = await fetch(`${SIGNED_URL_ENDPOINT}?agent_id=${encodeURIComponent(config.agentId)}`, {
      headers: { "xi-api-key": config.apiKey },
      cache: "no-store",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (error) {
    console.error("ElevenLabs signed-url request failed", error);
    return isTimeout(error) ? errorResponse(504, "upstream_timeout") : errorResponse(502, "upstream_unreachable");
  }

  if (!upstream.ok) {
    console.error("ElevenLabs signed-url returned", upstream.status);
    return errorResponse(502, "upstream_error", [`status ${upstream.status}`]);
  }

  let body: unknown;
  try {
    body = await upstream.json();
  } catch {
    return errorResponse(502, "upstream_invalid_response");
  }
  const signedUrl =
    typeof body === "object" && body !== null && "signed_url" in body ? body.signed_url : undefined;
  if (typeof signedUrl !== "string" || signedUrl.length === 0) return errorResponse(502, "upstream_invalid_response");

  return Response.json({ signedUrl }, { headers: { "cache-control": "no-store" } });
}
