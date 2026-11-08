"use server";

import { BadgeError, badgeProofMessage, checkRegistryBadge, verifyAccountSignature } from "@boreal/concordium";
import { DeskError, type VerifiedBadge } from "@boreal/desk";
import { redirect } from "next/navigation";

import { getDesk } from "@/server/desk";
import { workerFromSession } from "@/server/session";
import { getAddons } from "@/server/addons";

export type LinkActionState = { error?: string } | null;

/** Dollars typed by the owner, as whole cents. */
const cents = (value: FormDataEntryValue | null) => Math.round(Number(String(value ?? "").replace(/[$,\s]/g, "")) * 100);

/**
 * Checks the badge the owner gave: it must be an active entry in the Agent Registry (on
 * mainnet, where the registry lives), and the account that owns it must have signed this
 * link's message.
 */
async function verifyBadge(code: string, form: FormData): Promise<VerifiedBadge | undefined> {
  const badge = String(form.get("badge") ?? "").trim();
  if (!badge) return undefined;
  if (!getAddons().on("concordium")) {
    throw new BadgeError("the Verified by Concordium badge needs the Concordium integration, which isn't on here; approve without it");
  }
  const account = String(form.get("badgeAccount") ?? "");
  const signature = String(form.get("badgeSignature") ?? "");
  if (!account || !signature) throw new BadgeError("sign with the Concordium wallet that owns the badge first");
  const entry = await checkRegistryBadge(badge, "mainnet");
  if (entry.ownerAccount !== account) {
    throw new BadgeError("the wallet account you signed with doesn't own that badge; sign with the owner account");
  }
  const valid = await verifyAccountSignature("mainnet", account, badgeProofMessage({ code, badge: entry.tokenAddress }), JSON.parse(signature));
  if (!valid) throw new BadgeError("that signature doesn't check out; sign again");
  return { registryId: entry.tokenAddress, network: "mainnet", ownerAccount: account };
}

export async function approveLink(code: string, _prev: LinkActionState, form: FormData): Promise<LinkActionState> {
  const worker = await workerFromSession();
  if (!worker || worker.role !== "worker") return { error: "Your session has ended. Sign in again." };
  let agentId: string;
  try {
    const replaceAgentId = String(form.get("replaceAgentId") ?? "");
    ({ agentId } = await getDesk().approveAgentLink(worker.workerId, code, {
      name: String(form.get("name") ?? ""),
      maxTaskBudget: cents(form.get("maxTaskBudget")),
      maxDailySpend: cents(form.get("maxDailySpend")),
      replaceAgentId: replaceAgentId && replaceAgentId !== "new" ? replaceAgentId : undefined,
      badge: await verifyBadge(code, form),
    }));
  } catch (error) {
    if (error instanceof DeskError || error instanceof BadgeError) return { error: error.message };
    console.error("[link] approve failed", error);
    return { error: "Something went wrong. Try again." };
  }
  redirect(`/link/${code}?done=approved&agent=${agentId}`);
}

export async function denyLink(code: string): Promise<void> {
  const worker = await workerFromSession();
  if (!worker || worker.role !== "worker") redirect(`/signin?next=/link/${code}`);
  await getDesk().denyAgentLink(worker.workerId, code).catch(() => {});
  redirect(`/link/${code}?done=denied`);
}
