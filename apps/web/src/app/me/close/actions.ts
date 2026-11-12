"use server";

import { DeskError } from "@boreal/desk";
import { redirect } from "next/navigation";

import { CLOSE_PHRASE } from "@/lib/close-account";
import { getDesk, getPayPal } from "@/server/desk";
import { endWorkerSession, workerFromSession } from "@/server/session";

export type CloseAccountState = { error?: string } | null;

/**
 * Closes the signed-in person's account. The desk refuses while anything is still moving for
 * them; once it is closed, the saved PayPal accounts are deleted at PayPal too and the session
 * ends.
 */
export async function closeMyAccount(_prev: CloseAccountState, form: FormData): Promise<CloseAccountState> {
  const worker = await workerFromSession();
  if (!worker || worker.role !== "worker") return { error: "Your session has ended. Sign in again." };
  if (form.get("understand") !== "on" || form.get("final") !== "on") return { error: "Tick both boxes to confirm." };
  if (String(form.get("phrase") ?? "").trim().toLowerCase() !== CLOSE_PHRASE) return { error: `Type "${CLOSE_PHRASE}" to confirm.` };

  let vaultIds: string[];
  try {
    ({ vaultIds } = await getDesk().closeAccount(worker.workerId));
  } catch (error) {
    if (error instanceof DeskError) return { error: error.message };
    console.error("[close account] failed", error);
    return { error: "Something went wrong, and nothing was closed. Try again." };
  }
  // boreal.work has already forgotten them; also ask PayPal to delete each saved account.
  const paypal = getPayPal();
  if (paypal) {
    for (const id of vaultIds) {
      await paypal.client.request("DELETE", `/v3/vault/payment-tokens/${encodeURIComponent(id)}`).catch((error) => {
        console.error("[close account] PayPal didn't delete a saved account", error);
      });
    }
  }
  await endWorkerSession();
  redirect("/me/closed");
}
