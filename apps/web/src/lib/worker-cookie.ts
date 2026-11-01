import { createHmac, timingSafeEqual } from "node:crypto";

// The worker session cookie: `<body>.<signature>`, where the body is base64url JSON
// `{ workerId, exp }` and the signature its HMAC-SHA256 under SESSION_SECRET. Shared by the
// session helpers and the proxy, which checks /admin before anything renders.

export const WORKER_COOKIE = "boreal_worker";

/** The secret, or null when it is missing or too short to trust. */
export function sessionSecret(value: string | undefined): string | null {
  return value && value.length >= 32 ? value : null;
}

const sign = (body: string, key: string) => createHmac("sha256", key).update(body).digest("base64url");

export function signWorkerCookie(workerId: string, exp: number, key: string): string {
  const body = Buffer.from(JSON.stringify({ workerId, exp })).toString("base64url");
  return `${body}.${sign(body, key)}`;
}

/** The worker id in a validly signed, unexpired cookie, else null. Never throws. */
export function readWorkerCookie(value: string | undefined, key: string | null, now = Date.now()): string | null {
  if (!key || !value) return null;
  const [body, signature, extra] = value.split(".");
  if (!body || !signature || extra !== undefined) return null;
  const expected = Buffer.from(sign(body, key));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const { workerId, exp } = JSON.parse(Buffer.from(body, "base64url").toString()) as { workerId?: unknown; exp?: unknown };
    return typeof workerId === "string" && typeof exp === "number" && exp > now ? workerId : null;
  } catch {
    return null;
  }
}
