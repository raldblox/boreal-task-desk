// The money console's built-in report, as AG Studio state: Money, Payouts, Funnel and Ledger
// pages. Field ids (`ledger.feesEarned`) refer to ./studio-data.ts; boreal's own widget types to
// ./widgets. Layout is in Studio's canvas tracks: 24 columns wide.

import type { AgReportState, AgWidgetLayoutState } from "ag-studio";

import { ALERTS, MONEY_FLOW, PAYOUT_TIMELINE } from "./widgets";

const at = (xTrack: number, yTrack: number, xSpan: number, ySpan: number): AgWidgetLayoutState => ({ xTrack, yTrack, xSpan, ySpan });
const title = (text: string, subtitle?: string) => ({
  title: { enabled: true, text },
  ...(subtitle && { subtitle: { enabled: true, text: subtitle } }),
});
const sum = (id: string) => ({ id, aggregation: "sum" as const });
const avg = (id: string) => ({ id, aggregation: "avg" as const });
const field = (id: string) => ({ id });

const SANS = "var(--font-manrope), ui-sans-serif, system-ui, sans-serif";
const type = (fontSize: number, fontWeight: "normal" | "bold" = "normal") => ({ fontFamily: SANS, fontSize, fontWeight, fontStyle: "normal" as const });
const legend = { theme: { common: { legend: { enabled: true, position: "bottom" as const } } } };

/** Button filters in the brand: quiet outlines, teal when selected. */
const FILTER_BUTTONS = {
  selection: { type: "multiple" as const },
  dimensions: { height: 28, minWidth: 56 },
  defaultItem: { typography: type(12), borderRadius: 8, borderColor: "var(--border)", backgroundColor: "var(--card)", color: "var(--foreground)" },
  activeItem: { backgroundColor: "var(--primary)", color: "var(--primary-foreground)", borderColor: "var(--primary)" },
};

/** A KPI tile: small label, big figure, optional sparkline by day. */
const kpi = (text: string, value: { id: string; aggregation?: "sum" | "avg" }, sparkline = false) => ({
  type: "value" as const,
  dataMapping: { value: [value], ...(sparkline && { sparklineX: [field("calendar::day")] }) },
  format: {
    title: { enabled: true, text, typography: type(12, "bold") },
    caption: { enabled: true, text: "", typography: type(0) },
    style: { typography: type(24, "bold") },
  },
});

const money = {
  id: "money",
  widgets: {
    "kpi-gmv": kpi("GMV funded", sum("tasks.gmv"), true),
    "kpi-held": kpi("Held at PayPal now", sum("ledger.heldNow")),
    "kpi-fees": kpi("Fees earned", sum("ledger.feesEarned"), true),
    "kpi-workers": kpi("Paid to workers", sum("ledger.paidToWorkers"), true),
    "kpi-refunded": kpi("Refunded", sum("ledger.refunded"), true),
    "kpi-take": kpi("Take rate", field("takeRate")),
    flow: {
      type: MONEY_FLOW,
      dataMapping: {
        value: [
          sum("ledger.fundedIn"),
          sum("ledger.heldNow"),
          sum("ledger.inEscrow"),
          sum("ledger.paidToWorkers"),
          sum("ledger.platformFees"),
          sum("ledger.reviewFees"),
          sum("ledger.refunded"),
          sum("ledger.onItsWay"),
          sum("ledger.failed"),
        ],
      },
      format: title("Money in flight", "From funding to payouts, fees and refunds"),
    },
    alerts: { type: ALERTS, dataMapping: {}, format: title("Alerts") },
    "funded-by-day": {
      type: "combo-chart-grouped-column-line",
      dataMapping: { categoryKey: [field("calendar::day")], valueKey: [sum("ledger.fundedIn")], secondaryValueKey: [sum("ledger.feesEarned")] },
      format: { ...title("Funded in by day, with fees earned"), style: legend },
    },
    "rail-mix": {
      type: "donut-chart",
      dataMapping: { categoryKey: [field("ledger.rail")], valueKey: [sum("ledger.fundedIn")] },
      format: { ...title("Funded in by rail"), style: { custom: { pieDataLabel: { enabled: true }, totalLabel: { enabled: true } } } },
    },
    escrow: {
      type: "grid",
      dataMapping: {
        cols: [
          field("escrow.rail"),
          sum("escrow.held"),
          sum("escrow.received"),
          sum("escrow.paidToWorkers"),
          sum("escrow.reviewFees"),
          sum("escrow.platformFees"),
          sum("escrow.refunded"),
          sum("escrow.onItsWay"),
          sum("escrow.failed"),
          sum("escrow.balance"),
        ],
      },
      format: title("Escrow by rail", "Holds not yet taken, money received and where it went"),
    },
    "requester-mix": {
      type: "bar-chart-stacked",
      dataMapping: { categoryKey: [field("tasks.requesterKind")], valueKey: [sum("tasks.gmv")], legendKey: [field("tasks.rail")] },
      format: { ...title("GMV by requester kind and rail"), style: legend },
    },
    "worker-mix": {
      type: "donut-chart",
      dataMapping: { categoryKey: [field("tasks.workerKind")], valueKey: [sum("tasks.funded")] },
      format: { ...title("Funded tasks by worker kind"), style: { custom: { pieDataLabel: { enabled: true }, totalLabel: { enabled: true } } } },
    },
    "kpi-disputes": kpi("Disputes", sum("tasks.disputed")),
    "kpi-overturned": kpi("Overturned on dispute", sum("tasks.overturned")),
  },
  widgetLayout: {
    "kpi-gmv": at(0, 0, 4, 7),
    "kpi-held": at(4, 0, 4, 7),
    "kpi-fees": at(8, 0, 4, 7),
    "kpi-workers": at(12, 0, 4, 7),
    "kpi-refunded": at(16, 0, 4, 7),
    "kpi-take": at(20, 0, 4, 7),
    flow: at(0, 7, 15, 21),
    alerts: at(15, 7, 9, 21),
    "funded-by-day": at(0, 28, 15, 17),
    "rail-mix": at(15, 28, 9, 17),
    escrow: at(0, 45, 24, 11),
    "requester-mix": at(0, 56, 12, 17),
    "worker-mix": at(12, 56, 7, 17),
    "kpi-disputes": at(19, 56, 5, 8),
    "kpi-overturned": at(19, 64, 5, 9),
  },
};

const payouts = {
  id: "payouts",
  widgets: {
    "kpi-paid": kpi("Paid to workers", sum("ledger.paidToWorkers"), true),
    "kpi-way": kpi("On its way", sum("ledger.onItsWay")),
    "kpi-failed": kpi("Returned by provider", sum("ledger.failed")),
    "kpi-pass-pay": kpi("Avg hours, pass to payout", avg("tasks.hoursPassToPayout")),
    timeline: {
      type: PAYOUT_TIMELINE,
      dataMapping: {
        time: [field("transfers.queuedAt")],
        state: [field("transfers.state")],
        value: [sum("transfers.amount")],
        label: [field("transfers.taskRef")],
      },
      format: { ...title("Payout status timeline", "Captures, payouts and refunds over the last 48 hours"), style: { hours: 48 } },
    },
    state: {
      type: "button-filter",
      dataMapping: { value: [field("transfers.state")] },
      format: { style: FILTER_BUTTONS },
    },
    "by-day": {
      type: "column-chart-stacked",
      dataMapping: {
        categoryKey: [field("calendar::day")],
        valueKey: [sum("ledger.paidToWorkers"), sum("ledger.platformFees"), sum("ledger.reviewFees"), sum("ledger.refunded")],
      },
      format: { ...title("Money out of escrow by day"), style: legend },
    },
    "pass-to-pay": {
      type: "bar-chart-grouped",
      dataMapping: { categoryKey: [field("tasks.rail")], valueKey: [avg("tasks.hoursPassToPayout"), avg("tasks.hoursToReview")] },
      format: { ...title("Avg hours to review and from pass to payout, by rail"), style: legend },
    },
    open: {
      type: "grid",
      dataMapping: {
        cols: [
          field("transfers.taskRef"),
          field("transfers.kind"),
          field("transfers.rail"),
          field("transfers.to"),
          field("transfers.state"),
          sum("transfers.attempts"),
          field("transfers.lastError"),
          field("transfers.queuedAt"),
          sum("transfers.minutesOpen"),
          sum("transfers.amount"),
        ],
      },
      sort: [{ field: field("transfers.queuedAt"), direction: "desc" }],
      format: title("Transfers", "Filter by state above; task links open the task"),
    },
  },
  widgetLayout: {
    "kpi-paid": at(0, 0, 6, 7),
    "kpi-way": at(6, 0, 6, 7),
    "kpi-failed": at(12, 0, 6, 7),
    "kpi-pass-pay": at(18, 0, 6, 7),
    timeline: at(0, 7, 24, 17),
    state: at(0, 24, 24, 7),
    "by-day": at(0, 31, 14, 16),
    "pass-to-pay": at(14, 31, 10, 16),
    open: at(0, 47, 24, 22),
  },
};

const funnel = {
  id: "funnel",
  widgets: {
    "kpi-posted": kpi("Tasks posted", sum("tasks.tasks"), true),
    "kpi-funded": kpi("Funded", sum("tasks.funded")),
    "kpi-pass": kpi("Pass rate", field("passRate")),
    "kpi-claim": kpi("Avg hours to claim", avg("tasks.hoursToClaim")),
    "kpi-dispute": kpi("Dispute rate", field("disputeRate")),
    "kpi-refund": kpi("Refund rate", field("refundRate")),
    rail: {
      type: "button-filter",
      dataMapping: { value: [field("tasks.rail")] },
      format: { style: FILTER_BUTTONS },
    },
    funnel: {
      type: "funnel-chart",
      dataMapping: { categoryKey: [field("funnel.step")], valueKey: [sum("funnel.tasks")] },
      sort: [{ field: field("funnel.step"), direction: "asc" }],
      format: title("Task funnel", "Tasks that reached each step"),
    },
    verdicts: {
      type: "column-chart-stacked",
      dataMapping: { categoryKey: [field("tasks.requesterKind")], valueKey: [sum("tasks.passed"), sum("tasks.failed")] },
      format: { ...title("Verdicts by requester kind"), style: legend },
    },
    claim: {
      type: "bar-chart-grouped",
      dataMapping: { categoryKey: [field("tasks.rail")], valueKey: [avg("tasks.hoursToClaim")] },
      format: title("Avg hours from funding to claim, by rail"),
    },
    mix: {
      type: "sunburst-chart",
      dataMapping: { categoryKey: [field("tasks.requesterKind"), field("tasks.rail")], valueKey: [sum("tasks.gmv")] },
      format: title("GMV by requester and rail"),
    },
  },
  widgetLayout: {
    "kpi-posted": at(0, 0, 4, 7),
    "kpi-funded": at(4, 0, 4, 7),
    "kpi-pass": at(8, 0, 4, 7),
    "kpi-claim": at(12, 0, 4, 7),
    "kpi-dispute": at(16, 0, 4, 7),
    "kpi-refund": at(20, 0, 4, 7),
    rail: at(0, 7, 24, 7),
    funnel: at(0, 14, 14, 22),
    verdicts: at(14, 14, 10, 22),
    claim: at(0, 36, 12, 16),
    mix: at(12, 36, 12, 16),
  },
};

const ledger = {
  id: "ledger",
  widgets: {
    when: { type: "date-filter", dataMapping: { value: [field("ledger.at")] }, format: { ...title("Recorded"), style: { filterType: "relative" } } },
    rail: {
      type: "button-filter",
      dataMapping: { value: [field("ledger.rail")] },
      format: { style: FILTER_BUTTONS },
    },
    kind: {
      type: "button-filter",
      dataMapping: { value: [field("ledger.kind")] },
      format: { style: FILTER_BUTTONS },
    },
    entries: {
      type: "grid",
      dataMapping: {
        cols: [
          field("ledger.at"),
          field("ledger.taskRef"),
          field("ledger.kind"),
          field("ledger.state"),
          field("ledger.rail"),
          field("ledger.requesterKind"),
          field("ledger.requester"),
          sum("ledger.amount"),
          field("ledger.txRef"),
        ],
      },
      sort: [{ field: field("ledger.at"), direction: "desc" }],
      format: title("Ledger entries", "Every money movement, written before it is sent; task links open the task"),
    },
    tasks: {
      type: "grid",
      dataMapping: {
        cols: [
          field("tasks.postedAt"),
          field("tasks.ref"),
          field("tasks.status"),
          field("tasks.stage"),
          field("tasks.rail"),
          field("tasks.requesterKind"),
          field("tasks.requester"),
          field("tasks.workerKind"),
          field("tasks.worker"),
          field("tasks.verdict"),
          sum("tasks.gmv"),
        ],
      },
      sort: [{ field: field("tasks.postedAt"), direction: "desc" }],
      format: title("Tasks"),
    },
  },
  widgetLayout: {
    when: at(0, 0, 8, 7),
    rail: at(8, 0, 6, 7),
    kind: at(14, 0, 10, 7),
    entries: at(0, 7, 24, 26),
    tasks: at(0, 33, 24, 24),
  },
};

export const PAGES = [
  ["money", "Money"],
  ["payouts", "Payouts"],
  ["funnel", "Funnel"],
  ["ledger", "Ledger"],
] as const;

// boreal's widget types aren't in Studio's default registry type, so the state is cast once here.
export const consoleReport = {
  selectedPageId: money.id,
  pages: [money, payouts, funnel, ledger],
} as unknown as AgReportState;
