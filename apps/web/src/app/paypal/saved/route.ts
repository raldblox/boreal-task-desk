import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getDesk } from "@/server/desk";
import { paypalAccounts } from "@/server/paypal-accounts";
import { workerFromSession } from "@/server/session";

// PayPal sends the owner back here once they approve saving their account for the agent.
export async function GET(request: Request) {
  const worker = await workerFromSession();
  if (!worker || worker.role !== "worker") redirect(`/signin?next=/me`);
  const jar = await cookies();
  const [agentId, setupTokenId] = (jar.get("paypal_save")?.value ?? "").split(":");
  jar.delete({ name: "paypal_save", path: "/paypal" });
  const approved = new URL(request.url).searchParams.get("approval_token_id");
  const accounts = paypalAccounts();
  if (!accounts || !agentId || !setupTokenId || (approved && approved !== setupTokenId)) redirect("/me?paypal=failed");
  let ok = false;
  try {
    const { vaultId } = await accounts.finishSaving(setupTokenId);
    await getDesk().savePaymentMethod(worker.workerId, agentId, vaultId);
    ok = true;
  } catch (error) {
    console.error("[paypal] saving an agent's account failed", error);
  }
  redirect(ok ? "/me?paypal=saved" : "/me?paypal=failed");
}
