import { createHmac, timingSafeEqual } from "node:crypto";

// The second step for /admin: a passkey (a WebAuthn security key such as a YubiKey), on top of
// being signed in as an allowlisted admin. A stolen session cookie alone then opens nothing.
//
// Passing the passkey check sets a short-lived signed cookie naming the admin. This file is
// the pure part (when a passkey is required, and the cookies), shared by the proxy, the pages
// and the actions; the WebAuthn ceremony itself is in app/admin/passkey/actions.ts.

export const PASSKEY_COOKIE = "boreal_admin_key";
export const CHALLENGE_COOKIE = "boreal_admin_challenge";
/** How long one passkey check lasts. */
export const PASSKEY_TTL_MS = 12 * 60 * 60 * 1000;
export const CHALLENGE_TTL_MS = 5 * 60 * 1000;

type Env = Record<string, string | undefined>;

/**
 * Whether /admin needs a passkey for this admin. Always on mainnet, always when
 * ADMIN_PASSKEY=required, and for any admin who has registered one (so registering a key can
 * never be undone by a stolen session). Elsewhere it is optional until they register one.
 */
export function passkeyRequired(env: Env, registered: number): boolean {
  if (registered > 0) return true;
  if (env.ADMIN_PASSKEY === "required") return true;
  return (env.BOREAL_NETWORK || env.CONCORDIUM_NETWORK) === "mainnet";
}

/**
 * The code an admin with no passkey yet must type to register their first one, so that a
 * stolen session can't enrol the thief's key. Set ADMIN_PASSKEY_ENROLL_CODE (16+ characters)
 * for the enrolment, then unset it. Null when unset or too short.
 */
export function enrollCode(env: Env): string | null {
  const code = env.ADMIN_PASSKEY_ENROLL_CODE?.trim();
  return code && code.length >= 16 ? code : null;
}

/** Whether a first passkey may be registered with this code. Without a configured code: only where a passkey isn't required yet. */
export function mayEnrollFirst(env: Env, typed: string): boolean {
  const code = enrollCode(env);
  if (!code) return !passkeyRequired(env, 0);
  const a = Buffer.from(code);
  const b = Buffer.from(typed.trim());
  return a.length === b.length && timingSafeEqual(a, b);
}

const sign = (body: string, key: string) => createHmac("sha256", key).update(body).digest("base64url");

function seal(value: object, key: string): string {
  const body = Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${body}.${sign(body, key)}`;
}

function open<T>(cookie: string | undefined, key: string | null, now: number): (T & { exp: number }) | null {
  if (!key || !cookie) return null;
  const [body, signature, extra] = cookie.split(".");
  if (!body || !signature || extra !== undefined) return null;
  const expected = Buffer.from(sign(body, key));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const value = JSON.parse(Buffer.from(body, "base64url").toString()) as T & { exp?: unknown };
    return typeof value.exp === "number" && value.exp > now ? (value as T & { exp: number }) : null;
  } catch {
    return null;
  }
}

/** The cookie set once an admin has presented a passkey: who, the purpose, and until when. */
export function signPasskeySession(adminRef: string, exp: number, key: string): string {
  return seal({ use: "admin-passkey", ref: adminRef, exp }, key);
}

/** True when the cookie is a valid, unexpired passkey session for this admin. Never throws. */
export function hasPasskeySession(cookie: string | undefined, adminRef: string, key: string | null, now = Date.now()): boolean {
  const value = open<{ use?: string; ref?: string }>(cookie, key, now);
  return value?.use === "admin-passkey" && value.ref === adminRef;
}

/** The challenge of a ceremony in progress, bound to the admin and to registering or signing in. */
export function signChallenge(input: { ref: string; kind: "register" | "authenticate"; challenge: string }, exp: number, key: string): string {
  return seal({ use: "admin-challenge", ...input, exp }, key);
}

export function readChallenge(cookie: string | undefined, adminRef: string, kind: "register" | "authenticate", key: string | null, now = Date.now()): string | null {
  const value = open<{ use?: string; ref?: string; kind?: string; challenge?: string }>(cookie, key, now);
  if (value?.use !== "admin-challenge" || value.ref !== adminRef || value.kind !== kind || typeof value.challenge !== "string") return null;
  return value.challenge;
}
