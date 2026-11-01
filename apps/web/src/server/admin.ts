import "server-only";

import type { Admin } from "@boreal/desk";
import { notFound } from "next/navigation";
import { cache } from "react";

import { getDesk } from "./desk";
import { workerFromSession } from "./session";

// Admin is a role, not a page: a worker (signed in with PayPal or Concordium ID) whose pseudonym is in
// ADMIN_PSEUDONYMS. Everyone else gets a 404, as if /admin didn't exist.

/** The signed-in admin, or null. Checked on the server, once per request. */
export const currentAdmin = cache(async (): Promise<Admin | null> => {
  const worker = await workerFromSession();
  if (worker?.role !== "worker") return null;
  return getDesk().adminFor(worker.workerId, process.env.ADMIN_PSEUDONYMS);
});

/** The signed-in admin; anyone else gets the site's 404. Call it in every admin page and action. */
export async function requireAdmin(): Promise<Admin> {
  const admin = await currentAdmin();
  if (!admin) notFound();
  return admin;
}
