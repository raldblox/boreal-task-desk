// The monitor loop for local development and any always-on host. Production on Vercel runs
// the same tick from /api/cron/tick; the lease means the two never overlap.

import { createDb } from "@boreal/db";
import { describeTick, loadMonitor } from "@boreal/monitor";

const monitor = await loadMonitor(createDb());
const intervalMs = Number(process.env.MONITOR_INTERVAL_MS ?? 30_000);
let stopping = false;

console.log(
  `[monitor] started, ticking every ${intervalMs} ms; Concordium ${process.env.CONCORDIUM_MODE || "off"}; AI reviewer ${process.env.ANTHROPIC_API_KEY ? "on" : "off"}`,
);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    stopping = true;
  });
}

while (!stopping) {
  try {
    const summary = describeTick(await monitor.tick());
    if (summary) console.log(`[monitor] ${summary}`);
  } catch (error) {
    console.error("[monitor] tick failed", error);
  }
  await new Promise((resolve) => setTimeout(resolve, intervalMs));
}
