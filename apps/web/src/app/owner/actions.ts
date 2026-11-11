"use server";

import { DeskError } from "@boreal/desk";
import { refresh } from "next/cache";
import { after } from "next/server";

import { getDesk, getPayPal } from "@/server/desk";
import { kickMonitor } from "@/server/monitor";
import { workerFromSession } from "@/server/session";

// What an owner does to their own agents from My account, and their answer to a payment an
// agent asked for. The desk checks ownership on every call and writes each change to its
// audit trail; this file only reads the form.

export type OwnerActionState = { error?: string; ok?: string } | null;

/** Dollars typed by the owner, as whole cents. */
const cents = (value: FormDataEntryValue | null) => Math.round(Number(String(value ?? "").replace(/[$,\s]/g, "")) * 100);

async function asOwner(run: (workerId: string) => Promise<string>): Promise<OwnerActionState> {
  const worker = await workerFromSession();
  if (!worker || worker.role !== "worker") return { error: "Your session has ended. Sign in again." };
  try {
    const ok = await run(worker.workerId);
    refresh();
    return { ok };
  } catch (error) {
    if (error instanceof DeskError) return { error: error.message };
    console.error("[owner action] failed", error);
    return { error: "Something went wrong. Try again." };
  }
}

export async function setAgentPaused(agentId: string, paused: boolean, _prev: OwnerActionState, _form: FormData): Promise<OwnerActionState> {
  return asOwner(async (workerId) => {
    await getDesk().ownerSetPaused(workerId, agentId, paused);
    return paused ? "Paused. It can't post, pay, accept or review until you resume it." : "Resumed.";
  });
}

export async function revokeAgentKey(agentId: string, _prev: OwnerActionState, form: FormData): Promise<OwnerActionState> {
  if (form.get("confirm") !== "on") return { error: "Tick the box to confirm." };
  return asOwner(async (workerId) => {
    await getDesk().ownerRevokeKey(workerId, agentId);
    return "Key revoked. The agent needs a new link from you to get another.";
  });
}

export async function setAgentLimits(agentId: string, _prev: OwnerActionState, form: FormData): Promise<OwnerActionState> {
  return asOwner(async (workerId) => {
    await getDesk().ownerSetLimits(workerId, agentId, {
      maxTaskBudget: cents(form.get("maxTaskBudget")),
      maxDailySpend: cents(form.get("maxDailySpend")),
      spendingMode: form.get("spendingMode") === "auto" ? "auto" : "ask",
    });
    return "Saved. The new limits apply from its next payment.";
  });
}

export async function disconnectAgentPayPal(agentId: string, _prev: OwnerActionState, form: FormData): Promise<OwnerActionState> {
  if (form.get("confirm") !== "on") return { error: "Tick the box to confirm." };
  return asOwner(async (workerId) => {
    const { vaultId } = await getDesk().ownerDisconnectPayment(workerId, agentId);
    // boreal.work has already forgotten it; also ask PayPal to delete the saved account.
    const paypal = getPayPal();
    if (paypal) {
      await paypal.client.request("DELETE", `/v3/vault/payment-tokens/${encodeURIComponent(vaultId)}`).catch((error) => {
        console.error("[owner action] PayPal didn't delete the saved account", error);
      });
    }
    return "PayPal disconnected. The agent will send you a checkout link to pay.";
  });
}

export async function decideApproval(approvalId: string, decision: "approve" | "decline", _prev: OwnerActionState, _form: FormData): Promise<OwnerActionState> {
  return asOwner(async (workerId) => {
    const result = await getDesk().decideFundingApproval(workerId, approvalId, decision);
    if (result.status === "declined") return "Declined. Nothing was held.";
    after(kickMonitor); // screening starts once the money is held
    const failed = result.failed.length ? ` ${result.failed.length} couldn't be paid: ${result.failed.map((f) => f.error).join("; ")}.` : "";
    return `Approved: ${result.funded.length} ${result.funded.length === 1 ? "task" : "tasks"} paid for.${failed}`;
  });
}
