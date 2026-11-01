import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getDesk } from "@/server/desk";
import { PAYPAL_COOKIE, paypalAccounts, siteUrl } from "@/server/paypal-accounts";
import { workerFromSession } from "@/server/session";

// An owner saves a PayPal account for one of their agents: off to PayPal to approve, back at /paypal/saved.
export async function GET(request: Request, ctx: RouteContext<"/paypal/save/[agentId]">) {
  const { agentId } = await ctx.params;
  const worker = await workerFromSession();
  if (!worker || worker.role !== "worker") redirect(`/signin?next=/me`);
  const accounts = paypalAccounts();
  if (!accounts || !(await accounts.canSaveAccounts())) redirect("/me?paypal=unavailable");
  const agent = await getDesk().ownerAgent(worker.workerId, agentId).catch(() => null);
  if (!agent) redirect("/me?paypal=not-yours");
  const site = siteUrl(request);
  let started: { setupTokenId: string; approveUrl: string } | null = null;
  try {
    started = await accounts.startSaving({ returnUrl: `${site}/paypal/saved`, cancelUrl: `${site}/me?paypal=cancelled` });
  } catch (error) {
    // e.g. 403 NOT_AUTHORIZED when the PayPal app doesn't have "Save payment methods" on.
    console.error("[paypal] starting to save an agent's account failed", error);
  }
  if (!started) redirect("/me?paypal=unavailable");
  (await cookies()).set("paypal_save", `${agent.id}:${started.setupTokenId}`, PAYPAL_COOKIE);
  redirect(started.approveUrl);
}
