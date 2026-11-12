"use server";

import { type Caller, DeskError } from "@boreal/desk";
import type { ProofRequest } from "@boreal/concordium";
import { EvmConnectError, verifyEvmConnect } from "@boreal/evm";
import { CONNECT_MESSAGE, loadNearChain, NearSignInError, type NearSignIn, verifyNearSignIn } from "@boreal/near";
import { refresh } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";

import { SITE } from "@/content/agent-guide";
import { gatedEnv, requireAddonPart } from "@/server/addons";
import { getDesk } from "@/server/desk";
import { FileRejected, saveSubmissionFile } from "@/server/files";
import { kickMonitor } from "@/server/monitor";
import { endWorkerSession, startWorkerSession, workerFromSession } from "@/server/session";

export type ActionState = { error?: string } | null;

/** Runs a worker action, turning refusals into a message the form can show. */
async function asWorker(action: (worker: Caller) => Promise<void>): Promise<ActionState> {
  const worker = await workerFromSession();
  if (!worker) return { error: "Your session has ended. Sign in again." };
  try {
    await action(worker);
  } catch (error) {
    if (error instanceof DeskError || error instanceof FileRejected) return { error: error.message };
    console.error("[worker action] failed", error);
    return { error: "Something went wrong. Try again." };
  }
  after(kickMonitor); // e.g. a new submission gets reviewed within seconds
  refresh();
  return null;
}

export async function signIn(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    requireAddonPart("concordium", "id");
    const request = JSON.parse(String(form.get("request"))) as ProofRequest;
    const pseudonym = String(form.get("pseudonym") ?? "").trim();
    // The dev wallet answers for the stand-in adapter; the real wallet sends a Concordium proof.
    const attributes: Record<string, string> = {};
    const country = String(form.get("country") ?? "");
    if (country) attributes.residency = country;
    if (form.get("adult") === "on") attributes.age_over_18 = "true";
    const worker = await getDesk().signInWorker(request, { pseudonym, attributes }, `dev-acct-${pseudonym}`);
    await startWorkerSession(worker.id);
  } catch (error) {
    if (error instanceof DeskError) return { error: error.message };
    console.error("[sign-in] failed", error);
    return { error: "Sign-in failed. Try again." };
  }
  redirect("/tasks");
}

/** The development wallet adds Concordium ID to the signed-in worker: the badge and its attributes. */
export async function linkConcordium(_prev: ActionState, form: FormData): Promise<ActionState> {
  const worker = await workerFromSession();
  if (!worker) return { error: "Your session has ended. Sign in again." };
  try {
    requireAddonPart("concordium", "id");
    const request = JSON.parse(String(form.get("request"))) as ProofRequest;
    const attributes: Record<string, string> = {};
    const country = String(form.get("country") ?? "");
    if (country) attributes.residency = country;
    if (form.get("adult") === "on") attributes.age_over_18 = "true";
    const kept = await getDesk().linkConcordium(worker, request, { pseudonym: String(form.get("pseudonym") ?? "").trim(), attributes });
    // An empty account folded into the one holding this ID: continue as that account.
    if (worker.role === "worker" && kept.id !== worker.workerId) await startWorkerSession(kept.id);
  } catch (error) {
    if (error instanceof DeskError) return { error: error.message };
    console.error("[link concordium] failed", error);
    return { error: "Couldn't add Concordium ID. Try again." };
  }
  redirect("/me?concordium=added");
}

export async function signOut(): Promise<void> {
  await endWorkerSession();
  redirect("/");
}

export async function claimTask(taskId: string): Promise<ActionState> {
  return asWorker(async (worker) => {
    await getDesk().claimTask(worker, taskId);
  });
}

export async function releaseTask(taskId: string): Promise<ActionState> {
  return asWorker(async (worker) => {
    await getDesk().releaseTask(worker, taskId);
  });
}

export async function submitResult(taskId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  return asWorker(async (worker) => {
    const text = String(form.get("text") ?? "").trim() || undefined;
    const file = form.get("file");
    // Nothing is stored unless this worker holds the task: no uploads for other people's tasks.
    await getDesk().assertCanSubmit(worker, taskId);
    const fileUrls = file instanceof File && file.size > 0 ? [await saveSubmissionFile(taskId, file)] : [];
    await getDesk().submitResult(worker, taskId, { text, fileUrls });
  });
}

/**
 * Connects a payout account the worker holds, from a wallet button rather than a typed address,
 * on My account (no task) or on a task's guided setup (then claims the task and goes back to it).
 * NEAR proves the account with a NEP-413 signature of CONNECT_MESSAGE from one of its full-access
 * keys; Concordium takes the account the Concordium Wallet for Web connected. boreal never holds
 * a wallet for anyone and never converts between rails.
 */
export async function connectPayoutAccount(
  connection: { rail: "near"; signed: NearSignIn } | { rail: "concordium"; account: string } | { rail: "evm"; address: string; issuedAt: string; signature: string },
  taskId?: string,
): Promise<ActionState> {
  const worker = await workerFromSession();
  if (!worker) return { error: "Your session has ended. Sign in again." };
  try {
    requireAddonPart(connection.rail, "rail");
    const account =
      connection.rail === "near"
        ? (
            await verifyNearSignIn(connection.signed, {
              chain: loadNearChain(gatedEnv()),
              recipient: new URL(SITE).host,
              message: CONNECT_MESSAGE,
            })
          ).accountId
        : connection.rail === "evm"
          ? // The wallet signs a free message; nobody types an address.
            await verifyEvmConnect(connection, { site: new URL(SITE).host })
          : connection.account;
    await getDesk().setPayoutAddress(worker, account, connection.rail, { guided: Boolean(taskId) });
  } catch (error) {
    if (error instanceof NearSignInError || error instanceof EvmConnectError) return { error: `Your wallet's signature didn't check out: ${error.message}.` };
    if (error instanceof DeskError) return { error: error.message };
    console.error("[connect payout account] failed", error);
    return { error: "Something went wrong. Try again." };
  }
  if (!taskId) {
    refresh();
    return null;
  }
  try {
    await getDesk().claimTask(worker, taskId);
    after(kickMonitor);
  } catch (error) {
    // The account is saved either way; the task page says why the claim didn't go through.
    if (!(error instanceof DeskError)) throw error;
  }
  redirect(`/tasks/${taskId}`);
}

export async function disputeVerdict(taskId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  return asWorker(async (worker) => {
    await getDesk().disputeVerdict(worker, taskId, String(form.get("reason") ?? ""));
  });
}

