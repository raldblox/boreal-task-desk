import "server-only";

import { and, gte, isNull, outbox, sql } from "@boreal/db";

import { getDb } from "./db";

// Read-only checks behind the public /status page. Counts only: nothing about any task,
// agent or worker leaves this file.

export type Health = "ok" | "degraded" | "down" | "off";

export interface Check {
  name: string;
  health: Health;
  detail: string;
}

/** Can the app reach its database, and how fast. */
export async function databaseCheck(): Promise<Check & { ms: number | null }> {
  const started = Date.now();
  try {
    await getDb().execute(sql`select 1`);
    const ms = Date.now() - started;
    return { name: "Database", health: ms > 1500 ? "degraded" : "ok", detail: `Answering in ${ms} ms`, ms };
  } catch (error) {
    console.error("[status] database check failed", error);
    return { name: "Database", health: "down", detail: "Not reachable right now", ms: null };
  }
}

const MONEY_KINDS = new Set(["payout", "refund", "capture", "release", "reconcile"]);

/**
 * The background queue that sends payouts, refunds and on-chain anchors. Money that waits
 * more than 15 minutes, or keeps failing, makes it degraded. Anchors wait without counting
 * against it where no Concordium anchor account is configured.
 */
export async function queueCheck(anchoring: boolean): Promise<{ money: Check; anchors: Check; lastDoneAt: Date | null }> {
  const db = getDb();
  const pending = await db
    .select({
      kind: outbox.kind,
      count: sql<number>`count(*)::int`,
      oldest: sql<Date | null>`min(${outbox.createdAt})`,
      failing: sql<number>`count(*) filter (where ${outbox.attempts} >= 3)::int`,
    })
    .from(outbox)
    .where(isNull(outbox.doneAt))
    .groupBy(outbox.kind);
  const [last] = await db
    .select({ at: sql<Date | null>`max(${outbox.doneAt})` })
    .from(outbox)
    .where(gte(outbox.doneAt, sql`now() - interval '30 days'`));
  const [done24h] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(outbox)
    .where(and(gte(outbox.doneAt, sql`now() - interval '24 hours'`)));

  const money = pending.filter((p) => MONEY_KINDS.has(p.kind));
  const moneyCount = money.reduce((n, p) => n + p.count, 0);
  const failing = money.reduce((n, p) => n + p.failing, 0);
  const oldest = money.map((p) => (p.oldest ? new Date(p.oldest).getTime() : Infinity)).reduce((a, b) => Math.min(a, b), Infinity);
  const waitingMin = Number.isFinite(oldest) ? Math.round((Date.now() - oldest) / 60_000) : 0;
  const moneyHealth: Health = failing > 0 ? "degraded" : moneyCount > 0 && waitingMin > 15 ? "degraded" : "ok";
  const moneyDetail =
    moneyCount === 0
      ? `Nothing waiting · ${done24h?.count ?? 0} sent in the last 24 hours`
      : `${moneyCount} waiting${waitingMin > 0 ? `, oldest ${waitingMin} min` : ""}${failing ? ` · ${failing} retrying after errors` : ""}`;

  const anchorCount = pending.filter((p) => p.kind === "anchor").reduce((n, p) => n + p.count, 0);
  const anchors: Check = anchoring
    ? { name: "On-chain audit anchors", health: anchorCount > 50 ? "degraded" : "ok", detail: anchorCount ? `${anchorCount} waiting to be anchored` : "Up to date" }
    : { name: "On-chain audit anchors", health: "off", detail: anchorCount ? `${anchorCount} kept until anchoring is switched on` : "Not switched on here" };

  return {
    money: { name: "Payouts and refunds", health: moneyHealth, detail: moneyDetail },
    anchors,
    lastDoneAt: last?.at ? new Date(last.at) : null,
  };
}

/** The worst health among checks that are switched on. */
export function overall(checks: Check[]): Health {
  const on = checks.filter((c) => c.health !== "off");
  if (on.some((c) => c.health === "down")) return "down";
  if (on.some((c) => c.health === "degraded")) return "degraded";
  return "ok";
}
