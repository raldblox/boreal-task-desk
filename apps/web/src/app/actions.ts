"use server";

import { type Caller, DeskError } from "@boreal/desk";
import type { ProofRequest } from "@boreal/concordium";
import { refresh } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";

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

/** Invite-only test sign-in while Concordium ID isn't live; test workers only see test tasks. */
export async function signInTest(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const attributes: Record<string, string> = {};
    const country = String(form.get("country") ?? "");
    if (country) attributes.residency = country;
    if (form.get("adult") === "on") attributes.age_over_18 = "true";
    const worker = await getDesk().signInTestWorker(
      String(form.get("invite") ?? "").trim(),
      String(form.get("pseudonym") ?? ""),
      attributes,
    );
    await startWorkerSession(worker.id);
  } catch (error) {
    if (error instanceof DeskError) return { error: error.message };
    console.error("[test sign-in] failed", error);
    return { error: "Sign-in failed. Try again." };
  }
  redirect("/tasks");
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
    const fileUrls = file instanceof File && file.size > 0 ? [await saveSubmissionFile(taskId, file)] : [];
    await getDesk().submitResult(worker, taskId, { text, fileUrls });
  });
}

export async function disputeVerdict(taskId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  return asWorker(async (worker) => {
    await getDesk().disputeVerdict(worker, taskId, String(form.get("reason") ?? ""));
  });
}
