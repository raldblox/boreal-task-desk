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
  if (!accounts) redirect("/me?paypal=off");
  const agent = await getDesk().ownerAgent(worker.workerId, agentId).catch(() => null);
  if (!agent) redirect("/me?paypal=not-yours");
  const site = siteUrl(request);
  const { setupTokenId, approveUrl } = await accounts.startSaving({
    returnUrl: `${site}/paypal/saved`,
    cancelUrl: `${site}/me?paypal=cancelled`,
  });
  (await cookies()).set("paypal_save", `${agent.id}:${setupTokenId}`, PAYPAL_COOKIE);
  redirect(approveUrl);
}
