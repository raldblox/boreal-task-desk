// The monitor loop: everything time-driven in the task lifecycle. Runs as one long-lived
// process beside the web app; each step must be idempotent so a crash mid-run is safe.

import { POLICY } from "@boreal/core";
import { createDb } from "@boreal/db";
import { createDesk } from "@boreal/desk";

interface Step {
  name: string;
  run(now: Date): Promise<void>;
}

// Run a single instance until the leader lock lands.
const desk = createDesk({ db: createDb() });

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
  // Stub until the Concordium adapters land: anchors, payouts, refunds, webhooks.
  { name: "drain-outbox", run: async () => {} },
];

let lastReconcile = 0;
const reconcile: Step = { name: "reconcile-escrow", run: async () => {} }; // ledger vs escrow balance

async function tick(): Promise<void> {
  const now = new Date();
  for (const step of steps) {
    try {
      await step.run(now);
    } catch (error) {
      console.error(`[monitor] ${step.name} failed`, error);
    }
  }
  if (now.getTime() - lastReconcile >= POLICY.reconcileIntervalMs) {
    await reconcile.run(now);
    lastReconcile = now.getTime();
  }
}

const intervalMs = Number(process.env.MONITOR_INTERVAL_MS ?? 30_000);
let stopping = false;

async function main(): Promise<void> {
  console.log(`[monitor] started, ticking every ${intervalMs} ms`);
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
