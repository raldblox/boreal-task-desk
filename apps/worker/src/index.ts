// The monitor loop: everything time-driven in the task lifecycle. Runs as one long-lived
// process beside the web app; each step must be idempotent so a crash mid-run is safe.

import { POLICY } from "@boreal/core";

interface Step {
  name: string;
  run(now: Date): Promise<void>;
}

// Each step is a stub until the task service lands; the order matches the spec.
const steps: Step[] = [
  { name: "expire-claims", run: async () => {} }, // claimed past claim_expires_at -> open
  { name: "expire-deadlines", run: async () => {} }, // open past deadline -> expired, refund
  { name: "close-objection-windows", run: async () => {} }, // passed/failed past 48h -> final
  { name: "drain-outbox", run: async () => {} }, // anchors, payouts, refunds, webhooks
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
