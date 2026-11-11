import "server-only";

import type { Admin } from "@boreal/desk";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";

import { hasPasskeySession, PASSKEY_COOKIE, passkeyRequired } from "@/lib/admin-passkey";
import { sessionSecret } from "@/lib/worker-cookie";

import { getDesk } from "./desk";
import { workerFromSession } from "./session";

// Admin is a role, not a page: a worker (signed in with PayPal or Concordium ID) whose pseudonym is in
// ADMIN_PSEUDONYMS, who has also presented their passkey where one is required (always on
// mainnet). Everyone else gets a 404, as if /admin didn't exist.

/**
 * The signed-in, allowlisted admin and where they stand with the passkey check, or null for
 * everyone else. Only the passkey page and its actions act on someone who hasn't passed.
 */
export const adminPasskeyState = cache(async (): Promise<{ admin: Admin; registered: number; required: boolean; passed: boolean } | null> => {
  const worker = await workerFromSession();
  if (worker?.role !== "worker") return null;
  const admin = await getDesk().adminFor(worker.workerId, process.env.ADMIN_PSEUDONYMS);
  if (!admin) return null;
  const registered = (await getDesk().adminPasskeys(admin.ref)).length;
  const passed = hasPasskeySession((await cookies()).get(PASSKEY_COOKIE)?.value, admin.ref, sessionSecret(process.env.SESSION_SECRET));
  return { admin, registered, required: passkeyRequired(process.env, registered), passed };
});

/** The signed-in admin, passkey check included, or null. Checked on the server, once per request. */
export const currentAdmin = cache(async (): Promise<Admin | null> => {
  const state = await adminPasskeyState();
  if (!state || (state.required && !state.passed)) return null;
  return state.admin;
});

/** The signed-in admin; anyone else gets the site's 404. Call it in every admin page and action. */
export async function requireAdmin(): Promise<Admin> {
  const admin = await currentAdmin();
  if (!admin) notFound();
  return admin;
}
