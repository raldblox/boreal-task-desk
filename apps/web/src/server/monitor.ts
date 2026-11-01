import "server-only";

import { describeTick, loadMonitor, type Monitor } from "@boreal/monitor";

import { getDb } from "./db";

let monitor: Promise<Monitor> | undefined;

export function getMonitor(): Promise<Monitor> {
  monitor ??= loadMonitor(getDb());
  return monitor;
}

/**
 * Runs the monitor in the background after activity, so reviews and payouts happen within
 * seconds instead of waiting for the daily cron. One step can unlock the next (a capture
 * confirmed, then the payout it frees), so it keeps ticking while ticks make progress; if
 * another tick holds the lease it waits briefly and tries again. Errors are logged, never
 * shown to the user.
 */
export async function kickMonitor(): Promise<void> {
  try {
    const m = await getMonitor();
    let busy = 0;
    for (let round = 0; round < 6; round++) {
      const report = await m.tick({ aiLimit: 2 });
      if (!report.ran) {
        // Another tick is running; it may finish before seeing this activity's work.
        if (++busy > 3) break;
        await new Promise((resolve) => setTimeout(resolve, 1500));
        continue;
      }
      const summary = describeTick(report);
      if (summary) console.log(`[monitor] ${summary}`);
      const progressed =
        (report.outbox?.sent ?? 0) + report.expiredClaims + report.expiredDeadlines + report.closedWindows > 0;
      if (!progressed) break;
    }
  } catch (error) {
    console.error("[monitor] background tick failed", error);
  }
}

let lastSoon = 0;

/**
 * A kick for reads (page views, API GETs), at most once a minute per server instance, so
 * timers like objection windows close when people are around, without a cron.
 */
export async function kickMonitorSoon(): Promise<void> {
  const at = Date.now();
  if (at - lastSoon < 60_000) return;
  lastSoon = at;
  await kickMonitor();
}
