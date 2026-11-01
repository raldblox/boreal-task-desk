import { timingSafeEqual } from "node:crypto";

import { DeskError } from "@boreal/desk";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getDesk } from "@/server/desk";
import { paypalAccounts, paypalIdentity } from "@/server/paypal-accounts";
import { startWorkerSession, workerFromSession } from "@/server/session";

interface Pending {
  state?: unknown;
  workerId?: unknown;
  next?: unknown;
}

function readPending(value: string | undefined): Pending {
  try {
    return value ? (JSON.parse(value) as Pending) : {};
  } catch {
    return {};
  }
}

// PayPal sends the worker back here after Log in with PayPal. A signed-out worker is signed in
// by their PayPal account; a signed-in one adds it to their account. Their PayPal email
// becomes their payout either way.
export async function GET(request: Request) {
  const jar = await cookies();
  const pending = readPending(jar.get("paypal_login")?.value);
  jar.delete({ name: "paypal_login", path: "/paypal" });
  const linking = typeof pending.workerId === "string";
  const back = linking ? "/me" : "/signin";
  const params = new URL(request.url).searchParams;
  const state = params.get("state") ?? "";
  const code = params.get("code");
  const expected = typeof pending.state === "string" ? pending.state : "";
  const sameState = expected.length > 0 && state.length === expected.length && timingSafeEqual(Buffer.from(state), Buffer.from(expected));
  const accounts = paypalAccounts();
  if (!accounts || !code || !sameState) redirect(`${back}?paypal=${params.get("error") ? "cancelled" : "failed"}`);

  const worker = await workerFromSession();
  if (linking && (worker?.role !== "worker" || worker.workerId !== pending.workerId)) redirect("/signin?next=/me");

  let outcome: string;
  try {
    const identity = paypalIdentity(await accounts.loggedIn({ code }));
    if (linking) {
      await getDesk().linkPayPal(worker!, identity);
      outcome = "/me?paypal=connected";
    } else {
      const signedIn = await getDesk().signInWithPayPal(identity);
      await startWorkerSession(signedIn.id);
      outcome = typeof pending.next === "string" && pending.next.startsWith("/") && !pending.next.startsWith("//") ? pending.next : "/tasks";
    }
  } catch (error) {
    if (error instanceof DeskError && error.code === "conflict") {
      outcome = `/me?paypal=${/another boreal account/.test(error.message) ? "taken" : "different"}`;
    } else {
      // Never log the PayPal answer itself: it carries the account's email.
      console.error("[paypal] log in failed", error instanceof Error ? error.message : "unknown error");
      outcome = `${back}?paypal=failed`;
    }
  }
  redirect(outcome);
}
