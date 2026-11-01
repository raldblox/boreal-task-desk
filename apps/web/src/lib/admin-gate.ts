import { parseAdminList } from "@boreal/desk/admin";

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
