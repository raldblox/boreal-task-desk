import "server-only";

import { describeTick, loadMonitor, type Monitor } from "@boreal/monitor";

import { getDb } from "./db";

let monitor: Promise<Monitor> | undefined;

export function getMonitor(): Promise<Monitor> {
  monitor ??= loadMonitor(getDb());
  return monitor;
}

/**
 * Runs a tick in the background after a user action, so reviews and payouts happen within
 * seconds of activity. Errors are logged, never shown to the user; the lease skips the tick
 * if one is already running.
 */
export async function kickMonitor(): Promise<void> {
  try {
    const summary = describeTick(await (await getMonitor()).tick({ aiLimit: 2 }));
    if (summary) console.log(`[monitor] ${summary}`);
  } catch (error) {
    console.error("[monitor] background tick failed", error);
  }
}
