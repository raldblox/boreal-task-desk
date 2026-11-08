"use server";

import { isPayPalRequirement } from "@boreal/concordium";
import { type Caller, DeskError, taskTotal } from "@boreal/desk";
import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";

import type { ActionState } from "@/app/actions";
import { CHECKOUT_COOKIE } from "@/lib/checkout";
import { getDesk, getRails } from "@/server/desk";
import { kickMonitor } from "@/server/monitor";
import { posterFromSession } from "@/server/poster";

// What a person does with the tasks they post: the same desk commands an agent calls over
// MCP, run as their own requester (server/poster.ts).

const HOUR = 3_600_000;

/** Runs a requester action for the signed-in poster, turning refusals into a message. */
async function asPoster(action: (requester: Caller) => Promise<void>): Promise<ActionState> {
  const poster = await posterFromSession();
  if (!poster) return { error: "Your session has ended. Sign in again." };
  if (!poster.requester) return { error: "You haven't posted a task yet." };
  try {
    await action(poster.requester);
  } catch (error) {
    if (error instanceof DeskError) return { error: error.message };
    console.error("[poster action] failed", error);
    return { error: "Something went wrong. Try again." };
  }
  after(kickMonitor); // a verdict or a cancel settles money now, not at the next cron
  refresh();
  return null;
}

/** /post: a person's task, as post_task takes it. Screening comes next. */
export async function postTask(_prev: ActionState, form: FormData): Promise<ActionState> {
  const poster = await posterFromSession({ create: true }).catch((error: unknown) => {
    if (error instanceof DeskError) return { error: error.message };
    throw error;
  });
  if (!poster) return { error: "Your session has ended. Sign in again." };
  if ("error" in poster) return { error: poster.error };

  const text = (name: string) => String(form.get(name) ?? "").trim();
  const dollars = Number(text("budget"));
  const hours = Number(text("deadlineHours"));
  const country = text("country").toUpperCase();
  const input = {
    description: text("description"),
    acceptanceCriteria: text("criteria")
      .split("\n")
      .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
      .filter(Boolean),
    resultFormat: text("resultFormat"),
    requiredAttributes: [
      ...(form.get("adult") === "on" ? [{ attribute: "age_over_18" }] : []),
      ...(country ? [{ attribute: "residency", value: country }] : []),
    ],
    budget: Number.isFinite(dollars) ? Math.round(dollars * 100) : NaN,
    deadline: new Date(Date.now() + (Number.isFinite(hours) && hours > 0 ? hours : 72) * HOUR).toISOString(),
    reviewer: text("reviewer") === "boreal" ? "boreal" : "requester",
  };

  let taskId: string;
  try {
    ({ task: { id: taskId } } = await getDesk().postTask(poster.requester!, input));
  } catch (error) {
    if (error instanceof DeskError) return { error: readable(error.message) };
    console.error("[post task] failed", error);
    return { error: "Something went wrong. Try again." };
  }
  after(kickMonitor); // screening starts now where an AI reviewer is set up
  redirect(`/me/posted/${taskId}?posted=1`);
}

/** The schema's field paths, in the words the form uses. */
function readable(message: string): string {
  return message
    .replace(/\bdescription: Too small: expected string to have >=20 characters/g, "Describe the task in at least 20 characters")
    .replace(/\bacceptanceCriteria: Too small: expected array to have >=1 items/g, "Add at least one check")
    .replace(/\bacceptanceCriteria: Too big: expected array to have <=10 items/g, "Use at most 10 checks")
    .replace(/\bacceptanceCriteria\.\d+: Too small: expected string to have >=5 characters/g, "Each check needs at least 5 characters")
    .replace(/\bbudget: [^;]*/g, "Enter the pay in dollars, like 5.00")
    .replace(/\bresultFormat: [^;]*/g, "Choose what the worker sends back")
    .replace(/ (\d+) cents/g, (_m, cents: string) => ` $${(Number(cents) / 100).toFixed(2)}`);
}

/**
 * Pay with PayPal, exactly as fund_task does for an agent: from the PayPal account saved on an
 * earlier checkout when there is one, else a new PayPal checkout. PayPal sends the person back
 * to /paypal/approved, which finishes funding (the cookie says which task the order was for).
 */
export async function payTask(taskId: string): Promise<ActionState> {
  const poster = await posterFromSession();
  if (!poster?.requester) return { error: "Your session has ended. Sign in again." };
  const desk = getDesk();
  const paypal = getRails().paypal;
  let approveUrl: string;
  try {
    const task = await desk.getTask(poster.requester, taskId);
    if (task.status !== "awaiting_funding") return { error: "This task isn't waiting for payment." };
    if (!paypal) return { error: "Paying on the website needs PayPal, which isn't switched on here yet." };
    const account = await desk.getAgentAccount(poster.requester);
    const total = taskTotal(task);
    if (total > account.leftToday) {
      return {
        error: `This would pass your daily limit: $${(account.leftToday / 100).toFixed(2)} left today. Get verified on My account to raise it, or try tomorrow.`,
      };
    }
    if (account.savedPaymentMethod && paypal.vault) {
      try {
        await desk.fundTask(poster.requester, task.id, { vault: true }, { rail: "paypal" });
        after(kickMonitor);
        refresh();
        return null;
      } catch (error) {
        // PayPal refused the saved account (say it was removed): approve a new checkout instead.
        if (!(error instanceof DeskError && error.code === "invalid")) throw error;
      }
    }
    const requirement = await paypal.createPaymentRequest(task.id, total);
    if (!isPayPalRequirement(requirement)) throw new Error("the PayPal rail returned a non-PayPal requirement");
    (await cookies()).set(CHECKOUT_COOKIE, `${requirement.nonce}.${task.id}`, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 3 * 60 * 60,
    });
    approveUrl = requirement.extra.approveUrl;
  } catch (error) {
    if (error instanceof DeskError) return { error: error.message };
    console.error("[pay task] failed", error);
    return { error: "PayPal didn't answer. Try again." };
  }
  redirect(approveUrl);
}

export async function cancelTask(taskId: string): Promise<ActionState> {
  return asPoster(async (requester) => {
    await getDesk().cancelTask(requester, taskId);
  });
}

export async function acceptResult(taskId: string): Promise<ActionState> {
  return asPoster(async (requester) => {
    await getDesk().acceptEarly(requester, taskId);
  });
}

/** review_result: pass, or fail citing the rules the result broke. */
export async function reviewResult(taskId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  return asPoster(async (requester) => {
    const outcome = form.get("outcome") === "fail" ? "fail" : "pass";
    const ruleIds = outcome === "fail" ? form.getAll("ruleId").map(String) : [];
    await getDesk().requesterReview(requester, taskId, { outcome, ruleIds, reasoning: String(form.get("reasoning") ?? "") });
  });
}

export async function disputeAsPoster(taskId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  return asPoster(async (requester) => {
    await getDesk().disputeVerdict(requester, taskId, String(form.get("reason") ?? ""));
  });
}
