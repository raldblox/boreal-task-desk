import { randomBytes } from "node:crypto";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { PAYPAL_COOKIE, paypalAccounts, paypalLoginEnabled, siteUrl } from "@/server/paypal-accounts";
import { workerFromSession } from "@/server/session";

/** Where to go after signing in: only a path on this site. */
function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/tasks";
}

// Log in with PayPal. Signed out, it signs the worker in (or up); signed in, it adds PayPal to
// their account. Either way their PayPal email becomes their payout.
export async function GET(request: Request) {
  const worker = await workerFromSession();
  const accounts = paypalAccounts();
  if (!accounts || !paypalLoginEnabled()) redirect(worker ? "/me?paypal=off" : "/signin?paypal=off");
  const state = randomBytes(18).toString("base64url");
  // The return is checked against this: the same state, and for linking the same worker.
  const pending = worker?.role === "worker"
    ? { state, workerId: worker.workerId }
    : { state, next: safeNext(new URL(request.url).searchParams.get("next")) };
  (await cookies()).set("paypal_login", JSON.stringify(pending), PAYPAL_COOKIE);
  redirect(accounts.loginUrl({ redirectUri: `${siteUrl(request)}/paypal/login/done`, state }));
}
