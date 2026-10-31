import { timingSafeEqual } from "node:crypto";

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
import type { Concordium, ProofRequest } from "@boreal/concordium";
import {
  agents,
  and,
  asc,
  type Database,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNull,
  ledgerEntries,
  lte,
  or,
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
import { drainOutbox, type PayoutAddresses, reconcileEscrow } from "./outbox";
import { appendEvent } from "./trail";

export type Caller =
  | { role: "requester"; agentId: string }
  | { role: "worker"; workerId: string }
  | { role: "reviewer"; reviewerRef: string }
  | { role: "panel"; reviewerRef: string }
  | { role: "system" };

export interface DeskOptions {
  db: Database;
  /** Invite code for test workers (TEST_WORKER_INVITE); unset = test sign-in off. */
  testInvite?: string;
  now?: () => Date;
  /** Concordium adapters. Without them the registry check, sign-in and the outbox stay off. */
  concordium?: Concordium | null;
  /** Payout accounts for the platform and reviewers; workers and agents carry their own. */
  addresses?: PayoutAddresses;
}

/** A payment that has settled, or one to settle once the task's checks pass. */
export type FundingPayment =
  | { txHash: string; amount: number }
  | { confirm: () => Promise<{ txHash: string; amount: number }> };

type TaskPatch = Partial<typeof tasks.$inferInsert>;

/** A reviewer's decision clears any AI retry state and takes the task off the human queue. */
const CLEAR_AI: TaskPatch = { needsHuman: false, humanReason: null, aiAttempts: 0, aiRetryAt: null };
const MAX_AI_ATTEMPTS = 3;
const TEST_SCREENER: Caller = { role: "reviewer", reviewerRef: "test-mode" };

interface MutateOptions {
  /** Extra checks beyond the state machine, run on the locked row. */
  check?: (tx: Transaction, task: Task, at: Date) => Promise<void> | void;
  patch?: (task: Task, at: Date) => TaskPatch;
  after?: (tx: Transaction, task: Task, at: Date) => Promise<void>;
  /** Event payload; a function is read after `check`, so it can include what the check learned. */
  payload?: unknown | (() => unknown);
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

export function createDesk({
  db,
  now = () => new Date(),
  concordium = null,
  addresses = {},
  testInvite,
}: DeskOptions) {
  function requireConcordium(): Concordium {
    if (!concordium) throw new DeskError("unavailable", "Concordium adapters are not configured");
    return concordium;
  }

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
        payload: typeof options.payload === "function" ? options.payload() : (options.payload ?? event),
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

      // Flow step 2 comes first: who is asking, before what they ask.
      const [agent] = await db.select().from(agents).where(eq(agents.id, caller.agentId));
      if (!agent) throw new DeskError("not_found", "agent not found");
      if (agent.status !== "active") throw new DeskError("forbidden", "agent is frozen");
      if (concordium) {
        const entry = await concordium.registry.lookup(agent.registryId);
        if (!entry?.verified) {
          throw new DeskError("forbidden", "agent has no Verified by Concordium badge in the Agent Registry");
        }
      }

      const parsed = postTaskInput.safeParse(input);
      if (!parsed.success) {
        const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`);
        throw new DeskError("invalid", issues.join("; "));
      }
      const data = parsed.data;

      const at = now();
      if (new Date(data.deadline) <= at) throw new DeskError("invalid", "deadline is in the past");
      if (data.budget > agent.maxTaskBudget) {
        throw new DeskError("limit", "budget exceeds this agent's per-task cap");
      }

      const quote = quoteFees(data.budget, { reviewer: data.reviewer });
      const posted = await db.transaction(async (tx) => {
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
            test: agent.testMode,
            reviewMode: data.reviewer,
            createdAt: at,
            updatedAt: at,
          })
          .returning();
        await appendEvent(tx, { taskId: task!.id, type: "posted", actor: "requester", payload: data, at });
        return { task: task!, quote };
      });
      if (!agent.testMode) return posted;
      // Test agents skip screening (recorded in the trail), so test runs don't wait on a reviewer.
      const screened = await mutate(posted.task.id, TEST_SCREENER, { type: "screen_ok" }, {
        payload: { outcome: "ok", reasoning: "Test agent: screening skipped.", reviewerRef: "test-mode" },
      });
      return { task: screened, quote };
    },

    async screenTask(
      caller: Caller,
      taskId: string,
      result: { outcome: "ok"; reasoning?: string } | { outcome: "refused"; ruleIds: string[]; reasoning?: string },
    ) {
      requireRole(caller, "reviewer");
      if (result.outcome === "refused" && result.ruleIds.length === 0) {
        throw new DeskError("invalid", "a refusal must cite at least one rule");
      }
      return mutate(
        taskId,
        caller,
        result.outcome === "ok" ? { type: "screen_ok" } : { type: "screen_refused", ruleIds: result.ruleIds },
        { payload: { ...result, reviewerRef: caller.reviewerRef }, patch: () => CLEAR_AI },
      );
    },

    /**
     * fund_task. With `confirm`, the payment settles only after the task's own checks pass,
     * so a refused task never takes money. The amount must match the quote exactly.
     */
    async fundTask(caller: Caller, taskId: string, payment: FundingPayment) {
      requireRole(caller, "requester");
      let settled: { txHash: string; amount: number } | undefined;
      return mutate(taskId, caller, { type: "fund" }, {
        payload: () => settled,
        async check(tx, task, at) {
          const total = taskTotal(task);
          if ("amount" in payment && payment.amount !== total) {
            throw new DeskError("invalid", `payment must be exactly ${total}`);
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
          if ((spent?.total ?? 0) + total > agent!.maxDailySpend) {
            throw new DeskError("limit", "this payment would pass the agent's daily spending cap");
          }
          settled = "confirm" in payment ? await payment.confirm() : payment;
          if (settled.amount !== total) {
            // Money moved but doesn't match: needs an operator, so it's loud.
            console.error(`[desk] task ${task.id} settled ${settled.amount}, expected ${total}`, settled);
            throw new DeskError("invalid", `payment must be exactly ${total}`);
          }
        },
        patch: (_task, at) => ({ fundedAt: at, fundingTxHash: settled!.txHash }),
        after: (tx, task, at) => recordFunding(tx, task, settled!.txHash, at),
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
          if (task.test !== worker.testMode) {
            throw new DeskError("forbidden", task.test ? "this is a test task" : "test workers can only claim test tasks");
          }
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
          // Files are stored per task; a submission can only point at its own task's files.
          if (fileUrls.some((path) => !path.startsWith(`submissions/${task.id}/`) || path.includes(".."))) {
            throw new DeskError("invalid", "files must be uploaded for this task");
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
      verdict: { outcome: "pass" | "fail"; ruleIds: string[]; reasoning: string; model?: string },
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
          patch: (_task, at) => ({ ...CLEAR_AI, reviewerRef: caller.reviewerRef, verdictAt: at }),
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

    /** Starts Concordium ID sign-in: the proof the worker's wallet must answer. */
    async workerProofRequest(attributes: ProofRequest["attributes"] = []) {
      return requireConcordium().identity.createProofRequest(attributes);
    },

    /**
     * Finishes sign-in. One account per person: the same pseudonym always maps to the same
     * worker, and its proven attributes are refreshed from the latest proof.
     */
    async signInWorker(request: ProofRequest, presentation: unknown, payoutAddress?: string) {
      let verified;
      try {
        verified = await requireConcordium().identity.verifyPresentation(request, presentation);
      } catch (error) {
        if (error instanceof DeskError) throw error;
        throw new DeskError("forbidden", error instanceof Error ? error.message : "proof was not accepted");
      }
      const at = now();
      const [worker] = await db
        .insert(workers)
        .values({
          pseudonym: verified.pseudonym,
          provenAttributes: verified.provenAttributes,
          payoutAddress: payoutAddress ?? null,
          createdAt: at,
          updatedAt: at,
        })
        .onConflictDoUpdate({
          target: workers.pseudonym,
          set: {
            provenAttributes: verified.provenAttributes,
            ...(payoutAddress ? { payoutAddress } : {}),
            updatedAt: at,
          },
        })
        .returning();
      return worker!;
    },

    /** Tasks waiting on the AI reviewer: posted ones to screen, submitted ones to review. */
    async aiQueue(stage: "screen" | "review", limit = 10) {
      return db
        .select()
        .from(tasks)
        .where(
          and(
            eq(tasks.status, stage === "screen" ? "posted" : "submitted"),
            // Requester-reviewed tasks are judged by their requester, not the AI.
            stage === "review" ? eq(tasks.reviewMode, "boreal") : undefined,
            eq(tasks.needsHuman, false),
            or(isNull(tasks.aiRetryAt), lte(tasks.aiRetryAt, now())),
          ),
        )
        .orderBy(asc(tasks.updatedAt))
        .limit(limit);
    },

    /** Tasks a human reviewer must decide, oldest first. */
    async humanQueue(limit = 50) {
      return db.select().from(tasks).where(eq(tasks.needsHuman, true)).orderBy(asc(tasks.updatedAt)).limit(limit);
    },

    /** Hands a task to the human queue, recorded in the trail. The task's state doesn't change. */
    async flagForHuman(caller: Caller, taskId: string, reason: string) {
      requireRole(caller, "reviewer", "system");
      return db.transaction(async (tx) => {
        const at = now();
        const [task] = await tx.select().from(tasks).where(eq(tasks.id, taskId)).for("update");
        if (!task) throw new DeskError("not_found", "task not found");
        const [updated] = await tx
          .update(tasks)
          .set({ needsHuman: true, humanReason: reason, aiRetryAt: null, updatedAt: at })
          .where(eq(tasks.id, taskId))
          .returning();
        await appendEvent(tx, { taskId, type: "flagged_for_human", actor: caller.role, payload: { reason }, at });
        return updated!;
      });
    },

    /** Records a failed AI attempt; retries back off, and the third failure goes to a human. */
    async deferAi(taskId: string, reason: string) {
      const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
      if (!task) throw new DeskError("not_found", "task not found");
      const attempts = task.aiAttempts + 1;
      if (attempts >= MAX_AI_ATTEMPTS) {
        return this.flagForHuman({ role: "system" }, taskId, `AI reviewer failed ${attempts} times: ${reason}`);
      }
      const [updated] = await db
        .update(tasks)
        .set({ aiAttempts: attempts, aiRetryAt: new Date(now().getTime() + 2 ** attempts * 60_000) })
        .where(eq(tasks.id, taskId))
        .returning();
      return updated!;
    },

    /** Sends due anchors, payouts and refunds. Run by the monitor loop. */
    async drainOutbox(limit?: number) {
      return drainOutbox(db, requireConcordium(), { now, addresses, limit });
    },

    async reconcileEscrow() {
      return reconcileEscrow(db, requireConcordium());
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

    /** Open tasks this worker has proven the attributes for, newest first. */
    async browseOpenTasks(caller: Caller) {
      requireRole(caller, "worker");
      const [worker] = await db.select().from(workers).where(eq(workers.id, caller.workerId));
      if (!worker) throw new DeskError("not_found", "worker not found");
      const open = await db
        .select()
        .from(tasks)
        .where(and(eq(tasks.status, "open"), gt(tasks.deadline, now())))
        .orderBy(desc(tasks.createdAt))
        .limit(100);
      return open.filter(
        (task) => task.test === worker.testMode && meetsAttributes(task.requiredAttributes, worker.provenAttributes),
      );
    },

    /** The worker's own tasks: claimed, submitted, under review and finished. */
    async listWorkerTasks(caller: Caller) {
      requireRole(caller, "worker");
      return db
        .select()
        .from(tasks)
        .where(eq(tasks.claimedBy, caller.workerId))
        .orderBy(desc(tasks.updatedAt))
        .limit(50);
    },

    /**
     * review_result for tasks posted with `reviewer: "requester"`: the requester judges its own
     * task. The same rules bind it: a fail cites a rule, and the worker can dispute once.
     */
    async requesterReview(
      caller: Caller,
      taskId: string,
      verdict: { outcome: "pass" | "fail"; ruleIds: string[]; reasoning: string },
    ) {
      requireRole(caller, "requester");
      const task = await this.getTask(caller, taskId);
      if (task.reviewMode !== "requester") {
        throw new DeskError("forbidden", "boreal's reviewer judges this task; you can accept a pass early or dispute");
      }
      if (verdict.outcome === "fail" && verdict.ruleIds.length === 0) {
        throw new DeskError("invalid", "a fail must cite at least one rule (R5.3)");
      }
      if (verdict.reasoning.trim().length < 5) throw new DeskError("invalid", "explain the verdict for the worker");
      const reviewer: Caller = { role: "reviewer", reviewerRef: `requester:${caller.agentId}` };
      return mutate(
        taskId,
        reviewer,
        verdict.outcome === "pass"
          ? { type: "verdict_pass", ruleIds: verdict.ruleIds }
          : { type: "verdict_fail", ruleIds: verdict.ruleIds },
        {
          payload: { ...verdict, reviewerRef: reviewer.reviewerRef },
          patch: (_task, at) => ({ ...CLEAR_AI, reviewerRef: reviewer.reviewerRef, verdictAt: at }),
        },
      );
    },

    /**
     * Test sign-in for allowlisted testers while Concordium ID isn't live: an invite code
     * instead of a proof, and the worker is walled off to test tasks.
     */
    async signInTestWorker(invite: string, pseudonym: string, attributes: Record<string, string>) {
      const expected = Buffer.from(testInvite ?? "");
      const given = Buffer.from(invite);
      if (!testInvite || testInvite.length < 12 || expected.length !== given.length || !timingSafeEqual(expected, given)) {
        throw new DeskError("forbidden", "that invite code isn't valid");
      }
      const name = pseudonym.trim();
      if (!/^[a-z0-9-]{3,32}$/.test(name)) {
        throw new DeskError("invalid", "pseudonym: 3 to 32 lowercase letters, digits or dashes");
      }
      const at = now();
      const [worker] = await db
        .insert(workers)
        .values({ pseudonym: `test:${name}`, provenAttributes: attributes, testMode: true, createdAt: at, updatedAt: at })
        .onConflictDoUpdate({ target: workers.pseudonym, set: { provenAttributes: attributes, updatedAt: at } })
        .returning();
      return worker!;
    },

    /** The verdict that stands: the panel's if there was a dispute, else the reviewer's. Reviewers stay anonymous. */
    async getVerdict(caller: Caller, taskId: string) {
      await this.getTask(caller, taskId);
      const [event] = await db
        .select()
        .from(taskEvents)
        .where(
          and(
            eq(taskEvents.taskId, taskId),
            inArray(taskEvents.type, ["verdict_pass", "verdict_fail", "panel_pass", "panel_fail"]),
          ),
        )
        .orderBy(desc(taskEvents.id))
        .limit(1);
      if (!event) return null;
      const { outcome, ruleIds, reasoning } = event.payload as {
        outcome: "pass" | "fail";
        ruleIds: string[];
        reasoning: string;
      };
      return { outcome, ruleIds, reasoning, by: event.actor as "reviewer" | "panel", at: event.createdAt };
    },

    /** The latest submission, for the worker who made it or the task's requester. */
    async getSubmission(caller: Caller, taskId: string) {
      const task = await this.getTask(caller, taskId);
      if (caller.role === "worker" && task.claimedBy !== caller.workerId) return null;
      const [submission] = await db
        .select()
        .from(submissions)
        .where(eq(submissions.taskId, taskId))
        .orderBy(desc(submissions.createdAt))
        .limit(1);
      return submission ?? null;
    },

    /** list_tasks: the requester's own tasks, newest first. */
    async listTasks(caller: Caller, filter: { status?: TaskStatus; limit?: number } = {}) {
      requireRole(caller, "requester");
      const limit = Math.min(Math.max(filter.limit ?? 20, 1), 100);
      return db
        .select()
        .from(tasks)
        .where(
          filter.status
            ? and(eq(tasks.agentId, caller.agentId), eq(tasks.status, filter.status))
            : eq(tasks.agentId, caller.agentId),
        )
        .orderBy(desc(tasks.createdAt))
        .limit(limit);
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
