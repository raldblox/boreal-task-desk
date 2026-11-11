import { parseAdminList } from "@boreal/desk/admin";

import { hasPasskeySession, passkeyRequired } from "./admin-passkey";
import { readWorkerCookie, sessionSecret } from "./worker-cookie";

/** Looks up whether a worker id is an allowlisted admin; the desk's adminForWorker in the app. */
export type AdminLookup = (workerId: string, allowlist: string) => Promise<{ ref: string } | null>;

/**
 * Whether a request may reach /admin: a validly signed, unexpired worker session whose worker
 * is on ADMIN_PSEUDONYMS. Fails closed: no secret, no allowlist, a bad cookie or a failed
 * lookup all mean no. The database is only asked once the cookie checks out.
 */
export async function isAdminRequest(
  cookie: string | undefined,
  env: Record<string, string | undefined>,
  lookup: AdminLookup,
  now = Date.now(),
): Promise<boolean> {
  const allowlist = env.ADMIN_PSEUDONYMS ?? "";
  if (parseAdminList(allowlist).size === 0) return false;
  const workerId = readWorkerCookie(cookie, sessionSecret(env.SESSION_SECRET), now);
  if (!workerId) return false;
  try {
    return (await lookup(workerId, allowlist)) !== null;
  } catch (error) {
    console.error("[admin gate] lookup failed", error);
    return false;
  }
}

/**
 * The gate with the passkey step: `no` for everyone who isn't an allowlisted admin, `passkey`
 * for an admin who still has to present (or register) their passkey, `ok` otherwise. Fails
 * closed: if the passkeys can't be counted, an admin is sent to the passkey step.
 */
export async function adminGate(
  cookies: { session: string | undefined; passkey: string | undefined },
  env: Record<string, string | undefined>,
  lookup: AdminLookup,
  countPasskeys: (adminRef: string) => Promise<number>,
  now = Date.now(),
): Promise<"no" | "passkey" | "ok"> {
  const allowlist = env.ADMIN_PSEUDONYMS ?? "";
  if (parseAdminList(allowlist).size === 0) return "no";
  const secret = sessionSecret(env.SESSION_SECRET);
  const workerId = readWorkerCookie(cookies.session, secret, now);
  if (!workerId) return "no";
  let admin: { ref: string } | null;
  try {
    admin = await lookup(workerId, allowlist);
  } catch (error) {
    console.error("[admin gate] lookup failed", error);
    return "no";
  }
  if (!admin) return "no";
  let registered: number;
  try {
    registered = await countPasskeys(admin.ref);
  } catch (error) {
    console.error("[admin gate] passkey count failed", error);
    return "passkey";
  }
  if (!passkeyRequired(env, registered)) return "ok";
  return hasPasskeySession(cookies.passkey, admin.ref, secret, now) ? "ok" : "passkey";
}
