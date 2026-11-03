import { agents, and, asc, type Database, eq, inArray, ledgerEntries, owners, sql, taskEvents, tasks, workers } from "@boreal/db";

import { DeskError } from "./errors";

/** The desk's caller, by shape (importing the desk's own type here would make it refer to itself). */
type Caller = { role: string; workerId?: string };

// A person's own money, for their insights page: what they spent on tasks they or their agents
// posted, and what they earned doing tasks. Read-only, scoped to the signed-in worker. Live money
// only. Nobody else's identity appears: other people show as "a worker" or by requester kind.

/** Below this many tasks a report says little, so My account doesn't offer one. */
export const INSIGHTS_MIN_TASKS = 3;

const VERDICTS = ["verdict_pass", "verdict_fail", "panel_pass", "panel_fail"];
const hours = (from: Date | undefined, to: Date | undefined) =>
  from && to ? Math.round(((to.getTime() - from.getTime()) / 3_600_000) * 10) / 10 : null;

function asWorker(caller: Caller): string {
  if (caller.role !== "worker" || !caller.workerId) throw new DeskError("forbidden", `${caller.role} cannot do this`);
  return caller.workerId;
}

export function insightsViews(db: Database) {
  /** Agents this worker owns, their personal requester included. */
  async function ownedAgents(workerId: string) {
    return db
      .select({ id: agents.id, name: agents.name, kind: agents.kind })
      .from(agents)
      .innerJoin(owners, eq(owners.id, agents.ownerId))
      .innerJoin(workers, eq(workers.pseudonym, owners.verifiedRef))
      .where(eq(workers.id, workerId));
  }

  return {
    /** Which reports this person has enough live money for; My account links only to those. */
    async insightsAvailable(caller: Caller): Promise<{ spending: boolean; earnings: boolean }> {
      const workerId = asWorker(caller);
      const mine = (await ownedAgents(workerId)).map((a) => a.id);
      const [spent] = mine.length
        ? await db
            .select({ n: sql<number>`count(*)::int` })
            .from(tasks)
            .where(and(inArray(tasks.agentId, mine), eq(tasks.test, false), sql`${tasks.fundedAt} is not null`))
        : [{ n: 0 }];
      const [earned] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(ledgerEntries)
        .innerJoin(tasks, eq(tasks.id, ledgerEntries.taskId))
        .where(and(eq(ledgerEntries.toAccount, "worker"), eq(ledgerEntries.party, workerId), eq(ledgerEntries.status, "settled"), eq(tasks.test, false)));
      return { spending: (spent?.n ?? 0) >= INSIGHTS_MIN_TASKS, earnings: (earned?.n ?? 0) >= INSIGHTS_MIN_TASKS };
    },

    /**
     * Every live task this person or their agents posted, with its money: one row per task and one
     * per ledger entry. Amounts are cents.
     */
    async mySpending(caller: Caller) {
      const workerId = asWorker(caller);
      const mine = await ownedAgents(workerId);
      const names = new Map(mine.map((a) => [a.id, a.kind === "personal" ? "You, on the website" : a.name]));
      if (mine.length === 0) return { tasks: [], entries: [] };
      const list = await db
        .select()
        .from(tasks)
        .where(and(inArray(tasks.agentId, [...names.keys()]), eq(tasks.test, false)))
        .orderBy(asc(tasks.createdAt))
        .limit(2_000);
      const ids = list.map((t) => t.id);
      const entries = ids.length ? await db.select().from(ledgerEntries).where(inArray(ledgerEntries.taskId, ids)).orderBy(asc(ledgerEntries.id)) : [];
      const events = ids.length
        ? await db.select({ taskId: taskEvents.taskId, type: taskEvents.type, at: taskEvents.createdAt }).from(taskEvents).where(inArray(taskEvents.taskId, ids)).orderBy(asc(taskEvents.id))
        : [];
      const firstAt = (taskId: string, type: string) => events.find((e) => e.taskId === taskId && e.type === type)?.at;
      const standing = (taskId: string) => events.filter((e) => e.taskId === taskId && VERDICTS.includes(e.type)).at(-1);
      const personal = new Set(mine.filter((a) => a.kind === "personal").map((a) => a.id));
      return {
        tasks: list.map((t) => {
          const verdict = standing(t.id);
          return {
            id: t.id,
            ref: t.id.slice(0, 8),
            /** Only tasks posted on the website have a page of their own under My account. */
            ownPage: personal.has(t.agentId),
            postedBy: names.get(t.agentId)!,
            description: t.description.slice(0, 120),
            status: t.status,
            rail: t.paymentRail ?? "unfunded",
            total: t.fundedAt ? t.budget + t.platformFee + t.reviewFee : 0,
            budget: t.budget,
            verdict: verdict ? (verdict.type.endsWith("_pass") ? "pass" : "fail") : "",
            postedAt: t.createdAt,
            hoursToClaim: hours(firstAt(t.id, "fund"), firstAt(t.id, "claim")),
            hoursToResult: hours(firstAt(t.id, "fund"), firstAt(t.id, "submit")),
          };
        }),
        entries: entries.map((e) => {
          const t = list.find((x) => x.id === e.taskId)!;
          const kind =
            e.fromAccount === "requester" ? "funding" : e.toAccount === "worker" ? "worker pay" : e.toAccount === "reviewer" ? "review fee" : e.toAccount === "operating" ? "platform fee" : "refund";
          return {
            id: e.id,
            taskId: e.taskId!,
            postedBy: names.get(t.agentId)!,
            rail: t.paymentRail ?? "unfunded",
            kind,
            status: e.status,
            held: kind === "funding" && e.status === "pending",
            amount: e.amount,
            at: e.createdAt,
          };
        }),
      };
    },

    /** Every live task this person claimed and what it paid them. Amounts are cents. */
    async myEarnings(caller: Caller) {
      const workerId = asWorker(caller);
      const list = await db
        .select({ task: tasks, requesterKind: agents.kind, badged: sql<boolean>`${agents.badgeVerifiedAt} is not null` })
        .from(tasks)
        .innerJoin(agents, eq(agents.id, tasks.agentId))
        .where(and(eq(tasks.claimedBy, workerId), eq(tasks.test, false)))
        .orderBy(asc(tasks.createdAt))
        .limit(2_000);
      const ids = list.map((r) => r.task.id);
      const pay = ids.length
        ? await db
            .select()
            .from(ledgerEntries)
            .where(and(inArray(ledgerEntries.taskId, ids), eq(ledgerEntries.toAccount, "worker"), eq(ledgerEntries.party, workerId)))
        : [];
      const steps = ids.length
        ? await db
            .select({ taskId: taskEvents.taskId, type: taskEvents.type, at: taskEvents.createdAt })
            .from(taskEvents)
            .where(and(inArray(taskEvents.taskId, ids), inArray(taskEvents.type, ["claim", "submit"])))
            .orderBy(asc(taskEvents.id))
        : [];
      // Their own claim and submission: a task can be claimed again after a claim expires.
      const last = (taskId: string, type: string) => steps.filter((s) => s.taskId === taskId && s.type === type).at(-1)?.at;
      return list.map(({ task, requesterKind, badged }) => {
        const entry = pay.find((e) => e.taskId === task.id);
        const state = entry
          ? entry.status === "settled"
            ? "paid"
            : entry.status === "pending"
              ? "on its way"
              : "returned"
          : task.status === "passed" || task.status === "disputed"
            ? "held for you"
            : task.status === "final_fail" || task.status === "failed"
              ? "not paid"
              : "in progress";
        const sentAt = last(task.id, "submit");
        return {
          id: task.id,
          ref: task.id.slice(0, 8),
          description: task.description.slice(0, 120),
          requester: requesterKind === "personal" ? "a person" : requesterKind === "market" ? "a NEAR market buyer" : badged ? "a verified agent" : "an agent",
          rail: task.paymentRail ?? "test",
          state,
          amount: entry?.amount ?? (state === "held for you" ? task.budget : 0),
          paid: state === "paid" ? (entry?.amount ?? 0) : 0,
          claimedAt: last(task.id, "claim") ?? task.createdAt,
          submittedAt: sentAt ?? null,
          paidAt: entry?.status === "settled" ? entry.updatedAt : null,
          hoursToPaid: entry?.status === "settled" ? hours(sentAt, entry.updatedAt) : null,
        };
      });
    },
  };
}
