import {
  type Actor,
  postTaskInput,
  POLICY,
  quoteFees,
  type TaskEvent,
  type TaskStatus,
  transition,
  TransitionError,
} from "@boreal/core";
import {
  agents,
  and,
  asc,
  type Database,
  eq,
  gte,
  inArray,
  ledgerEntries,
  lte,
  submissions,
  type Task,
  taskEvents,
  tasks,
  type Transaction,
  workers,
  sql,
} from "@boreal/db";

import { DeskError, fromTransitionError } from "./errors";
import { recordFunding, settle, taskTotal } from "./money";
import { appendEvent } from "./trail";

export type Caller =
  | { role: "requester"; agentId: string }
  | { role: "worker"; workerId: string }
  | { role: "reviewer"; reviewerRef: string }
  | { role: "panel"; reviewerRef: string }
  | { role: "system" };

export interface DeskOptions {
  db: Database;
  now?: () => Date;
}

type TaskPatch = Partial<typeof tasks.$inferInsert>;

interface MutateOptions {
  /** Extra checks beyond the state machine, run on the locked row. */
  check?: (tx: Transaction, task: Task, at: Date) => Promise<void> | void;
  patch?: (task: Task, at: Date) => TaskPatch;
  after?: (tx: Transaction, task: Task, at: Date) => Promise<void>;
  payload?: unknown;
}

function actorOf(caller: Caller): Actor {
  return caller.role;
}

/** Requesters act only on their own tasks; workers only on tasks they hold (claiming aside). */
function authorize(caller: Caller, task: Task, event: TaskEvent): void {
  if (caller.role === "requester" && task.agentId !== caller.agentId) {
    throw new DeskError("forbidden", "this task belongs to another agent");
  }
  if (caller.role === "worker" && event.type !== "claim" && task.claimedBy !== caller.workerId) {
    throw new DeskError("forbidden", "this task is not claimed by you");
  }
}

function meetsAttributes(
  required: Task["requiredAttributes"],
  proven: Record<string, string>,
): boolean {
  return required.every(({ attribute, value }) =>
    value === undefined ? attribute in proven : proven[attribute] === value,
  );
}

export function createDesk({ db, now = () => new Date() }: DeskOptions) {
  async function mutate(
    taskId: string,
    caller: Caller,
    event: TaskEvent,
    options: MutateOptions = {},
  ): Promise<Task> {
    return db.transaction(async (tx) => {
      const at = now();
      const [task] = await tx.select().from(tasks).where(eq(tasks.id, taskId)).for("update");
      if (!task) throw new DeskError("not_found", "task not found");

      authorize(caller, task, event);

      let next: { status: TaskStatus; disputeUsed: boolean };
      try {
        // Take only the state fields, so they never overwrite the command's own patch.
        const { status, disputeUsed } = transition(task, event, actorOf(caller));
        next = { status, disputeUsed };
      } catch (error) {
        if (error instanceof TransitionError) throw fromTransitionError(error);
        throw error;
      }

      await options.check?.(tx, task, at);

      const [updated] = await tx
        .update(tasks)
        .set({ ...options.patch?.(task, at), ...next, updatedAt: at })
        .where(eq(tasks.id, taskId))
        .returning();

      await appendEvent(tx, {
        taskId,
        type: event.type,
        actor: actorOf(caller),
        payload: options.payload ?? event,
        at,
      });
      await options.after?.(tx, updated!, at);

      // Money moves only when a task reaches a final state.
      if (next.status === "final_pass") await settle(tx, updated!, "pass", at);
      if (next.status === "final_fail") await settle(tx, updated!, "fail", at);
      if (next.status === "expired" || (next.status === "cancelled" && task.status === "open")) {
        await settle(tx, updated!, "refund", at);
      }

      return updated!;
    });
  }

  function requireRole<R extends Caller["role"]>(
    caller: Caller,
    ...roles: R[]
  ): asserts caller is Extract<Caller, { role: R }> {
    if (!roles.includes(caller.role as R)) {
      throw new DeskError("forbidden", `${caller.role} cannot do this`);
    }
  }

  return {
    /** post_task: validates, applies the agent's limits and quotes fees. Screening comes next. */
    async postTask(caller: Caller, input: unknown) {
      requireRole(caller, "requester");
      const parsed = postTaskInput.safeParse(input);
      if (!parsed.success) throw new DeskError("invalid", parsed.error.message);
      const data = parsed.data;

      const at = now();
      if (new Date(data.deadline) <= at) throw new DeskError("invalid", "deadline is in the past");

      const [agent] = await db.select().from(agents).where(eq(agents.id, caller.agentId));
      if (!agent) throw new DeskError("not_found", "agent not found");
      if (agent.status !== "active") throw new DeskError("forbidden", "agent is frozen");
      if (data.budget > agent.maxTaskBudget) {
        throw new DeskError("limit", "budget exceeds this agent's per-task cap");
      }

      const quote = quoteFees(data.budget);
      return db.transaction(async (tx) => {
        const [task] = await tx
          .insert(tasks)
          .values({
            agentId: agent.id,
            description: data.description,
            acceptanceCriteria: data.acceptanceCriteria,
            requiredAttributes: data.requiredAttributes,
            resultFormat: data.resultFormat,
            budget: quote.budget,
            platformFee: quote.platformFee,
            reviewFee: quote.reviewFee,
            rulebookVersion: POLICY.rulebookVersion,
            deadline: new Date(data.deadline),
            createdAt: at,
            updatedAt: at,
          })
          .returning();
        await appendEvent(tx, { taskId: task!.id, type: "posted", actor: "requester", payload: data, at });
        return { task: task!, quote };
      });
    },

    async screenTask(
      caller: Caller,
      taskId: string,
      result: { outcome: "ok" } | { outcome: "refused"; ruleIds: string[] },
    ) {
      requireRole(caller, "reviewer");
      if (result.outcome === "refused" && result.ruleIds.length === 0) {
        throw new DeskError("invalid", "a refusal must cite at least one rule");
      }
      return mutate(
        taskId,
        caller,
        result.outcome === "ok" ? { type: "screen_ok" } : { type: "screen_refused", ruleIds: result.ruleIds },
      );
    },

    /** fund_task: the x402 payment has confirmed on-chain; amount must match the quote exactly. */
    async fundTask(caller: Caller, taskId: string, payment: { txHash: string; amount: number }) {
      requireRole(caller, "requester");
      return mutate(taskId, caller, { type: "fund" }, {
        payload: { txHash: payment.txHash, amount: payment.amount },
        async check(tx, task, at) {
          if (payment.amount !== taskTotal(task)) {
            throw new DeskError("invalid", `payment must be exactly ${taskTotal(task)}`);
          }
          const [agent] = await tx.select().from(agents).where(eq(agents.id, task.agentId));
          const since = new Date(at.getTime() - 24 * 60 * 60 * 1000);
          const [spent] = await tx
            .select({ total: sql<number>`coalesce(sum(${ledgerEntries.amount}), 0)::int` })
            .from(ledgerEntries)
            .where(
              and(
                eq(ledgerEntries.party, task.agentId),
                eq(ledgerEntries.fromAccount, "requester"),
                gte(ledgerEntries.createdAt, since),
              ),
            );
          if ((spent?.total ?? 0) + payment.amount > agent!.maxDailySpend) {
            throw new DeskError("limit", "this payment would pass the agent's daily spending cap");
          }
        },
        patch: (_task, at) => ({ fundedAt: at, fundingTxHash: payment.txHash }),
        after: (tx, task, at) => recordFunding(tx, task, payment.txHash, at),
      });
    },

    async cancelTask(caller: Caller, taskId: string) {
      requireRole(caller, "requester");
      return mutate(taskId, caller, { type: "cancel" });
    },

    async claimTask(caller: Caller, taskId: string) {
      requireRole(caller, "worker");
      return mutate(taskId, caller, { type: "claim", workerId: caller.workerId }, {
        async check(tx, task, at) {
          if (task.deadline <= at) throw new DeskError("conflict", "task deadline has passed");
          const [worker] = await tx.select().from(workers).where(eq(workers.id, caller.workerId));
          if (!worker) throw new DeskError("not_found", "worker not found");
          if (!meetsAttributes(task.requiredAttributes, worker.provenAttributes)) {
            throw new DeskError("forbidden", "you haven't proven the attributes this task requires");
          }
          const [active] = await tx
            .select({ n: sql<number>`count(*)::int` })
            .from(tasks)
            .where(and(eq(tasks.claimedBy, worker.id), eq(tasks.status, "claimed")));
          if ((active?.n ?? 0) >= worker.maxActiveClaims) {
            throw new DeskError("limit", "finish your current task before claiming another");
          }
        },
        patch: (task, at) => ({
          claimedBy: caller.workerId,
          claimExpiresAt: new Date(
            Math.min(at.getTime() + POLICY.claimDurationMs, task.deadline.getTime()),
          ),
        }),
      });
    },

    async releaseTask(caller: Caller, taskId: string) {
      requireRole(caller, "worker");
      return mutate(taskId, caller, { type: "release" }, {
        patch: () => ({ claimedBy: null, claimExpiresAt: null }),
      });
    },

    async submitResult(caller: Caller, taskId: string, result: { text?: string; fileUrls?: string[] }) {
      requireRole(caller, "worker");
      const text = result.text?.trim() || null;
      const fileUrls = result.fileUrls ?? [];
      return mutate(taskId, caller, { type: "submit" }, {
        payload: { text, fileUrls },
        check(_tx, task, at) {
          if (task.claimExpiresAt && task.claimExpiresAt <= at) {
            throw new DeskError("conflict", "your claim has expired");
          }
          if (task.resultFormat === "text" ? !text : fileUrls.length === 0) {
            throw new DeskError("invalid", `this task needs a ${task.resultFormat} result`);
          }
        },
        patch: () => ({ claimExpiresAt: null }),
        async after(tx, task, at) {
          await tx.insert(submissions).values({
            taskId: task.id,
            workerId: caller.workerId,
            text,
            fileUrls,
            createdAt: at,
          });
        },
      });
    },

    /** The reviewer's pass or fail. Every fail cites a rule (R5.3). */
    async recordVerdict(
      caller: Caller,
      taskId: string,
      verdict: { outcome: "pass" | "fail"; ruleIds: string[]; reasoning: string },
    ) {
      requireRole(caller, "reviewer");
      if (verdict.outcome === "fail" && verdict.ruleIds.length === 0) {
        throw new DeskError("invalid", "a fail must cite at least one rule");
      }
      return mutate(
        taskId,
        caller,
        verdict.outcome === "pass"
          ? { type: "verdict_pass", ruleIds: verdict.ruleIds }
          : { type: "verdict_fail", ruleIds: verdict.ruleIds },
        {
          payload: { ...verdict, reviewerRef: caller.reviewerRef },
          patch: (_task, at) => ({ reviewerRef: caller.reviewerRef, verdictAt: at }),
        },
      );
    },

    async acceptEarly(caller: Caller, taskId: string) {
      requireRole(caller, "requester");
      return mutate(taskId, caller, { type: "accept_early" });
    },

    async disputeVerdict(caller: Caller, taskId: string, reason: string) {
      requireRole(caller, "requester", "worker");
      if (reason.trim().length < 10) throw new DeskError("invalid", "give a reason of at least 10 characters");
      return mutate(taskId, caller, { type: "dispute", by: caller.role, reason: reason.trim() }, {
        check(_tx, task, at) {
          if (task.verdictAt && at.getTime() - task.verdictAt.getTime() > POLICY.objectionWindowMs) {
            throw new DeskError("conflict", "the objection window has closed");
          }
        },
      });
    },

    async decideDispute(
      caller: Caller,
      taskId: string,
      decision: { outcome: "pass" | "fail"; ruleIds: string[]; reasoning: string },
    ) {
      requireRole(caller, "panel");
      return mutate(
        taskId,
        caller,
        decision.outcome === "pass"
          ? { type: "panel_pass", ruleIds: decision.ruleIds }
          : { type: "panel_fail", ruleIds: decision.ruleIds },
        { payload: { ...decision, panelRef: caller.reviewerRef } },
      );
    },

    // Timers, run by the monitor loop. Each task moves in its own transaction, so one
    // failure or a race with a user action never blocks the rest.

    async expireClaims() {
      return sweep(
        and(eq(tasks.status, "claimed"), lte(tasks.claimExpiresAt, now())),
        { type: "claim_expired" },
        () => ({ claimedBy: null, claimExpiresAt: null }),
      );
    },

    async expireDeadlines() {
      return sweep(and(eq(tasks.status, "open"), lte(tasks.deadline, now())), {
        type: "deadline_passed",
      });
    },

    async closeObjectionWindows() {
      const cutoff = new Date(now().getTime() - POLICY.objectionWindowMs);
      return sweep(
        and(inArray(tasks.status, ["passed", "failed"]), lte(tasks.verdictAt, cutoff)),
        { type: "window_closed" },
      );
    },

    async getTask(caller: Caller, taskId: string) {
      const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
      if (!task) throw new DeskError("not_found", "task not found");
      if (caller.role === "requester" && task.agentId !== caller.agentId) {
        throw new DeskError("not_found", "task not found");
      }
      if (caller.role === "worker" && task.status !== "open" && task.claimedBy !== caller.workerId) {
        throw new DeskError("not_found", "task not found");
      }
      return task;
    },

    async getTrail(caller: Caller, taskId: string) {
      await this.getTask(caller, taskId);
      return db
        .select({
          type: taskEvents.type,
          actor: taskEvents.actor,
          hash: taskEvents.hash,
          prevHash: taskEvents.prevHash,
          at: taskEvents.createdAt,
        })
        .from(taskEvents)
        .where(eq(taskEvents.taskId, taskId))
        .orderBy(asc(taskEvents.id));
    },
  };

  async function sweep(
    where: ReturnType<typeof and>,
    event: TaskEvent,
    patch?: () => TaskPatch,
  ): Promise<number> {
    const due = await db.select({ id: tasks.id }).from(tasks).where(where);
    let moved = 0;
    for (const { id } of due) {
      try {
        await mutate(id, { role: "system" }, event, patch ? { patch } : {});
        moved++;
      } catch (error) {
        // A user action got there first; the state machine refused the stale move.
        if (!(error instanceof DeskError && error.code === "conflict")) throw error;
      }
    }
    return moved;
  }
}

export type Desk = ReturnType<typeof createDesk>;
