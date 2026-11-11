import { randomUUID } from "node:crypto";

import { loadReviewer, type Reviewer } from "@boreal/brain";
import { addonEnv, deskVerification, readAddons } from "@boreal/core";
import { type Concordium, loadConcordium, type PaymentRail, type Payments } from "@boreal/concordium";
import { and, type Database, eq, leases, lt } from "@boreal/db";
import {
  addressesFromEnv,
  createDesk,
  type Desk,
  ledgerEscrowBalance,
  outboxTransferJournal,
  type ReadFile,
  runAiReview,
} from "@boreal/desk";
import { readSubmissionBytes } from "@boreal/files";
import { type BridgeReport, loadMarketBridge, loadNear, type MarketBridge } from "@boreal/near";
import { loadRails } from "@boreal/paypal";

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
  outbox: { sent: number; failed: number; held?: number } | null;
  /** Timed-out requester reviews handed to boreal.work's reviewers. */
  escalatedReviews: number;
  /** NEAR Agent Market hires, when the bridge is on. */
  market: BridgeReport | null;
  /** How far escrow and the ledger are apart, over every rail, in either direction. */
  escrowGap: number | null;
  /** Rails whose payouts and refunds are held: escrow is short, or couldn't be read. */
  pausedRails: string[];
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
  /** boreal on NEAR Agent Market: hires in, deliverables out. */
  market?: MarketBridge | null;
  /** False leaves screening to people in /admin (AI_SCREENING=off); the AI still reviews. */
  aiScreening?: boolean;
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
  market = null,
  aiScreening = true,
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
        escalatedReviews: 0,
        market: null,
        escrowGap: null,
        pausedRails: [],
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
        await step("escalate-reviews", async () => {
          report.escalatedReviews = await desk.escalateSilentReviews();
        });
        if (reviewer) {
          await step("ai-review", async () => {
            report.ai = await runAiReview(desk, reviewer, { readFile, limit: aiLimit, screen: aiScreening });
          });
        }
        if (market) {
          await step("near-market", async () => {
            report.market = await market.tick();
            report.errors.push(...report.market.errors.map((e) => `near-market ${e}`));
          });
        }
        if (payments) {
          // Each rail's escrow against its own ledger. A rail that is short of money, or whose
          // balance can't be read, holds its own payouts and refunds; the other rails, and
          // everything that moves no money, carry on. Money nobody has matched to a task (more
          // than the ledger expects) is reported and holds nothing: otherwise anyone could stop
          // every payout by sending escrow a cent.
          const paused = new Set<PaymentRail | "all">();
          await step("reconcile-escrow", async () => {
            const names = Object.keys(desk.rails) as PaymentRail[];
            let gap = 0;
            for (const rail of names.length > 0 ? names : [undefined]) {
              const name = rail ?? "escrow";
              try {
                const result = await desk.reconcileEscrow(rail);
                gap += Math.abs(result.gap);
                if (result.short > 0) {
                  paused.add(rail ?? "all");
                  report.errors.push(`${name} is short of the ledger by ${result.short}: its payouts and refunds are paused`);
                } else if (result.gap > 0) {
                  report.errors.push(`${name} holds ${result.gap} more than the ledger: an unmatched deposit, payouts continue`);
                }
              } catch (error) {
                paused.add(rail ?? "all");
                report.errors.push(`${name} couldn't be checked, so its payouts and refunds are paused: ${error instanceof Error ? error.message : String(error)}`);
              }
            }
            report.escrowGap = gap;
            report.pausedRails = [...paused];
          });
          await step("drain-outbox", async () => {
            report.outbox = await desk.drainOutbox(undefined, { pausedRails: paused });
          });
        }
      } finally {
        await release(db, holder);
      }
      return report;
    },
  };
}

/** The monitor wired from the environment: Concordium and the AI reviewer turn on when configured. */
export async function loadMonitor(db: Database, raw: Record<string, string | undefined> = process.env): Promise<Monitor> {
  // NEAR and Concordium settings only reach the loaders when their add-on is on.
  const env = addonEnv(raw);
  const escrowBalance = () => ledgerEscrowBalance(db, "concordium");
  const concordium = loadConcordium(env, { escrowBalance, journal: outboxTransferJournal(db) });
  const near = loadNear(env, { journal: outboxTransferJournal(db) });
  const { rails, payments } = loadRails(env, concordium, { escrowBalance: (rail) => ledgerEscrowBalance(db, rail), near });
  const desk = createDesk({ db, concordium, payments, rails, addresses: addressesFromEnv(env), requireBadge: env.REQUIRE_AGENT_BADGE === "1", verification: deskVerification(readAddons(raw)) });
  const reviewer = await loadReviewer(env);
  const market = loadMarketBridge(db, desk, env, { near });
  return createMonitor({ db, desk, concordium, payments, reviewer, readFile: readSubmissionBytes, market, aiScreening: env.AI_SCREENING !== "off" });
}

/** A one-line summary for logs, or null when the tick did nothing worth saying. */
export function describeTick(r: TickReport): string | null {
  if (!r.ran) return null;
  const parts = [
    r.expiredClaims && `${r.expiredClaims} claims expired`,
    r.expiredDeadlines && `${r.expiredDeadlines} deadlines expired`,
    r.closedWindows && `${r.closedWindows} verdicts final`,
    r.escalatedReviews && `${r.escalatedReviews} unreviewed submissions to boreal.work's reviewers`,
    r.ai && (r.ai.screened || r.ai.reviewed || r.ai.toHumans || r.ai.deferred) &&
      `AI: ${r.ai.screened} screened, ${r.ai.reviewed} reviewed, ${r.ai.toHumans} to humans, ${r.ai.deferred} deferred`,
    r.outbox && (r.outbox.sent || r.outbox.failed) && `outbox: ${r.outbox.sent} sent, ${r.outbox.failed} failed`,
    r.market && (r.market.taken || r.market.funded || r.market.delivered || r.market.closed) &&
      `NEAR market: ${r.market.taken} hired, ${r.market.funded} funded, ${r.market.delivered} delivered, ${r.market.closed} closed`,
    ...r.errors,
  ].filter(Boolean);
  return parts.length ? parts.join("; ") : null;
}

/** The add-ons switched on, for logs: "none (PayPal only)" or e.g. "concordium, near". */
export function addonSummary(env: Record<string, string | undefined> = process.env): string {
  const addons = readAddons(env);
  const on = (["concordium", "near"] as const).filter((id) => addons.on(id));
  return `${on.length ? on.join(", ") : "none (PayPal only)"}${addons.source === "inferred" ? " (inferred; set BOREAL_ADDONS)" : ""}`;
}
