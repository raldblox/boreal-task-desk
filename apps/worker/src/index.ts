// The monitor loop: everything time-driven in the task lifecycle. Runs as one long-lived
// process beside the web app; each step must be idempotent so a crash mid-run is safe.

import { loadConcordium } from "@boreal/concordium";
import { POLICY } from "@boreal/core";
import { createDb } from "@boreal/db";
import { addressesFromEnv, createDesk, ledgerEscrowBalance } from "@boreal/desk";

interface Step {
  name: string;
  run(now: Date): Promise<void>;
}

// Run a single instance until the leader lock lands.
const db = createDb();
const concordium = loadConcordium(process.env, { escrowBalance: () => ledgerEscrowBalance(db) });
const desk = createDesk({ db, concordium, addresses: addressesFromEnv() });

/** Set when escrow and the ledger disagree; payouts stop until an operator resolves it. */
let escrowGap = 0;

const timer = (name: string, sweep: () => Promise<number>): Step => ({
  name,
  async run() {
    const moved = await sweep();
    if (moved > 0) console.log(`[monitor] ${name}: ${moved} task(s)`);
  },
});

const steps: Step[] = [
  timer("expire-claims", () => desk.expireClaims()),
  timer("expire-deadlines", () => desk.expireDeadlines()),
  timer("close-objection-windows", () => desk.closeObjectionWindows()),
  {
    name: "drain-outbox",
    async run() {
      if (!concordium) return;
      if (escrowGap !== 0) {
        console.error(`[monitor] outbox paused: escrow is off the ledger by ${escrowGap}`);
        return;
      }
      const { sent, failed } = await desk.drainOutbox();
      if (sent || failed) console.log(`[monitor] drain-outbox: ${sent} sent, ${failed} failed`);
    },
  },
];

let lastReconcile = 0;
const reconcile: Step = {
  name: "reconcile-escrow",
  async run() {
    if (!concordium) return;
    const { expected, actual, gap } = await desk.reconcileEscrow();
    if (gap !== 0) console.error(`[monitor] ESCROW GAP: chain ${actual}, ledger ${expected}`);
    escrowGap = gap;
  },
};

async function tick(): Promise<void> {
  const now = new Date();
  if (now.getTime() - lastReconcile >= POLICY.reconcileIntervalMs) {
    try {
      await reconcile.run(now);
      lastReconcile = now.getTime();
    } catch (error) {
      console.error("[monitor] reconcile-escrow failed", error);
    }
  }
  for (const step of steps) {
    try {
      await step.run(now);
    } catch (error) {
      console.error(`[monitor] ${step.name} failed`, error);
    }
  }
}

const intervalMs = Number(process.env.MONITOR_INTERVAL_MS ?? 30_000);
let stopping = false;

async function main(): Promise<void> {
  console.log(
    `[monitor] started, ticking every ${intervalMs} ms; Concordium ${concordium ? process.env.CONCORDIUM_MODE : "off"}`,
  );
  while (!stopping) {
    await tick();
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    stopping = true;
  });
}

void main();
