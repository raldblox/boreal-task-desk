import "server-only";

import { type AnomalyReport, consoleRows } from "@/components/admin/console/console-data";

import { getDesk } from "./desk";

// The money console's data, read through the desk's read-only console views. Callers check the
// admin allowlist first.

export async function consoleData() {
  return consoleRows(await getDesk().adminConsole({ days: 90 }));
}

export async function anomalyReport(): Promise<AnomalyReport> {
  const { anomalies, reconciliation } = await getDesk().adminAnomalies();
  return { checkedAt: new Date().toISOString(), anomalies, reconciliation };
}
