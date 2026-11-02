import type { PaymentRail } from "@boreal/concordium";
import { agents, and, asc, type Database, eq, gte, inArray, ledgerEntries, outbox, sql, taskEvents, tasks, workers } from "@boreal/db";

// The money console's data: flat, read-only tables of live money for the admin dashboard
// (AG Studio), plus the checks its anomaly agent runs. Nothing here changes state. People
// appear only as their pseudonym (shortened), never a PayPal email or a payout account;
// error text from providers is scrubbed of email addresses before it leaves the desk.

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const VERDICTS = ["verdict_pass", "verdict_fail", "panel_pass", "panel_fail"];
const EMAIL = /[^@\s"'<>]+@[^@\s"'<>]+\.[a-z]{2,}/gi;

/** A payout or refund still unsent after this long is stuck "on its way". */
export const STUCK_AFTER_MS = 2 * HOUR;

/** Where a task got to, in funnel order. */
export const FUNNEL = ["posted", "screened", "funded", "claimed", "submitted", "decided", "paid"] as const;
export type FunnelStage = (typeof FUNNEL)[number];

/** A pseudonym short enough for a grid cell; still the pseudonym, never anything behind it. */
export const shortRef = (ref: string) => (ref.length > 14 ? `${ref.slice(0, 12)}…` : ref);
export const scrub = (text: string) => text.replace(EMAIL, "[email]");

const hours = (from: Date | null | undefined, to: Date | null | undefined) =>
  from && to ? Math.round(((to.getTime() - from.getTime()) / HOUR) * 10) / 10 : null;

type EntryKind = "funding" | "worker payout" | "review fee" | "platform fee" | "refund";

function entryKind(e: { from: string; to: string }): EntryKind {
  if (e.from === "requester") return "funding";
  if (e.to === "worker") return "worker payout";
  if (e.to === "reviewer") return "review fee";
  if (e.to === "operating") return "platform fee";
  return "refund";
}

/** What an entry's status means for its kind: a pending PayPal funding is a hold. */
function entryState(kind: EntryKind, status: string, rail: string): string {
  if (kind === "funding") return status === "pending" ? (rail === "paypal" ? "held" : "confirming") : status === "failed" ? "failed" : rail === "paypal" ? "captured" : "received";
  if (status === "pending") return "on its way";
  return status === "settled" ? (kind === "refund" ? "returned" : "paid") : "failed";
}

export interface ReconcileResult {
  rail: PaymentRail;
  expected?: number;
  actual?: number;
  gap?: number;
  /** Set when the rail couldn't be checked here (not configured, or the provider is down). */
  error?: string;
}

export interface Anomaly {
  id: string;
  severity: "critical" | "warning" | "info";
  kind: "failed_payouts" | "refund_spike" | "stuck_payouts" | "escrow_gap" | "failing_outbox";
  title: string;
  detail: string;
  /** Money involved, in cents. */
  amount: number;
  count: number;
  /** Tasks to open in the admin area. */
  taskIds: string[];
}

export function consoleViews(db: Database, now: () => Date) {
  return {
    /**
     * Every live task, ledger entry and money transfer, as flat rows for the console, with
     * each task's funnel times and where its money is, and the escrow position per rail.
     */
    async adminConsole({ days = 90 }: { days?: number } = {}) {
      const at = now();
      const since = new Date(at.getTime() - days * DAY);
      const live = eq(tasks.test, false);

      const taskRows = await db
        .select({
          task: tasks,
          agentName: agents.name,
          requesterKind: agents.kind,
          badged: sql<boolean>`${agents.badgeVerifiedAt} is not null`,
          workerRef: workers.pseudonym,
          workerKind: workers.kind,
        })
        .from(tasks)
        .innerJoin(agents, eq(agents.id, tasks.agentId))
        .leftJoin(workers, eq(workers.id, tasks.claimedBy))
        .where(and(live, gte(tasks.createdAt, since)))
        .orderBy(asc(tasks.createdAt))
        .limit(5_000);
      const ids = taskRows.map((r) => r.task.id);

      const events = ids.length
        ? await db
            .select({ taskId: taskEvents.taskId, type: taskEvents.type, at: taskEvents.createdAt })
            .from(taskEvents)
            .where(inArray(taskEvents.taskId, ids))
            .orderBy(asc(taskEvents.id))
        : [];
      const entries = ids.length
        ? await db.select().from(ledgerEntries).where(inArray(ledgerEntries.taskId, ids)).orderBy(asc(ledgerEntries.id))
        : [];
      const transfers = await db
        .select()
        .from(outbox)
        .where(and(inArray(outbox.kind, ["payout", "refund", "capture", "release", "reconcile"]), gte(outbox.createdAt, since)))
        .orderBy(asc(outbox.id))
        .limit(10_000);

      // First time each step happened, and the verdict that stands.
      const first = new Map<string, Map<string, Date>>();
      const standing = new Map<string, { pass: boolean; at: Date; panel: boolean }>();
      const reviewerSaid = new Map<string, boolean>();
      for (const e of events) {
        const seen = first.get(e.taskId) ?? new Map<string, Date>();
        if (!seen.has(e.type)) seen.set(e.type, e.at);
        first.set(e.taskId, seen);
        if (e.type.startsWith("verdict_")) reviewerSaid.set(e.taskId, e.type === "verdict_pass");
        if (VERDICTS.includes(e.type)) standing.set(e.taskId, { pass: e.type.endsWith("_pass"), at: e.at, panel: e.type.startsWith("panel") });
      }
      const workerPaid = new Map<string, Date>();
      for (const e of entries) {
        if (e.toAccount === "worker" && e.status === "settled" && e.taskId) workerPaid.set(e.taskId, e.updatedAt);
      }

      const tasksOut = taskRows.map(({ task, agentName, requesterKind, badged, workerRef, workerKind }) => {
        const seen = first.get(task.id) ?? new Map<string, Date>();
        const verdict = standing.get(task.id);
        const paidAt = workerPaid.get(task.id) ?? null;
        const stage: FunnelStage = paidAt
          ? "paid"
          : verdict
            ? "decided"
            : seen.has("submit")
              ? "submitted"
              : seen.has("claim")
                ? "claimed"
                : seen.has("fund")
                  ? "funded"
                  : seen.has("screen_ok")
                    ? "screened"
                    : "posted";
        const mine = entries.filter((e) => e.taskId === task.id);
        const refunded = mine.filter((e) => e.toAccount === "requester" && e.status === "settled").reduce((s, e) => s + e.amount, 0);
        return {
          id: task.id,
          ref: task.id.slice(0, 8),
          status: task.status,
          stage,
          stageIndex: FUNNEL.indexOf(stage) + 1,
          rail: task.paymentRail ?? "unfunded",
          requesterKind: requesterKind === "market" ? "NEAR market buyer" : requesterKind === "personal" ? "person" : "agent",
          requester: requesterKind === "personal" ? shortRef(agentName) : agentName,
          verifiedRequester: badged,
          workerKind: workerKind ?? "none",
          worker: workerRef ? shortRef(workerRef) : "",
          reviewMode: task.reviewMode,
          resultFormat: task.resultFormat,
          budget: task.budget,
          platformFee: task.platformFee,
          reviewFee: task.reviewFee,
          /** GMV counts a task's full total once it is funded. */
          gmv: seen.has("fund") ? task.budget + task.platformFee + task.reviewFee : 0,
          funded: seen.has("fund"),
          verdict: verdict ? (verdict.pass ? "pass" : "fail") : "",
          passed: verdict?.pass === true,
          failed: verdict?.pass === false,
          disputed: seen.has("dispute"),
          /** A dispute the panel decided the other way from the reviewer. */
          overturned: !!verdict?.panel && reviewerSaid.has(task.id) && reviewerSaid.get(task.id) !== verdict.pass,
          refunded,
          postedAt: task.createdAt,
          fundedAt: seen.get("fund") ?? null,
          claimedAt: seen.get("claim") ?? null,
          submittedAt: seen.get("submit") ?? null,
          decidedAt: verdict?.at ?? null,
          paidAt,
          hoursToClaim: hours(seen.get("fund"), seen.get("claim")),
          hoursToReview: hours(seen.get("submit"), verdict?.at),
          hoursPassToPayout: verdict?.pass ? hours(verdict.at, paidAt) : null,
        };
      });
      const byTask = new Map(tasksOut.map((t) => [t.id, t]));

      const ledgerOut = entries.map((e) => {
        const t = byTask.get(e.taskId!)!;
        const kind = entryKind({ from: e.fromAccount, to: e.toAccount });
        return {
          id: e.id,
          taskId: e.taskId!,
          taskRef: t.ref,
          kind,
          state: entryState(kind, e.status, t.rail),
          status: e.status,
          direction: kind === "funding" ? "in" : "out",
          from: e.fromAccount,
          to: e.toAccount,
          amount: e.amount,
          /** Money in counts positive, money out of escrow negative. */
          signedAmount: kind === "funding" ? e.amount : -e.amount,
          rail: t.rail,
          requesterKind: t.requesterKind,
          requester: t.requester,
          workerKind: kind === "worker payout" ? t.workerKind : "",
          at: e.createdAt,
          settledAt: e.status === "settled" ? e.updatedAt : null,
          hoursToSettle: e.status === "settled" ? hours(e.createdAt, e.updatedAt) : null,
          txRef: e.txHash ? (e.txHash.length > 18 ? `${e.txHash.slice(0, 16)}…` : e.txHash) : "",
        };
      });

      const ledgerByKey = new Map(entries.map((e) => [e.idempotencyKey, e]));
      const transfersOut = transfers.map((o) => {
        const p = o.payload as { ledgerKey?: string; taskId?: string; amount?: number; status?: string };
        const entry = p.ledgerKey ? ledgerByKey.get(p.ledgerKey) : undefined;
        const taskId = p.taskId ?? entry?.taskId ?? p.ledgerKey?.split(":")[0] ?? "";
        const t = byTask.get(taskId);
        const age = at.getTime() - o.createdAt.getTime();
        const state = o.doneAt
          ? o.kind === "reconcile" && p.status === "failed"
            ? "failed"
            : "done"
          : o.lastError
            ? "retrying"
            : age > STUCK_AFTER_MS
              ? "stuck"
              : "on its way";
        return {
          id: o.id,
          kind: o.kind,
          taskId,
          taskRef: taskId.slice(0, 8),
          rail: t?.rail ?? "unknown",
          to: entry?.toAccount ?? (o.kind === "release" ? "requester" : o.kind === "capture" ? "escrow" : ""),
          amount: p.amount ?? entry?.amount ?? 0,
          state,
          attempts: o.attempts,
          lastError: o.lastError ? scrub(o.lastError).slice(0, 200) : "",
          queuedAt: o.createdAt,
          doneAt: o.doneAt,
          minutesOpen: Math.round(((o.doneAt ?? at).getTime() - o.createdAt.getTime()) / 60_000),
        };
      });

      // Escrow per rail: holds not yet taken, money received, and where it went.
      const rails = [...new Set(tasksOut.filter((t) => t.funded).map((t) => t.rail))].sort();
      const escrow = rails.map((rail) => {
        const mine = ledgerOut.filter((e) => e.rail === rail);
        const sum = (pick: (e: (typeof ledgerOut)[number]) => boolean) => mine.filter(pick).reduce((s, e) => s + e.amount, 0);
        const received = sum((e) => e.kind === "funding" && e.status === "settled");
        const out = sum((e) => e.direction === "out" && e.status === "settled");
        return {
          rail,
          held: sum((e) => e.kind === "funding" && e.status === "pending"),
          received,
          paidToWorkers: sum((e) => e.kind === "worker payout" && e.status === "settled"),
          reviewFees: sum((e) => e.kind === "review fee" && e.status === "settled"),
          platformFees: sum((e) => e.kind === "platform fee" && e.status === "settled"),
          refunded: sum((e) => e.kind === "refund" && e.status === "settled"),
          onItsWay: sum((e) => e.direction === "out" && e.status === "pending"),
          failed: sum((e) => e.direction === "out" && e.status === "failed"),
          /** What escrow should hold: settled in, minus settled out. */
          balance: received - out,
        };
      });

      return { asOf: at, days, tasks: tasksOut, ledger: ledgerOut, transfers: transfersOut, escrow };
    },
  };
}

export type ConsoleData = Awaited<ReturnType<ReturnType<typeof consoleViews>["adminConsole"]>>;

/**
 * The anomaly agent's checks over console data: failed payouts, a refund spike against the
 * trailing average, payouts stuck on their way or retrying, and escrow that doesn't match the
 * ledger. Pure, so the dashboard and the tests run the same rules.
 */
export function findAnomalies(data: ConsoleData, reconciliation: ReconcileResult[], at: Date): Anomaly[] {
  const found: Anomaly[] = [];
  const week = at.getTime() - 7 * DAY;
  const ids = (rows: { taskId: string }[]) => [...new Set(rows.map((r) => r.taskId))].slice(0, 20);
  const total = (rows: { amount: number }[]) => rows.reduce((s, r) => s + r.amount, 0);

  const failed = data.ledger.filter((e) => e.direction === "out" && e.status === "failed" && e.at.getTime() >= week);
  if (failed.length > 0) {
    const workers = failed.filter((e) => e.kind === "worker payout");
    found.push({
      id: "failed-payouts",
      severity: "critical",
      kind: "failed_payouts",
      title: `${failed.length} failed ${failed.length === 1 ? "transfer" : "transfers"} this week`,
      detail: `${workers.length} to workers. The money is back in escrow; resending is an operator's call (Money → Pending and failed).`,
      amount: total(failed),
      count: failed.length,
      taskIds: ids(failed),
    });
  }

  // Refunds per day over the last 2 days against the 14 days before.
  const refunds = data.ledger.filter((e) => e.kind === "refund");
  const inWindow = (from: number, to: number) => refunds.filter((e) => e.at.getTime() >= from && e.at.getTime() < to);
  const recent = inWindow(at.getTime() - 2 * DAY, at.getTime() + 1);
  const baseline = inWindow(at.getTime() - 16 * DAY, at.getTime() - 2 * DAY);
  const recentRate = recent.length / 2;
  const baselineRate = baseline.length / 14;
  if (recent.length >= 3 && recentRate >= Math.max(2 * baselineRate, 1)) {
    found.push({
      id: "refund-spike",
      severity: "warning",
      kind: "refund_spike",
      title: `Refunds up ${baselineRate > 0 ? `${(recentRate / baselineRate).toFixed(1)}×` : "from zero"} in 48 hours`,
      detail: `${recent.length} refunds in the last 2 days (${recentRate.toFixed(1)}/day) against ${baselineRate.toFixed(1)}/day over the 14 days before.`,
      amount: total(recent),
      count: recent.length,
      taskIds: ids(recent),
    });
  }

  const stuck = data.transfers.filter((t) => (t.kind === "payout" || t.kind === "refund") && (t.state === "stuck" || t.state === "retrying"));
  if (stuck.length > 0) {
    const oldest = Math.max(...stuck.map((t) => t.minutesOpen));
    found.push({
      id: "stuck-payouts",
      severity: stuck.some((t) => t.state === "retrying") ? "critical" : "warning",
      kind: "stuck_payouts",
      title: `${stuck.length} ${stuck.length === 1 ? "payout" : "payouts"} stuck on their way`,
      detail: `Oldest has waited ${oldest >= 120 ? `${Math.round(oldest / 60)} hours` : `${oldest} minutes`}; ${stuck.filter((t) => t.state === "retrying").length} are retrying after an error.`,
      amount: total(stuck),
      count: stuck.length,
      taskIds: ids(stuck),
    });
  }

  const holds = data.transfers.filter((t) => (t.kind === "capture" || t.kind === "release") && t.state === "retrying");
  if (holds.length > 0) {
    found.push({
      id: "failing-holds",
      severity: "warning",
      kind: "failing_outbox",
      title: `${holds.length} PayPal ${holds.length === 1 ? "hold" : "holds"} not captured or released`,
      detail: "PayPal honours an authorization for 3 days; capture or release them before it lapses.",
      amount: total(holds),
      count: holds.length,
      taskIds: ids(holds),
    });
  }

  for (const r of reconciliation) {
    if (r.gap !== undefined && r.gap !== 0) {
      found.push({
        id: `escrow-gap-${r.rail}`,
        severity: "critical",
        kind: "escrow_gap",
        title: `${r.rail} escrow is ${r.gap > 0 ? "over" : "short"} by ${Math.abs(r.gap)} cents`,
        detail: `The ledger expects ${r.expected} cents in escrow; the rail reports ${r.actual}. Payouts pause until it matches.`,
        amount: Math.abs(r.gap),
        count: 1,
        taskIds: [],
      });
    }
  }
  const order = { critical: 0, warning: 1, info: 2 };
  return found.sort((a, b) => order[a.severity] - order[b.severity]);
}
