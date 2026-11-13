"use server";

import { type Admin, DeskError } from "@boreal/desk";
import { describeTick } from "@boreal/monitor";
import { refresh } from "next/cache";
import { after } from "next/server";

import { requireAdmin } from "@/server/admin";
import { getDesk } from "@/server/desk";
import { getMonitor, kickMonitor } from "@/server/monitor";

// Every admin action checks the allowlist on the server first; a forged request from anyone
// else gets the same 404 as the pages. Each change is written to the audit log with its reason.

export type AdminActionState = { error?: string; ok?: string } | null;

const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();
const rules = (form: FormData) =>
  text(form, "ruleIds")
    .split(/[\s,]+/)
    .filter(Boolean);

async function asAdmin(form: FormData, run: (admin: Admin, reason: string) => Promise<string | void>): Promise<AdminActionState> {
  const admin = await requireAdmin();
  if (form.get("confirm") !== "on") return { error: "Tick the box to confirm." };
  try {
    const ok = await run(admin, text(form, "reason"));
    refresh();
    return { ok: ok || "Done." };
  } catch (error) {
    if (error instanceof DeskError) return { error: error.message };
    console.error("[admin action] failed", error);
    return { error: "Something went wrong. Check the server log." };
  }
}

export async function screenTask(taskId: string, _prev: AdminActionState, form: FormData): Promise<AdminActionState> {
  return asAdmin(form, async (admin, reason) => {
    const outcome = text(form, "outcome");
    const reasoning = text(form, "reasoning") || undefined;
    const result =
      outcome === "ok" ? { outcome: "ok" as const, reasoning } : { outcome: "refused" as const, ruleIds: rules(form), reasoning };
    const task = await getDesk().adminScreenTask(admin, taskId, result, reason);
    after(kickMonitor);
    return `Screened: ${task.status}.`;
  });
}

export async function recordVerdict(taskId: string, _prev: AdminActionState, form: FormData): Promise<AdminActionState> {
  return asAdmin(form, async (admin, reason) => {
    const outcome = text(form, "outcome") === "pass" ? "pass" : "fail";
    const task = await getDesk().adminRecordVerdict(admin, taskId, { outcome, ruleIds: rules(form), reasoning: text(form, "reasoning") }, reason);
    after(kickMonitor);
    return `Verdict recorded: ${task.status}.`;
  });
}

export async function decideDispute(taskId: string, _prev: AdminActionState, form: FormData): Promise<AdminActionState> {
  return asAdmin(form, async (admin, reason) => {
    const outcome = text(form, "outcome") === "pass" ? "pass" : "fail";
    const task = await getDesk().adminDecideDispute(admin, taskId, { outcome, ruleIds: rules(form), reasoning: text(form, "reasoning") }, reason);
    after(kickMonitor);
    return `Dispute decided: ${task.status}.`;
  });
}

export async function setAgentStatus(agentId: string, _prev: AdminActionState, form: FormData): Promise<AdminActionState> {
  return asAdmin(form, async (admin, reason) => {
    const status = text(form, "status") === "frozen" ? "frozen" : "active";
    const agent = await getDesk().adminSetAgentStatus(admin, agentId, status, reason);
    return `${agent.name} is now ${status}.`;
  });
}

export async function setWorkerBlocked(workerId: string, _prev: AdminActionState, form: FormData): Promise<AdminActionState> {
  return asAdmin(form, async (admin, reason) => {
    const blocked = text(form, "blocked") === "yes";
    const worker = await getDesk().adminSetWorkerBlocked(admin, workerId, blocked, reason);
    return blocked ? `${worker.pseudonym} can no longer claim tasks.` : `${worker.pseudonym} can claim tasks again.`;
  });
}

export async function retryOutbox(outboxId: number, _prev: AdminActionState, form: FormData): Promise<AdminActionState> {
  return asAdmin(form, async (admin, reason) => {
    await getDesk().adminRetryOutbox(admin, outboxId, reason);
    after(kickMonitor);
    return "Due now; the monitor is sending it.";
  });
}

export async function resendPayout(ledgerKey: string, _prev: AdminActionState, form: FormData): Promise<AdminActionState> {
  return asAdmin(form, async (admin, reason) => {
    const sent = await getDesk().adminResendPayout(admin, ledgerKey, reason);
    after(kickMonitor);
    return `Queued again (attempt ${sent.attempt + 1}); the monitor is sending it.`;
  });
}

export async function setRailClosed(rail: string, closed: boolean, _prev: AdminActionState, form: FormData): Promise<AdminActionState> {
  return asAdmin(form, async (admin, reason) => {
    await getDesk().adminSetRailClosed(admin, rail, closed, reason);
    return closed ? `${rail} is closed to new money. Tasks already funded on it still settle.` : `${rail} takes new money again.`;
  });
}

export async function runMonitorTick(_prev: AdminActionState, form: FormData): Promise<AdminActionState> {
  return asAdmin(form, async (admin, reason) => {
    if (reason.length < 5) throw new DeskError("invalid", "give a reason of at least 5 characters");
    const report = await (await getMonitor()).tick({ aiLimit: 2 });
    const summary = report.ran ? describeTick(report) || "nothing to do" : "another tick holds the lease; try again shortly";
    await getDesk().adminRecord(admin, { action: "monitor_tick", target: "monitor", reason, detail: report }, report.errors.length ? `errors: ${report.errors.join("; ")}` : "ok");
    return `Tick: ${summary}.`;
  });
}
