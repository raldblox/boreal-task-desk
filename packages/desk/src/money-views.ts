import { POLICY, type TaskStatus } from "@boreal/core";
import { and, type Database, desc, eq, inArray, ledgerEntries, type Task, tasks } from "@boreal/db";

import type { Caller } from "./desk";
import { DeskError } from "./errors";
import { taskTotal } from "./money";

// Read-only views of the ledger, so agents and workers can see where their money is: held
// in escrow, waiting out a verdict, paid out, refunded or still settling. Nothing here moves
// money; settle() in money.ts does that.

type Entry = typeof ledgerEntries.$inferSelect;

const VERDICT_WINDOW: readonly TaskStatus[] = ["passed", "failed", "disputed"];

/** One task's money, from its ledger entries. Amounts are US cents. */
export function taskMoney(task: Task, entries: Entry[]) {
  const mine = entries.filter((e) => e.taskId === task.id);
  const funded = mine.filter((e) => e.fromAccount === "requester").reduce((sum, e) => sum + e.amount, 0);
  const out = mine.filter((e) => e.fromAccount === "escrow");
  const sumTo = (to: Entry["toAccount"]) => out.filter((e) => e.toAccount === to).reduce((sum, e) => sum + e.amount, 0);
  const pending = out.filter((e) => e.status !== "settled").reduce((sum, e) => sum + e.amount, 0);
  const paidOut = { worker: sumTo("worker"), reviewer: sumTo("reviewer"), platform: sumTo("operating") };
  const refunded = sumTo("requester");
  const inEscrow = funded - out.reduce((sum, e) => sum + e.amount, 0);

  let state: "not_funded" | "held" | "awaiting_final_verdict" | "settling" | "paid_out" | "refunded" | "closed";
  if (funded === 0) state = task.status === "awaiting_funding" || task.status === "posted" ? "not_funded" : "closed";
  else if (pending > 0) state = "settling";
  else if (inEscrow > 0) state = VERDICT_WINDOW.includes(task.status) ? "awaiting_final_verdict" : "held";
  else state = paidOut.worker > 0 ? "paid_out" : "refunded";

  const finalAt =
    task.verdictAt && (task.status === "passed" || task.status === "failed")
      ? new Date(task.verdictAt.getTime() + POLICY.objectionWindowMs)
      : null;
  return {
    state,
    test: task.test,
    total: taskTotal(task),
    funded,
    inEscrow,
    paidOut,
    refunded,
    settling: pending,
    /** When the verdict becomes final and the money moves, unless someone disputes. */
    finalAt,
  };
}

async function entriesFor(db: Database, taskIds: string[]): Promise<Entry[]> {
  if (taskIds.length === 0) return [];
  return db.select().from(ledgerEntries).where(inArray(ledgerEntries.taskId, taskIds));
}

/** What a ledger entry means, in the words of the party reading it. */
function describe(entry: Entry): string {
  if (entry.fromAccount === "requester") return "funded into escrow";
  switch (entry.toAccount) {
    case "worker":
      return "paid to the worker";
    case "reviewer":
      return "review fee to the reviewer";
    case "operating":
      return "platform fee to boreal";
    case "requester":
      return "refunded to you";
    default:
      return `${entry.fromAccount} to ${entry.toAccount}`;
  }
}

function as<R extends Caller["role"]>(caller: Caller, role: R): asserts caller is Extract<Caller, { role: R }> {
  if (caller.role !== role) throw new DeskError("forbidden", `${caller.role} cannot do this`);
}

export function moneyViews(db: Database) {
  async function agentTasks(agentId: string) {
    return db.select().from(tasks).where(eq(tasks.agentId, agentId)).orderBy(desc(tasks.createdAt)).limit(500);
  }

  return {
    /** get_balance: the agent's money across all its tasks, and what it can do about it. */
    async getBalance(caller: Caller) {
      as(caller, "requester");
      const list = await agentTasks(caller.agentId);
      const entries = await entriesFor(db, list.map((t) => t.id));
      const rows = list.map((task) => ({ task, money: taskMoney(task, entries) }));
      const sum = (pick: (m: ReturnType<typeof taskMoney>) => number) => rows.reduce((total, r) => total + pick(r.money), 0);
      const awaiting = rows.filter((r) => r.money.state === "awaiting_final_verdict");
      return {
        currency: "USD cents",
        inEscrow: sum((m) => m.inEscrow),
        awaitingFinalVerdict: awaiting.reduce((total, r) => total + r.money.inEscrow, 0),
        settling: sum((m) => m.settling),
        totals: {
          funded: sum((m) => m.funded),
          paidToWorkers: sum((m) => m.paidOut.worker),
          reviewFees: sum((m) => m.paidOut.reviewer),
          platformFees: sum((m) => m.paidOut.platform),
          refunded: sum((m) => m.refunded),
        },
        /** Money you can act on now. */
        actions: {
          fund: rows.filter((r) => r.task.status === "awaiting_funding").map((r) => ({ taskId: r.task.id, total: r.money.total })),
          cancelForRefund: rows
            .filter((r) => r.task.status === "open")
            .map((r) => ({ taskId: r.task.id, inEscrow: r.money.inEscrow })),
          acceptToPayNow: rows.filter((r) => r.task.status === "passed").map((r) => ({ taskId: r.task.id, finalAt: r.money.finalAt })),
          review: rows
            .filter((r) => r.task.status === "submitted" && r.task.reviewMode === "requester")
            .map((r) => ({ taskId: r.task.id })),
        },
        awaiting: awaiting.map((r) => ({ taskId: r.task.id, status: r.task.status, inEscrow: r.money.inEscrow, finalAt: r.money.finalAt })),
      };
    },

    /** get_ledger: every money movement on the agent's tasks, newest first. */
    async getLedger(caller: Caller, filter: { taskId?: string; limit?: number } = {}) {
      as(caller, "requester");
      const list = await agentTasks(caller.agentId);
      const ids = filter.taskId ? list.filter((t) => t.id === filter.taskId).map((t) => t.id) : list.map((t) => t.id);
      if (ids.length === 0) return [];
      const limit = Math.min(Math.max(filter.limit ?? 50, 1), 200);
      const rows = await db
        .select()
        .from(ledgerEntries)
        .where(inArray(ledgerEntries.taskId, ids))
        .orderBy(desc(ledgerEntries.createdAt), desc(ledgerEntries.id))
        .limit(limit);
      const test = new Map(list.map((t) => [t.id, t.test]));
      return rows.map((e) => ({
        at: e.createdAt,
        taskId: e.taskId,
        what: describe(e),
        from: e.fromAccount,
        to: e.toAccount,
        amount: e.amount,
        status: e.status,
        test: test.get(e.taskId ?? "") ?? false,
        txHash: e.txHash?.startsWith("test:") ? null : e.txHash,
      }));
    },

    /** One task's money, for get_task. The caller must already be allowed to see the task. */
    async taskMoneyFor(task: Task) {
      return taskMoney(task, await entriesFor(db, [task.id]));
    },

    /** A worker's earnings: paid, settling, and passes still inside their objection window. */
    async getWorkerEarnings(caller: Caller) {
      as(caller, "worker");
      const workerId = caller.workerId;
      const claimed = await db.select().from(tasks).where(eq(tasks.claimedBy, workerId)).limit(500);
      const paid = await db
        .select()
        .from(ledgerEntries)
        .where(and(eq(ledgerEntries.toAccount, "worker"), eq(ledgerEntries.party, workerId)))
        .orderBy(desc(ledgerEntries.createdAt));
      const test = new Map(claimed.map((t) => [t.id, t.test]));
      const bucket = (isTest: boolean) => {
        const mine = paid.filter((e) => (test.get(e.taskId ?? "") ?? false) === isTest);
        return {
          paid: mine.filter((e) => e.status === "settled").reduce((sum, e) => sum + e.amount, 0),
          settling: mine.filter((e) => e.status !== "settled").reduce((sum, e) => sum + e.amount, 0),
          // A pass becomes money once its window closes (or the requester accepts early).
          upcoming: claimed
            .filter((t) => t.test === isTest && (t.status === "passed" || t.status === "disputed"))
            .reduce((sum, t) => sum + t.budget, 0),
        };
      };
      return { real: bucket(false), test: bucket(true), payouts: paid.slice(0, 20).map((e) => ({ at: e.createdAt, taskId: e.taskId, amount: e.amount, status: e.status, test: test.get(e.taskId ?? "") ?? false })) };
    },
  };
}

