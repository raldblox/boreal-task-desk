import { randomUUID } from "node:crypto";

import { loadReviewer, type Reviewer } from "@boreal/brain";
import { type Concordium, loadConcordium, type Payments } from "@boreal/concordium";
import { and, type Database, eq, leases, lt } from "@boreal/db";
import {
  addressesFromEnv,
  createDesk,
  type Desk,
  ledgerEscrowBalance,
  type ReadFile,
  runAiReview,
} from "@boreal/desk";
import { readSubmissionBytes } from "@boreal/files";
import { loadPayments } from "@boreal/paypal";

// The monitor tick: everything time-driven in the task lifecycle, in one idempotent pass.
// The local worker loops it; production runs it from cron and after user actions. A lease
// in the database makes sure only one tick runs at a time, wherever it starts.

const LEASE = "monitor-tick";
/** Longer than the longest tick (the cron route's 300 s limit), so a crashed tick frees it. */
const LEASE_MS = 6 * 60 * 1000;

export interface TickReport {
  ran: boolean;
  expiredClaims: number;
  expiredDeadlines: number;
  closedWindows: number;
  ai: { screened: number; reviewed: number; toHumans: number; deferred: number } | null;
  outbox: { sent: number; failed: number } | null;
  escrowGap: number | null;
  errors: string[];
}

export interface MonitorDeps {
  db: Database;
  desk: Desk;
  concordium: Concordium | null;
  /** The payment rail; defaults to Concordium's. */
  payments?: Payments | null;
  reviewer: Reviewer | null;
  readFile: ReadFile;
  now?: () => Date;
}

export interface Monitor {
  tick(options?: { aiLimit?: number }): Promise<TickReport>;
}

async function acquire(db: Database, holder: string, now: Date): Promise<boolean> {
  const until = new Date(now.getTime() + LEASE_MS);
  const rows = await db
    .insert(leases)
    .values({ name: LEASE, holder, until })
    .onConflictDoUpdate({ target: leases.name, set: { holder, until }, setWhere: lt(leases.until, now) })
    .returning({ holder: leases.holder });
  return rows[0]?.holder === holder;
}

async function release(db: Database, holder: string): Promise<void> {
  // Only the current holder frees it; a stale tick whose lease was taken over changes nothing.
  await db.update(leases).set({ until: new Date(0) }).where(and(eq(leases.name, LEASE), eq(leases.holder, holder)));
}

export function createMonitor({
  db,
  desk,
  concordium,
  payments = concordium?.payments ?? null,
  reviewer,
  readFile,
  now = () => new Date(),
}: MonitorDeps): Monitor {
  return {
    async tick({ aiLimit = 3 } = {}) {
      const report: TickReport = {
        ran: false,
        expiredClaims: 0,
        expiredDeadlines: 0,
        closedWindows: 0,
        ai: null,
        outbox: null,
        escrowGap: null,
        errors: [],
      };
      const holder = randomUUID();
      if (!(await acquire(db, holder, now()))) return report;
      report.ran = true;

      // Each step runs even if an earlier one fails; failures are reported, not thrown.
      const step = async (name: string, run: () => Promise<void>) => {
        try {
          await run();
        } catch (error) {
          report.errors.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
        }
      };

      try {
        await step("expire-claims", async () => {
          report.expiredClaims = await desk.expireClaims();
        });
        await step("expire-deadlines", async () => {
          report.expiredDeadlines = await desk.expireDeadlines();
        });
        await step("close-objection-windows", async () => {
          report.closedWindows = await desk.closeObjectionWindows();
        });
        if (reviewer) {
          await step("ai-review", async () => {
            report.ai = await runAiReview(desk, reviewer, { readFile, limit: aiLimit });
          });
        }
        if (payments) {
          await step("reconcile-escrow", async () => {
            report.escrowGap = (await desk.reconcileEscrow()).gap;
          });
          // Money stops moving while escrow and the ledger disagree.
          if (report.escrowGap === 0) {
            await step("drain-outbox", async () => {
              report.outbox = await desk.drainOutbox();
            });
          } else if (report.escrowGap !== null) {
            report.errors.push(`outbox paused: escrow is off the ledger by ${report.escrowGap}`);
          }
        }
      } finally {
        await release(db, holder);
      }
      return report;
    },
  };
}

/** The monitor wired from the environment: Concordium and the AI reviewer turn on when configured. */
export async function loadMonitor(db: Database, env: Record<string, string | undefined> = process.env): Promise<Monitor> {
  const escrowBalance = () => ledgerEscrowBalance(db);
  const concordium = loadConcordium(env, { escrowBalance });
  const payments = loadPayments(env, concordium, { escrowBalance });
  const desk = createDesk({ db, concordium, payments, addresses: addressesFromEnv(env) });
  const reviewer = await loadReviewer(env);
  return createMonitor({ db, desk, concordium, payments, reviewer, readFile: readSubmissionBytes });
}

/** A one-line summary for logs, or null when the tick did nothing worth saying. */
export function describeTick(r: TickReport): string | null {
  if (!r.ran) return null;
  const parts = [
    r.expiredClaims && `${r.expiredClaims} claims expired`,
    r.expiredDeadlines && `${r.expiredDeadlines} deadlines expired`,
    r.closedWindows && `${r.closedWindows} verdicts final`,
    r.ai && (r.ai.screened || r.ai.reviewed || r.ai.toHumans || r.ai.deferred) &&
      `AI: ${r.ai.screened} screened, ${r.ai.reviewed} reviewed, ${r.ai.toHumans} to humans, ${r.ai.deferred} deferred`,
    r.outbox && (r.outbox.sent || r.outbox.failed) && `outbox: ${r.outbox.sent} sent, ${r.outbox.failed} failed`,
    ...r.errors,
  ].filter(Boolean);
  return parts.length ? parts.join("; ") : null;
}
