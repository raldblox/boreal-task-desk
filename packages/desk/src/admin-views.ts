import type { TaskStatus } from "@boreal/core";
import {
  adminActions,
  agents,
  and,
  asc,
  type Database,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  ledgerEntries,
  or,
  outbox,
  owners,
  sql,
  submissions,
  taskEvents,
  tasks,
  workers,
} from "@boreal/db";

import { DeskError } from "./errors";
import { taskMoney } from "./money-views";
import { parseSendKey } from "./outbox";

// Read-only views for boreal's operators. The web app checks the admin allowlist before
// calling any of these; nothing here changes state. Workers show as their pseudonym and
// proven attributes only: never a PayPal email or a payout account.

const DAY = 24 * 60 * 60 * 1000;
/** Days are bucketed in Manila time, like every date the site shows. */
const MANILA_MS = 8 * 60 * 60 * 1000;
export const manilaDay = (at: Date) => new Date(at.getTime() + MANILA_MS).toISOString().slice(0, 10);

const VERDICTS = ["verdict_pass", "verdict_fail", "panel_pass", "panel_fail"];
/** Live money only; test money never leaves the ledger. */
const live = eq(tasks.test, false);
const railOf = sql<"concordium" | "paypal">`coalesce(${tasks.paymentRail}, 'concordium')`;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

export function adminViews(db: Database, now: () => Date) {
  return {
    /** Tasks by status, recent activity, queue sizes and the outbox's health. */
    async adminOverview() {
      const at = now();
      const byStatus = await db
        .select({ status: tasks.status, test: tasks.test, n: sql<number>`count(*)::int` })
        .from(tasks)
        .groupBy(tasks.status, tasks.test);

      const windows = await Promise.all(
        [1, 7, 30].map(async (days) => {
          const since = new Date(at.getTime() - days * DAY);
          const [posted] = await db
            .select({ live: sql<number>`count(*) filter (where not ${tasks.test})::int`, test: sql<number>`count(*) filter (where ${tasks.test})::int` })
            .from(tasks)
            .where(gte(tasks.createdAt, since));
          const money = await db
            .select({
              kind: sql<"funded" | "paid">`case when ${ledgerEntries.fromAccount} = 'requester' then 'funded' else 'paid' end`,
              n: sql<number>`count(*)::int`,
              amount: sql<number>`coalesce(sum(${ledgerEntries.amount}), 0)::int`,
            })
            .from(ledgerEntries)
            .innerJoin(tasks, eq(tasks.id, ledgerEntries.taskId))
            .where(
              and(
                live,
                gte(ledgerEntries.createdAt, since),
                or(
                  and(eq(ledgerEntries.fromAccount, "requester"), eq(ledgerEntries.toAccount, "escrow")),
                  and(eq(ledgerEntries.toAccount, "worker"), eq(ledgerEntries.status, "settled")),
                ),
              ),
            )
            .groupBy(sql`1`);
          const pick = (kind: "funded" | "paid") => money.find((m) => m.kind === kind) ?? { n: 0, amount: 0 };
          return { days, posted: posted ?? { live: 0, test: 0 }, funded: pick("funded"), paid: pick("paid") };
        }),
      );

      const [queue] = await db
        .select({
          screen: sql<number>`count(*) filter (where ${tasks.status} = 'posted' and not ${tasks.needsHuman})::int`,
          review: sql<number>`count(*) filter (where ${tasks.status} = 'submitted' and ${tasks.reviewMode} = 'boreal' and not ${tasks.needsHuman})::int`,
          human: sql<number>`count(*) filter (where ${tasks.needsHuman})::int`,
          disputed: sql<number>`count(*) filter (where ${tasks.status} = 'disputed')::int`,
          requester: sql<number>`count(*) filter (where ${tasks.status} = 'submitted' and ${tasks.reviewMode} = 'requester')::int`,
        })
        .from(tasks);

      const pendingOutbox = await db
        .select({
          kind: outbox.kind,
          n: sql<number>`count(*)::int`,
          failing: sql<number>`count(*) filter (where ${outbox.lastError} is not null)::int`,
          oldest: sql<string | null>`min(${outbox.createdAt})`,
        })
        .from(outbox)
        .where(isNull(outbox.doneAt))
        .groupBy(outbox.kind);
      const [failedLedger] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(ledgerEntries)
        .where(eq(ledgerEntries.status, "failed"));

      return {
        byStatus,
        windows,
        queue: queue!,
        outbox: pendingOutbox.map((r) => ({ ...r, oldest: r.oldest ? new Date(r.oldest) : null })),
        failedLedgerEntries: failedLedger?.n ?? 0,
      };
    },

    /** Ledger totals per rail and account, recent entries, and money still moving or stuck. */
    async adminMoney() {
      const totals = await db
        .select({
          rail: railOf,
          from: ledgerEntries.fromAccount,
          to: ledgerEntries.toAccount,
          status: ledgerEntries.status,
          n: sql<number>`count(*)::int`,
          amount: sql<number>`coalesce(sum(${ledgerEntries.amount}), 0)::int`,
        })
        .from(ledgerEntries)
        .innerJoin(tasks, eq(tasks.id, ledgerEntries.taskId))
        .where(live)
        .groupBy(railOf, ledgerEntries.fromAccount, ledgerEntries.toAccount, ledgerEntries.status);

      const entry = {
        id: ledgerEntries.id,
        taskId: ledgerEntries.taskId,
        key: ledgerEntries.idempotencyKey,
        from: ledgerEntries.fromAccount,
        to: ledgerEntries.toAccount,
        amount: ledgerEntries.amount,
        status: ledgerEntries.status,
        txHash: ledgerEntries.txHash,
        test: tasks.test,
        rail: tasks.paymentRail,
        at: ledgerEntries.createdAt,
        updatedAt: ledgerEntries.updatedAt,
      };
      const recent = await db
        .select(entry)
        .from(ledgerEntries)
        .innerJoin(tasks, eq(tasks.id, ledgerEntries.taskId))
        .orderBy(desc(ledgerEntries.id))
        .limit(50);
      const unsettled = await db
        .select(entry)
        .from(ledgerEntries)
        .innerJoin(tasks, eq(tasks.id, ledgerEntries.taskId))
        .where(and(live, inArray(ledgerEntries.status, ["pending", "failed"])))
        .orderBy(asc(ledgerEntries.id))
        .limit(100);
      const refunds = await db
        .select(entry)
        .from(ledgerEntries)
        .innerJoin(tasks, eq(tasks.id, ledgerEntries.taskId))
        .where(eq(ledgerEntries.toAccount, "requester"))
        .orderBy(desc(ledgerEntries.id))
        .limit(20);
      // For failed payouts: how many times each was sent, and the provider's latest reason.
      const failedKeys = unsettled.filter((e) => e.status === "failed").map((e) => e.key);
      const failures: Record<string, { sends: number; reason: string | null }> = {};
      if (failedKeys.length > 0) {
        const sends = await db
          .select({ key: sql<string>`${outbox.payload}->>'ledgerKey'`, n: sql<number>`count(*)::int` })
          .from(outbox)
          .where(and(eq(outbox.kind, "payout"), inArray(sql<string>`${outbox.payload}->>'ledgerKey'`, failedKeys)))
          .groupBy(sql`${outbox.payload}->>'ledgerKey'`);
        const reports = await db
          .select({ key: sql<string>`${outbox.payload}->>'ledgerKey'`, detail: sql<string | null>`${outbox.payload}->>'detail'` })
          .from(outbox)
          .where(and(eq(outbox.kind, "reconcile"), sql`${outbox.payload}->>'status' = 'failed'`))
          .orderBy(desc(outbox.id))
          .limit(500);
        for (const key of failedKeys) {
          const report = reports.find((r) => parseSendKey(r.key).ledgerKey === key);
          failures[key] = { sends: sends.find((r) => r.key === key)?.n ?? 0, reason: report?.detail ?? null };
        }
      }
      return { totals, recent, unsettled, refunds, failures, outbox: await this.adminOutbox() };
    },

    /** Outbox rows still to send, oldest first; failing ones carry their last error. */
    async adminOutbox(limit = 100) {
      return db
        .select()
        .from(outbox)
        .where(isNull(outbox.doneAt))
        .orderBy(asc(outbox.id))
        .limit(limit);
    },

    /** Task search: by id or words in the description, status and live or test. */
    async adminTasks(filter: { q?: string; status?: TaskStatus; test?: boolean; limit?: number } = {}) {
      const q = filter.q?.trim();
      return db
        .select({ task: tasks, agentName: agents.name, kind: agents.kind })
        .from(tasks)
        .innerJoin(agents, eq(agents.id, tasks.agentId))
        .where(
          and(
            q ? or(sql`${tasks.id}::text ilike ${`${q}%`}`, sql`${tasks.description} ilike ${`%${q}%`}`) : undefined,
            filter.status ? eq(tasks.status, filter.status) : undefined,
            filter.test === undefined ? undefined : eq(tasks.test, filter.test),
          ),
        )
        .orderBy(desc(tasks.createdAt))
        .limit(Math.min(Math.max(filter.limit ?? 100, 1), 500));
    },

    /** Everything about one task: trail with payloads, submission, verdict, money and outbox. */
    async adminTask(taskId: string) {
      if (!/^[0-9a-f-]{36}$/i.test(taskId)) throw new DeskError("not_found", "task not found");
      const [row] = await db
        .select({ task: tasks, agent: { id: agents.id, name: agents.name, status: agents.status, testMode: agents.testMode, kind: agents.kind } })
        .from(tasks)
        .innerJoin(agents, eq(agents.id, tasks.agentId))
        .where(eq(tasks.id, taskId));
      if (!row) throw new DeskError("not_found", "task not found");
      const { task } = row;
      const [worker] = task.claimedBy
        ? await db
            .select({ pseudonym: workers.pseudonym, provenAttributes: workers.provenAttributes, testMode: workers.testMode })
            .from(workers)
            .where(eq(workers.id, task.claimedBy))
        : [];
      const [submission] = await db
        .select()
        .from(submissions)
        .where(eq(submissions.taskId, taskId))
        .orderBy(desc(submissions.createdAt))
        .limit(1);
      const trail = await db
        .select({
          id: taskEvents.id,
          type: taskEvents.type,
          actor: taskEvents.actor,
          payload: taskEvents.payload,
          hash: taskEvents.hash,
          anchorTxHash: taskEvents.anchorTxHash,
          at: taskEvents.createdAt,
        })
        .from(taskEvents)
        .where(eq(taskEvents.taskId, taskId))
        .orderBy(asc(taskEvents.id));
      const verdictEvent = [...trail].reverse().find((e) => VERDICTS.includes(e.type));
      const entries = await db.select().from(ledgerEntries).where(eq(ledgerEntries.taskId, taskId)).orderBy(asc(ledgerEntries.id));
      const sideEffects = await db
        .select()
        .from(outbox)
        .where(or(sql`${outbox.payload}->>'taskId' = ${taskId}`, sql`${outbox.payload}->>'ledgerKey' like ${`${taskId}:%`}`))
        .orderBy(asc(outbox.id));
      const audit = await db
        .select()
        .from(adminActions)
        .where(eq(adminActions.target, `task:${taskId}`))
        .orderBy(desc(adminActions.id));
      return {
        task,
        agent: row.agent,
        worker: worker ?? null,
        submission: submission ?? null,
        verdict: verdictEvent
          ? { ...(verdictEvent.payload as { outcome: "pass" | "fail"; ruleIds: string[]; reasoning: string }), by: verdictEvent.actor, at: verdictEvent.at }
          : null,
        trail,
        entries,
        money: taskMoney(task, entries),
        outbox: sideEffects,
        audit,
      };
    },

    /** Agents with their owner, limits, badge, PayPal connection and live spend. */
    async adminAgents() {
      const rows = await db
        .select({ agent: agents, owner: { kind: owners.kind, verifiedRef: owners.verifiedRef } })
        .from(agents)
        .innerJoin(owners, eq(owners.id, agents.ownerId))
        .orderBy(desc(agents.createdAt))
        .limit(500);
      const since = new Date(now().getTime() - DAY);
      const spend = await db
        .select({
          agentId: tasks.agentId,
          tasks: sql<number>`count(distinct ${tasks.id})::int`,
          total: sql<number>`coalesce(sum(${ledgerEntries.amount}) filter (where not ${tasks.test}), 0)::int`,
          last24h: sql<number>`coalesce(sum(${ledgerEntries.amount}) filter (where ${ledgerEntries.createdAt} >= ${since.toISOString()}), 0)::int`,
        })
        .from(tasks)
        .leftJoin(ledgerEntries, and(eq(ledgerEntries.taskId, tasks.id), eq(ledgerEntries.fromAccount, "requester")))
        .groupBy(tasks.agentId);
      const byAgent = new Map(spend.map((s) => [s.agentId, s]));
      return rows.map(({ agent, owner }) => ({
        id: agent.id,
        name: agent.name,
        status: agent.status,
        testMode: agent.testMode,
        /** agent, market, or personal: a person posting on the website (no key; limits follow their Concordium ID). */
        kind: agent.kind,
        registryId: agent.registryId,
        badge: agent.badgeVerifiedAt ? { network: agent.badgeNetwork, verifiedAt: agent.badgeVerifiedAt } : null,
        paypalConnected: agent.paymentVaultId !== null,
        hasRefundAddress: agent.refundAddress !== null,
        limits: { maxTaskBudget: agent.maxTaskBudget, maxDailySpend: agent.maxDailySpend },
        owner,
        tasks: byAgent.get(agent.id)?.tasks ?? 0,
        spent: byAgent.get(agent.id)?.total ?? 0,
        spentLast24h: byAgent.get(agent.id)?.last24h ?? 0,
        createdAt: agent.createdAt,
      }));
    },

    /** Workers as the desk knows them: pseudonym, identities and proven attributes, plus their task record. */
    /**
     * Signs that two accounts may be one person, for an operator to look at. Nothing here blocks
     * anyone (the hard rules are in the desk: one Concordium person, one payout destination per
     * account); and what is shared is named, never shown.
     */
    async adminSamePersonSignals(days = 30) {
      const signals: { kind: string; detail: string; workers: { id: string; pseudonym: string; blocked: boolean }[] }[] = [];
      type W = { id: string; pseudonym: string; blocked: boolean };
      const shared = [
        { label: "PayPal payout email", column: sql`${workers.paypalEmail}` },
        { label: "NEAR payout account", column: sql`${workers.nearAccount}` },
        { label: "EVM payout address", column: sql`lower(${workers.evmAddress})` },
        { label: "Concordium payout account", column: sql`${workers.payoutAddress}` },
      ];
      for (const { label, column } of shared) {
        const rows = await db
          .select({
            people: sql<W[]>`json_agg(json_build_object('id', ${workers.id}, 'pseudonym', ${workers.pseudonym}, 'blocked', ${workers.maxActiveClaims} = 0) order by ${workers.createdAt})`,
          })
          .from(workers)
          .where(and(sql`${column} is not null`, isNull(workers.closedAt)))
          .groupBy(column)
          .having(sql`count(*) > 1`);
        for (const r of rows) signals.push({ kind: "shared payout", detail: `Share one ${label}`, workers: r.people });
      }
      // The same worker passed again and again by one owner's agents: collusion looks like this,
      // above all when the owner reviews the work themselves.
      const since = new Date(now().getTime() - days * 24 * 3_600_000);
      const pairs = await db
        .select({
          id: workers.id,
          pseudonym: workers.pseudonym,
          blocked: sql<boolean>`${workers.maxActiveClaims} = 0`,
          ownerId: agents.ownerId,
          passes: sql<number>`count(*)::int`,
          selfReviewed: sql<number>`count(*) filter (where ${tasks.reviewMode} = 'requester')::int`,
        })
        .from(tasks)
        .innerJoin(agents, eq(agents.id, tasks.agentId))
        .innerJoin(workers, eq(workers.id, tasks.claimedBy))
        .where(and(eq(tasks.status, "final_pass"), gte(tasks.updatedAt, since)))
        .groupBy(workers.id, workers.pseudonym, workers.maxActiveClaims, agents.ownerId)
        .having(sql`count(*) >= 3`);
      for (const p of pairs) {
        signals.push({
          kind: "repeat pair",
          detail: `Passed ${p.passes} times in ${days} days by the agents of owner ${p.ownerId.slice(0, 8)}${p.selfReviewed ? `, ${p.selfReviewed} of them reviewed by the owner's own agent` : ""}`,
          workers: [{ id: p.id, pseudonym: p.pseudonym, blocked: p.blocked }],
        });
      }
      return signals;
    },

    async adminWorkers() {
      const rows = await db
        .select({
          id: workers.id,
          pseudonym: workers.pseudonym,
          provenAttributes: workers.provenAttributes,
          testMode: workers.testMode,
          maxActiveClaims: workers.maxActiveClaims,
          // Which identities sign them in, never the hashes or anything behind them.
          hasPayPal: sql<boolean>`${workers.paypalRef} is not null`,
          paypalVerified: workers.paypalVerified,
          hasConcordium: sql<boolean>`${workers.concordiumRef} is not null`,
          // Whether a payout destination is set, never what it is.
          paypalSet: isNotNull(workers.paypalEmail),
          concordiumSet: isNotNull(workers.payoutAddress),
          createdAt: workers.createdAt,
        })
        .from(workers)
        .orderBy(desc(workers.createdAt))
        .limit(500);
      const record = await db
        .select({
          workerId: tasks.claimedBy,
          claimed: sql<number>`count(*)::int`,
          passed: sql<number>`count(*) filter (where ${tasks.status} = 'final_pass')::int`,
          failed: sql<number>`count(*) filter (where ${tasks.status} = 'final_fail')::int`,
        })
        .from(tasks)
        .where(isNotNull(tasks.claimedBy))
        .groupBy(tasks.claimedBy);
      const earned = await db
        .select({ workerId: ledgerEntries.party, amount: sql<number>`coalesce(sum(${ledgerEntries.amount}), 0)::int` })
        .from(ledgerEntries)
        .innerJoin(tasks, eq(tasks.id, ledgerEntries.taskId))
        .where(and(live, eq(ledgerEntries.toAccount, "worker"), eq(ledgerEntries.status, "settled")))
        .groupBy(ledgerEntries.party);
      const records = new Map(record.map((r) => [r.workerId, r]));
      const earnings = new Map(earned.map((e) => [e.workerId, e.amount]));
      return rows.map((w) => ({
        ...w,
        claimed: records.get(w.id)?.claimed ?? 0,
        passed: records.get(w.id)?.passed ?? 0,
        failed: records.get(w.id)?.failed ?? 0,
        earned: earnings.get(w.id) ?? 0,
      }));
    },

    /** The admin audit log, newest first. */
    async adminAudit(limit = 100) {
      return db.select().from(adminActions).orderBy(desc(adminActions.id)).limit(Math.min(Math.max(limit, 1), 500));
    },

    /**
     * Per day (Manila time) over the last `days`: tasks posted, money funded and paid to
     * workers, verdicts; plus the pass rate and median times to claim and to pay.
     */
    async adminAnalytics({ days = 30, includeTest = false }: { days?: number; includeTest?: boolean } = {}) {
      const at = now();
      const since = new Date(at.getTime() - days * DAY);
      const scope = includeTest ? undefined : live;
      const series = new Map<string, { day: string; posted: number; funded: number; paid: number; passes: number; fails: number }>();
      for (let i = days - 1; i >= 0; i--) {
        const day = manilaDay(new Date(at.getTime() - i * DAY));
        series.set(day, { day, posted: 0, funded: 0, paid: 0, passes: 0, fails: 0 });
      }
      const bucket = (when: Date) => series.get(manilaDay(when));

      for (const t of await db.select({ at: tasks.createdAt }).from(tasks).where(and(scope, gte(tasks.createdAt, since)))) {
        bucket(t.at)!.posted++;
      }
      const money = await db
        .select({ from: ledgerEntries.fromAccount, to: ledgerEntries.toAccount, amount: ledgerEntries.amount, status: ledgerEntries.status, at: ledgerEntries.createdAt, settledAt: ledgerEntries.updatedAt, taskId: ledgerEntries.taskId })
        .from(ledgerEntries)
        .innerJoin(tasks, eq(tasks.id, ledgerEntries.taskId))
        .where(and(scope, gte(ledgerEntries.updatedAt, since)));
      for (const e of money) {
        if (e.from === "requester" && e.at >= since) bucket(e.at)!.funded += e.amount;
        if (e.to === "worker" && e.status === "settled") {
          const day = bucket(e.settledAt);
          if (day) day.paid += e.amount;
        }
      }

      const events = await db
        .select({ taskId: taskEvents.taskId, type: taskEvents.type, at: taskEvents.createdAt })
        .from(taskEvents)
        .innerJoin(tasks, eq(tasks.id, taskEvents.taskId))
        .where(and(scope, gte(taskEvents.createdAt, new Date(since.getTime() - days * DAY))))
        .orderBy(asc(taskEvents.id));
      // The verdict that stands for each task: the panel's if there was one, else the reviewer's.
      const standing = new Map<string, { pass: boolean; at: Date }>();
      const funded = new Map<string, Date>();
      const claimTimes: number[] = [];
      const submitted = new Map<string, Date>();
      for (const e of events) {
        if (e.type === "fund") funded.set(e.taskId, e.at);
        if (e.type === "claim" && funded.has(e.taskId) && e.at >= since) {
          claimTimes.push(e.at.getTime() - funded.get(e.taskId)!.getTime());
          funded.delete(e.taskId); // only the first claim counts
        }
        if (e.type === "submit") submitted.set(e.taskId, e.at);
        if (VERDICTS.includes(e.type)) standing.set(e.taskId, { pass: e.type.endsWith("_pass"), at: e.at });
      }
      for (const v of standing.values()) {
        const day = bucket(v.at);
        if (day) day[v.pass ? "passes" : "fails"]++;
      }
      const payTimes = money
        .filter((e) => e.to === "worker" && e.status === "settled" && e.taskId && submitted.has(e.taskId))
        .map((e) => e.settledAt.getTime() - submitted.get(e.taskId!)!.getTime());
      const decided = [...standing.values()].filter((v) => v.at >= since);
      return {
        days: [...series.values()],
        passRate: decided.length ? decided.filter((v) => v.pass).length / decided.length : null,
        verdicts: decided.length,
        medianMsToClaim: median(claimTimes),
        medianMsToPay: median(payTimes),
        claims: claimTimes.length,
        payouts: payTimes.length,
      };
    },
  };
}
