import { randomBytes } from "node:crypto";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { PAYPAL_COOKIE, paypalAccounts, siteUrl } from "@/server/paypal-accounts";
import { workerFromSession } from "@/server/session";

// A worker logs in with PayPal so payouts go to the account PayPal vouches for.
export async function GET(request: Request) {
  const worker = await workerFromSession();
  if (!worker || worker.role !== "worker") redirect(`/signin?next=/me`);
  const accounts = paypalAccounts();
  if (!accounts?.loginEnabled) redirect("/me?paypal=off");
  const state = randomBytes(18).toString("base64url");
  (await cookies()).set("paypal_login", state, PAYPAL_COOKIE);
  redirect(accounts.loginUrl({ redirectUri: `${siteUrl(request)}/paypal/login/done`, state }));
}
