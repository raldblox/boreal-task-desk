import type { Desk } from "@boreal/desk";

// A person's insights as plain rows for AG Studio, built on the server from the desk's
// read-only views of their own money: dollars, ISO dates, flags as 1 or 0.

type Spending = Awaited<ReturnType<Desk["mySpending"]>>;
type Earnings = Awaited<ReturnType<Desk["myEarnings"]>>;

const usd = (cents: number) => Math.round(cents) / 100;
const iso = (at: Date | string | null) => (at ? new Date(at).toISOString() : null);

export function spendingRows(data: Spending) {
  const tasks = data.tasks.map((t) => ({
    id: t.id,
    ref: t.ref,
    ownPage: t.ownPage,
    postedBy: t.postedBy,
    description: t.description,
    status: t.status.replace("_", " "),
    rail: t.rail,
    total: usd(t.total),
    budget: usd(t.budget),
    verdict: t.verdict,
    decided: t.verdict ? 1 : 0,
    passed: t.verdict === "pass" ? 1 : 0,
    tasks: 1,
    postedAt: iso(t.postedAt)!,
    hoursToClaim: t.hoursToClaim,
    hoursToResult: t.hoursToResult,
  }));
  const money = data.entries.map((e) => {
    const amount = usd(e.amount);
    const settled = e.status === "settled";
    const out = e.kind !== "funding";
    const is = (kind: string) => (e.kind === kind && settled ? amount : 0);
    return {
      id: String(e.id),
      taskId: e.taskId,
      postedBy: e.postedBy,
      rail: e.rail,
      kind: e.kind,
      funded: e.kind === "funding" ? amount : 0,
      held: e.held ? amount : 0,
      inEscrow: e.kind === "funding" ? (settled ? amount : 0) : -amount,
      workerPay: is("worker pay"),
      fees: is("platform fee") + is("review fee"),
      refunded: is("refund"),
      onItsWay: out && e.status === "pending" ? amount : 0,
      returned: out && e.status === "failed" ? amount : 0,
      at: iso(e.at)!,
    };
  });
  return { tasks, money };
}

export function earningsRows(data: Earnings) {
  return data.map((j) => ({
    id: j.id,
    ref: j.ref,
    description: j.description,
    requester: j.requester,
    rail: j.rail,
    state: j.state,
    paid: usd(j.paid),
    onItsWay: j.state === "on its way" ? usd(j.amount) : 0,
    heldForYou: j.state === "held for you" ? usd(j.amount) : 0,
    paidTasks: j.state === "paid" ? 1 : 0,
    tasks: 1,
    claimedAt: iso(j.claimedAt)!,
    paidAt: iso(j.paidAt),
    hoursToPaid: j.hoursToPaid,
  }));
}

export interface InsightsRows {
  asOf: string;
  spending: ReturnType<typeof spendingRows> | null;
  earnings: ReturnType<typeof earningsRows> | null;
}
