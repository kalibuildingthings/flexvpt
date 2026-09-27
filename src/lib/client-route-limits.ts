import "server-only";
import { CLIENT_KEY_HEADER, guardRequest } from "./http";
import { createRateLimiter } from "./rate-limit";

/** Per-IP budgets for the routes the browser calls. Minting sessions costs ElevenLabs credits. */
const signedUrlLimiter = createRateLimiter({ limit: 5, windowMs: 60_000 });
const saveLimiter = createRateLimiter({ limit: 10, windowMs: 60_000 });

export function guardSignedUrlRequest(request: Request): Response | null {
  return guardRequest(request, { header: CLIENT_KEY_HEADER, secretEnv: "NEXT_PUBLIC_CLIENT_API_KEY", limiter: signedUrlLimiter });
}

export function guardSaveRequest(request: Request): Response | null {
  return guardRequest(request, { header: CLIENT_KEY_HEADER, secretEnv: "NEXT_PUBLIC_CLIENT_API_KEY", limiter: saveLimiter });
}
