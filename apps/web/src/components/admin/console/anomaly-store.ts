"use client";

import { useSyncExternalStore } from "react";

import type { AnomalyReport } from "./console-data";

// The anomaly agent's latest findings, shared by the alerts widget, the scan button and the
// agent's own tools. A rescan asks the server again (the desk's read-only checks, including
// escrow against each rail's balance).

let report: AnomalyReport | null = null;
let scanning = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const anomalyStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  get: () => report,
  scanning: () => scanning,
  set(next: AnomalyReport) {
    report = next;
    emit();
  },
  /** Runs the checks again on the server; keeps the last report if the request fails. */
  async rescan(): Promise<AnomalyReport | null> {
    scanning = true;
    emit();
    try {
      const res = await fetch("/admin/console/anomalies", { cache: "no-store" });
      if (res.ok) report = (await res.json()) as AnomalyReport;
    } finally {
      scanning = false;
      emit();
    }
    return report;
  },
};

export function useAnomalies() {
  const current = useSyncExternalStore(anomalyStore.subscribe, anomalyStore.get, anomalyStore.get);
  const busy = useSyncExternalStore(anomalyStore.subscribe, anomalyStore.scanning, () => false);
  return { report: current, scanning: busy };
}
