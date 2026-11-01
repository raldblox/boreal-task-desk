import { timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getDesk } from "@/server/desk";
import { paypalAccounts } from "@/server/paypal-accounts";
import { workerFromSession } from "@/server/session";

// PayPal sends the worker back here after Log in with PayPal; their PayPal email becomes their payout.
export async function GET(request: Request) {
  const worker = await workerFromSession();
  if (!worker || worker.role !== "worker") redirect(`/signin?next=/me`);
  const jar = await cookies();
  const expected = jar.get("paypal_login")?.value ?? "";
  jar.delete({ name: "paypal_login", path: "/paypal" });
  const params = new URL(request.url).searchParams;
  const state = params.get("state") ?? "";
  const code = params.get("code");
  const accounts = paypalAccounts();
  const sameState = expected.length > 0 && state.length === expected.length && timingSafeEqual(Buffer.from(state), Buffer.from(expected));
  if (!accounts || !code || !sameState) redirect("/me?paypal=failed");
  let ok = false;
  try {
    const { email } = await accounts.loggedIn({ code });
    await getDesk().setPayoutAddress(worker, email, "paypal");
    ok = true;
  } catch (error) {
    console.error("[paypal] worker login failed", error);
  }
  redirect(ok ? "/me?paypal=connected" : "/me?paypal=failed");
}
