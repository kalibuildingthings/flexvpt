export const SECRET = "test-secret-0123456789";
export const CLIENT_KEY = "client-key-0123456789";

let ipCounter = 0;
/** A fresh client IP per call, so per-IP rate limits don't leak between tests. */
export function uniqueIp(): string {
  ipCounter += 1;
  return `10.0.${Math.floor(ipCounter / 250)}.${ipCounter % 250}`;
}

/** Headers the browser sends to the client-facing routes. */
export function clientHeaders(ip = uniqueIp(), key = CLIENT_KEY): Record<string, string> {
  return { "x-flexvpt-client-key": key, "x-forwarded-for": ip };
}

export function jsonRequest(url: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`http://localhost${url}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

export function getRequest(url: string, headers: Record<string, string> = {}): Request {
  return new Request(`http://localhost${url}`, { method: "GET", headers });
}
