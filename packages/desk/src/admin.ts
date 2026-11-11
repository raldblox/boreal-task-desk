import { adminActions, agents, and, asc, type Database, eq, ledgerEntries, or, outbox, sql, type Task, tasks, type Transaction, workers } from "@boreal/db";

import type { Caller } from "./desk";
import { DeskError } from "./errors";

// What boreal's operators can change from the admin area, each written to the audit log
// with who did it and why. The web app checks the admin allowlist first. Reviews go through
// the desk's own reviewer and panel commands, so the state machine still decides.

/** An allowlisted operator, known by their worker pseudonym. */
export interface Admin {
  ref: string;
}

/**
 * An operator reviews as boreal's reviewer, so review fees go to the reviewer account
 * already configured for it; who actually decided is in the audit log.
 */
export const BOREAL_REVIEWER: Caller = { role: "reviewer", reviewerRef: "boreal-ai-reviewer" };
export const BOREAL_PANEL: Caller = { role: "panel", reviewerRef: "boreal-panel" };

type Screen = { outcome: "ok"; reasoning?: string } | { outcome: "refused"; ruleIds: string[]; reasoning?: string };
type Verdict = { outcome: "pass" | "fail"; ruleIds: string[]; reasoning: string };

/** The desk's reviewer commands the admin area may use. */
export interface ReviewCommands {
  screenTask(caller: Caller, taskId: string, result: Screen): Promise<Task>;
  recordVerdict(caller: Caller, taskId: string, verdict: Verdict): Promise<Task>;
  decideDispute(caller: Caller, taskId: string, decision: Verdict): Promise<Task>;
}

interface AuditInput {
  action: string;
  target: string;
  reason: string;
  detail?: unknown;
}

/** `ADMIN_PSEUDONYMS`: worker pseudonyms separated by commas or whitespace. Unset means no admins. */
export function parseAdminList(value: string | undefined): Set<string> {
  return new Set((value ?? "").split(/[\s,]+/).filter(Boolean));
}

/**
 * The admin a worker is, or null. Only workers who signed in with Concordium ID qualify
 * (never testers), and only when their pseudonym is on the allowlist. Standalone, so the
 * web app's proxy can check it before anything renders.
 */
export async function adminForWorker(db: Database, workerId: string, allowlist: string | undefined): Promise<Admin | null> {
  const list = parseAdminList(allowlist);
  if (list.size === 0 || !/^[0-9a-f-]{36}$/i.test(workerId)) return null;
  const [worker] = await db
    .select({ pseudonym: workers.pseudonym, testMode: workers.testMode })
    .from(workers)
    .where(eq(workers.id, workerId));
  if (!worker || worker.testMode || !list.has(worker.pseudonym)) return null;
  return { ref: worker.pseudonym };
}

function requireReason(reason: string): string {
  const trimmed = reason.trim();
  if (trimmed.length < 5) throw new DeskError("invalid", "give a reason of at least 5 characters");
  if (trimmed.length > 1000) throw new DeskError("invalid", "keep the reason under 1000 characters");
  return trimmed;
}

export function adminCommands(db: Database, now: () => Date, review: ReviewCommands) {
  async function record(q: Database | Transaction, admin: Admin, input: AuditInput, outcome: string) {
    await q.insert(adminActions).values({
      adminRef: admin.ref,
      action: input.action,
      target: input.target,
      reason: input.reason,
      outcome,
      detail: input.detail ?? null,
      createdAt: now(),
    });
  }

  /**
   * Runs a desk command and logs it. The command keeps its own transaction (the desk's
   * mutate), so the log records refusals too: an attempt is worth knowing about.
   */
  async function audited<T>(admin: Admin, input: AuditInput, run: () => Promise<T>): Promise<T> {
    const reason = requireReason(input.reason);
    try {
      const result = await run();
      await record(db, admin, { ...input, reason }, "ok");
      return result;
    } catch (error) {
      if (error instanceof DeskError) await record(db, admin, { ...input, reason }, `refused: ${error.message}`);
      throw error;
    }
  }

  return {
    /** The admin a signed-in worker is, or null: see adminForWorker. */
    async adminFor(workerId: string, allowlist: string | undefined): Promise<Admin | null> {
      return adminForWorker(db, workerId, allowlist);
    },

    /** Screens a posted task as boreal's reviewer. */
    async adminScreenTask(admin: Admin, taskId: string, result: Screen, reason: string) {
      return audited(admin, { action: `screen_${result.outcome}`, target: `task:${taskId}`, reason, detail: result }, () =>
        review.screenTask(BOREAL_REVIEWER, taskId, result),
      );
    },

    /** Judges a submission as boreal's reviewer. */
    async adminRecordVerdict(admin: Admin, taskId: string, verdict: Verdict, reason: string) {
      return audited(admin, { action: `verdict_${verdict.outcome}`, target: `task:${taskId}`, reason, detail: verdict }, () =>
        review.recordVerdict(BOREAL_REVIEWER, taskId, verdict),
      );
    },

    /** Decides a dispute as boreal's panel; its decision is final. */
    async adminDecideDispute(admin: Admin, taskId: string, decision: Verdict, reason: string) {
      return audited(admin, { action: `panel_${decision.outcome}`, target: `task:${taskId}`, reason, detail: decision }, () =>
        review.decideDispute(BOREAL_PANEL, taskId, decision),
      );
    },

    /** Freezes an agent (it can't post) or unfreezes it, logged in the same transaction. */
    async adminSetAgentStatus(admin: Admin, agentId: string, status: "active" | "frozen", reason: string) {
      const why = requireReason(reason);
      return db.transaction(async (tx) => {
        const [agent] = await tx.select().from(agents).where(eq(agents.id, agentId)).for("update");
        if (!agent) throw new DeskError("not_found", "agent not found");
        if (agent.status === status) throw new DeskError("conflict", `agent is already ${status}`);
        await tx.update(agents).set({ status, updatedAt: now() }).where(eq(agents.id, agentId));
        await record(tx, admin, { action: status === "frozen" ? "freeze_agent" : "unfreeze_agent", target: `agent:${agentId}`, reason: why, detail: { name: agent.name } }, "ok");
        return { ...agent, status };
      });
    },

    /**
     * Makes a failing outbox row due now instead of after its backoff. Nothing else changes:
     * payouts stay journaled and keyed, so a retry never pays twice.
     */
    async adminRetryOutbox(admin: Admin, outboxId: number, reason: string) {
      const why = requireReason(reason);
      return db.transaction(async (tx) => {
        const [row] = await tx.select().from(outbox).where(eq(outbox.id, outboxId)).for("update");
        if (!row) throw new DeskError("not_found", "outbox row not found");
        if (row.doneAt) throw new DeskError("conflict", "this side effect has already been sent");
        if (!row.lastError) throw new DeskError("conflict", "this side effect hasn't failed; it is waiting its turn");
        const at = now();
        await tx.update(outbox).set({ nextAttemptAt: at }).where(eq(outbox.id, outboxId));
        await record(tx, admin, { action: "retry_outbox", target: `outbox:${outboxId}`, reason: why, detail: { kind: row.kind, attempts: row.attempts, lastError: row.lastError } }, "ok");
        return { ...row, nextAttemptAt: at };
      });
    },

    /**
     * Sends a payout again after the provider reported it failed (PayPal returned, blocked or
     * denied it), once whatever stopped it is fixed. The same ledger entry goes back to pending
     * and a new outbox row sends it under a new provider key (`:r<attempt>`), since PayPal
     * refuses a batch id it has seen. Only a failed entry out of escrow on PayPal qualifies, so
     * money the provider still holds or has delivered is never sent twice: chain rails resend
     * by themselves once the chain proves the first transfer can't land.
     */
    async adminResendPayout(admin: Admin, ledgerKey: string, reason: string) {
      const why = requireReason(reason);
      return db.transaction(async (tx) => {
        const [entry] = await tx.select().from(ledgerEntries).where(eq(ledgerEntries.idempotencyKey, ledgerKey)).for("update");
        if (!entry) throw new DeskError("not_found", "ledger entry not found");
        if (entry.fromAccount !== "escrow" || (entry.toAccount !== "worker" && entry.toAccount !== "reviewer")) {
          throw new DeskError("conflict", "only a payout to a worker or reviewer can be sent again");
        }
        if (entry.status !== "failed") throw new DeskError("conflict", `this payout is ${entry.status}, not failed`);
        const [task] = entry.taskId ? await tx.select({ rail: tasks.paymentRail }).from(tasks).where(eq(tasks.id, entry.taskId)) : [];
        if (task?.rail !== "paypal") throw new DeskError("conflict", "only PayPal payouts are sent again by hand");
        const [{ sends } = { sends: 0 }] = await tx
          .select({ sends: sql<number>`count(*)::int` })
          .from(outbox)
          .where(and(eq(outbox.kind, "payout"), sql`${outbox.payload}->>'ledgerKey' = ${ledgerKey}`));
        const at = now();
        const attempt = Math.max(1, sends);
        await tx.update(ledgerEntries).set({ status: "pending", txHash: null, updatedAt: at }).where(eq(ledgerEntries.id, entry.id));
        await tx.insert(outbox).values({
          kind: "payout",
          payload: { ledgerKey, to: entry.toAccount, party: entry.party, amount: entry.amount, attempt },
          nextAttemptAt: at,
          createdAt: at,
        });
        await record(tx, admin, { action: "resend_payout", target: `ledger:${ledgerKey}`, reason: why, detail: { amount: entry.amount, to: entry.toAccount, attempt } }, "ok");
        return { ledgerKey, attempt, amount: entry.amount };
      });
    },

    /** Logs an operator action that happens outside the desk, like running a monitor tick. */
    async adminRecord(admin: Admin, input: AuditInput, outcome = "ok") {
      await record(db, admin, { ...input, reason: requireReason(input.reason) }, outcome);
    },

    /**
     * Every task waiting on boreal: posted ones to screen, submissions boreal reviews and
     * disputes for the panel, oldest first, whether or not the AI reviewer has tried them.
     * Also anything flagged for a person, such as a submission its requester never reviewed.
     */
    async adminReviewQueue(limit = 100) {
      return db
        .select()
        .from(tasks)
        .where(
          or(
            eq(tasks.status, "posted"),
            and(eq(tasks.status, "submitted"), eq(tasks.reviewMode, "boreal")),
            eq(tasks.status, "disputed"),
            and(eq(tasks.status, "submitted"), eq(tasks.needsHuman, true)),
          ),
        )
        .orderBy(asc(tasks.updatedAt))
        .limit(limit);
    },
  };
}
