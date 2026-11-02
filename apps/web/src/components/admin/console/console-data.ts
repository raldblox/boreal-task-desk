import type { Anomaly, ConsoleData, ReconcileResult } from "@boreal/desk";

// The money console's tables, as plain rows for AG Studio: built on the server from the desk's
// read-only console view, sent to the browser as they are. Money is in dollars here (Studio's
// currency format), dates are ISO strings, and flags are 1 or 0 so they sum. Nothing personal:
// requesters are agent names or a person's shortened pseudonym, workers a shortened pseudonym.

const usd = (cents: number) => Math.round(cents) / 100;
const iso = (at: Date | string | null) => (at ? new Date(at).toISOString() : null);
const flag = (on: boolean) => (on ? 1 : 0);

/** Funnel steps in order, with the words the console shows. */
export const FUNNEL_STEPS = [
  ["posted", "1 Posted"],
  ["screened", "2 Screened"],
  ["funded", "3 Funded"],
  ["claimed", "4 Claimed"],
  ["submitted", "5 Submitted"],
  ["decided", "6 Reviewed"],
  ["paid", "7 Paid out"],
] as const;

export function consoleRows(data: ConsoleData) {
  const tasks = data.tasks.map((t) => ({
    id: t.id,
    ref: t.ref,
    status: t.status.replace("_", " "),
    stage: FUNNEL_STEPS[t.stageIndex - 1]![1],
    rail: t.rail,
    requesterKind: t.requesterKind,
    requester: t.requester,
    verified: t.verifiedRequester ? "verified" : "unverified",
    workerKind: t.workerKind,
    worker: t.worker,
    reviewMode: t.reviewMode,
    verdict: t.verdict,
    budget: usd(t.budget),
    fees: usd(t.platformFee + t.reviewFee),
    gmv: usd(t.gmv),
    funded: flag(t.funded),
    decided: flag(t.passed || t.failed),
    passed: flag(t.passed),
    failed: flag(t.failed),
    disputed: flag(t.disputed),
    overturned: flag(t.overturned),
    tasks: 1,
    refunded: usd(t.refunded),
    postedAt: iso(t.postedAt)!,
    fundedAt: iso(t.fundedAt),
    paidAt: iso(t.paidAt),
    hoursToClaim: t.hoursToClaim,
    hoursToReview: t.hoursToReview,
    hoursPassToPayout: t.hoursPassToPayout,
  }));

  // One row per step each task reached, so the funnel counts tasks that got at least that far.
  const funnel = data.tasks.flatMap((t) =>
    FUNNEL_STEPS.slice(0, t.stageIndex).map(([key, label], i) => ({
      id: `${t.id}:${key}`,
      taskId: t.id,
      step: label,
      order: i + 1,
      rail: t.rail,
      requesterKind: t.requesterKind,
      tasks: 1,
    })),
  );

  const ledger = data.ledger.map((e) => {
    const settled = e.status === "settled";
    const amount = usd(e.amount);
    const is = (kind: string, ok = settled) => (e.kind === kind && ok ? amount : 0);
    return {
      id: String(e.id),
      taskId: e.taskId,
      taskRef: e.taskRef,
      kind: e.kind,
      state: e.state,
      direction: e.direction,
      rail: e.rail,
      requesterKind: e.requesterKind,
      requester: e.requester,
      amount,
      signedAmount: usd(e.signedAmount),
      fundedIn: is("funding", true),
      heldNow: e.kind === "funding" && e.state === "held" ? amount : 0,
      /** Received into escrow and not yet sent anywhere: sums to what escrow holds outside the money on its way. */
      inEscrow: e.kind === "funding" ? (settled ? amount : 0) : -amount,
      paidToWorkers: is("worker payout"),
      platformFees: is("platform fee"),
      reviewFees: is("review fee"),
      feesEarned: is("platform fee") + is("review fee"),
      refunded: is("refund"),
      onItsWay: e.direction === "out" && e.status === "pending" ? amount : 0,
      failed: e.direction === "out" && e.status === "failed" ? amount : 0,
      entries: 1,
      at: iso(e.at)!,
      settledAt: iso(e.settledAt),
      hoursToSettle: e.hoursToSettle,
      txRef: e.txRef,
    };
  });

  const transfers = data.transfers
    .filter((t) => t.kind !== "reconcile" || t.state === "failed")
    .map((t) => ({
      id: String(t.id),
      taskId: t.taskId,
      taskRef: t.taskRef,
      kind: t.kind === "reconcile" ? "returned by provider" : t.kind,
      rail: t.rail,
      to: t.to,
      amount: usd(t.amount),
      state: t.state,
      attempts: t.attempts,
      lastError: t.lastError,
      transfers: 1,
      queuedAt: iso(t.queuedAt)!,
      doneAt: iso(t.doneAt),
      minutesOpen: t.minutesOpen,
    }));

  const escrow = data.escrow.map((e) => ({
    rail: e.rail,
    held: usd(e.held),
    received: usd(e.received),
    paidToWorkers: usd(e.paidToWorkers),
    reviewFees: usd(e.reviewFees),
    platformFees: usd(e.platformFees),
    refunded: usd(e.refunded),
    onItsWay: usd(e.onItsWay),
    failed: usd(e.failed),
    balance: usd(e.balance),
  }));

  return { asOf: iso(data.asOf)!, tasks, funnel, ledger, transfers, escrow };
}

export type ConsoleRows = ReturnType<typeof consoleRows>;

/** What the anomaly agent found, as the browser gets it. */
export interface AnomalyReport {
  checkedAt: string;
  anomalies: Anomaly[];
  reconciliation: ReconcileResult[];
}
