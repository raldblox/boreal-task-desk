"use client";

import type { Anomaly } from "@boreal/desk";
import type { AgPageState, AgReportState, AgStudioApi } from "ag-studio";

import { ALERTS, PAYOUT_TIMELINE } from "./widgets";

// What the anomaly agent builds from its findings: an "Anomalies" page with the alert board and,
// for each kind of finding, the widget that shows its evidence. The same function serves the
// agent's tool and the Scan for anomalies button, so the result is the same with or without AI.

export const ANOMALY_PAGE = "anomalies";

const at = (xTrack: number, yTrack: number, xSpan: number, ySpan: number) => ({ xTrack, yTrack, xSpan, ySpan });
const title = (text: string, subtitle?: string) => ({ title: { enabled: true, text }, ...(subtitle && { subtitle: { enabled: true, text: subtitle } }) });
const sum = (id: string) => ({ id, aggregation: "sum" as const });
const field = (id: string) => ({ id });

/** Evidence widgets per kind of finding, each a full-width row. */
const EVIDENCE: Record<Anomaly["kind"], { id: string; height: number; widget: object }[]> = {
  failed_payouts: [
    {
      id: "failed-entries",
      height: 16,
      widget: {
        type: "grid",
        dataMapping: { cols: [field("ledger.at"), field("ledger.taskRef"), field("ledger.kind"), field("ledger.state"), field("ledger.rail"), field("ledger.requester"), sum("ledger.failed")] },
        sort: [{ field: sum("ledger.failed"), direction: "desc" }],
        format: title("Failed transfers", "Returned by the provider: the money is back in escrow"),
      },
    },
  ],
  stuck_payouts: [
    {
      id: "stuck-timeline",
      height: 16,
      widget: {
        type: PAYOUT_TIMELINE,
        dataMapping: { time: [field("transfers.queuedAt")], state: [field("transfers.state")], value: [sum("transfers.amount")], label: [field("transfers.taskRef")] },
        format: { ...title("Payouts on their way", "Last 12 hours"), style: { hours: 12 } },
      },
    },
    {
      id: "stuck-transfers",
      height: 14,
      widget: {
        type: "grid",
        dataMapping: { cols: [field("transfers.taskRef"), field("transfers.kind"), field("transfers.rail"), field("transfers.state"), sum("transfers.attempts"), field("transfers.lastError"), sum("transfers.minutesOpen"), sum("transfers.amount")] },
        sort: [{ field: sum("transfers.minutesOpen"), direction: "desc" }],
        format: title("Longest-open transfers"),
      },
    },
  ],
  refund_spike: [
    {
      id: "refunds-by-day",
      height: 16,
      widget: {
        type: "column-chart-stacked",
        dataMapping: { categoryKey: [field("calendar::day")], valueKey: [sum("ledger.refunded")], legendKey: [field("ledger.requester")] },
        format: { ...title("Refunds by day and payer", "Which requester the spike comes from"), style: { theme: { common: { legend: { enabled: true, position: "right" } } } } },
      },
    },
  ],
  failing_outbox: [
    {
      id: "failing-holds",
      height: 14,
      widget: {
        type: "grid",
        dataMapping: { cols: [field("transfers.taskRef"), field("transfers.kind"), field("transfers.state"), sum("transfers.attempts"), field("transfers.lastError"), field("transfers.queuedAt"), sum("transfers.amount")] },
        sort: [{ field: sum("transfers.attempts"), direction: "desc" }],
        format: title("Holds waiting to be captured or released"),
      },
    },
  ],
  escrow_gap: [
    {
      id: "escrow-check",
      height: 10,
      widget: {
        type: "grid",
        dataMapping: { cols: [field("escrow.rail"), sum("escrow.received"), sum("escrow.paidToWorkers"), sum("escrow.reviewFees"), sum("escrow.platformFees"), sum("escrow.refunded"), sum("escrow.balance")] },
        format: title("What the ledger says escrow holds"),
      },
    },
  ],
};

/** Builds (or rebuilds) the Anomalies page for these findings and opens it. Returns the widget ids it added. */
export function buildAnomalyPage(api: AgStudioApi, anomalies: Anomaly[]): string[] {
  const kinds = [...new Set(anomalies.map((a) => a.kind))];
  const widgets: NonNullable<AgPageState["widgets"]> = { alerts: { type: ALERTS, dataMapping: {}, format: title("Anomaly alerts") } as never };
  const widgetLayout: NonNullable<AgPageState["widgetLayout"]> = { alerts: at(0, 0, 24, Math.min(8 + anomalies.length * 4, 24)) };
  let y = widgetLayout.alerts!.ySpan;
  for (const kind of kinds) {
    for (const e of EVIDENCE[kind]) {
      widgets[e.id] = e.widget as never;
      widgetLayout[e.id] = at(0, y, 24, e.height);
      y += e.height;
    }
  }
  const page: AgPageState = { id: ANOMALY_PAGE, widgets, widgetLayout };
  const state = api.getState();
  const pages = state.pages.some((p) => p.id === ANOMALY_PAGE)
    ? state.pages.map((p) => (p.id === ANOMALY_PAGE ? page : p))
    : [...state.pages, page];
  api.setState({ ...state, pages, selectedPageId: ANOMALY_PAGE } as AgReportState);
  return Object.keys(widgets);
}
