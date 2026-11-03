// AG Studio data sources and report for a person's own insights: a Spending page for people who
// post tasks or own agents, an Earnings page for workers, each only when they have the data.

import type { AgDataSourcesDefinition, AgFieldDefinition, AgFormat, AgReportState } from "ag-studio";

import { MONEY_FLOW } from "@/components/admin/console/widgets";

import type { InsightsRows } from "./insights-data";

const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
type Spec = [id: string, name: string, format: AgFormat, hide?: boolean];
const fields = (specs: Spec[]): AgFieldDefinition[] =>
  specs.map(([id, name, format, hide]) => ({ id, name, format, ...(format === "currencyFormat" && { formatOptions: { format: USD } }), ...(hide && { hide }) }));

export function insightsData(rows: InsightsRows): AgDataSourcesDefinition {
  const sources: AgDataSourcesDefinition["sources"] = [];
  const dates: string[] = [];
  if (rows.spending) {
    dates.push(...rows.spending.tasks.map((t) => t.postedAt));
    sources.push(
      {
        id: "spend",
        name: "Your tasks",
        data: rows.spending.tasks,
        fields: fields([
          ["id", "Task ID", "textFormat", true],
          ["ref", "Task", "textFormat"],
          ["postedBy", "Posted by", "textFormat"],
          ["description", "Task description", "textFormat"],
          ["status", "Status", "textFormat"],
          ["rail", "Paid with", "textFormat"],
          ["total", "Task cost", "currencyFormat"],
          ["budget", "Worker pay", "currencyFormat"],
          ["verdict", "Verdict", "textFormat"],
          ["decided", "Reviewed", "integerFormat"],
          ["passed", "Passed", "integerFormat"],
          ["tasks", "Tasks", "integerFormat"],
          ["postedAt", "Posted", "dateTimeFormat"],
          ["hoursToClaim", "Hours to claim", "decimalFormat"],
          ["hoursToResult", "Hours to result", "decimalFormat"],
        ]),
      },
      {
        id: "spendMoney",
        name: "Your money movements",
        data: rows.spending.money,
        fields: fields([
          ["id", "Entry ID", "textFormat", true],
          ["taskId", "Entry task ID", "textFormat", true],
          ["postedBy", "Payer", "textFormat"],
          ["rail", "Rail", "textFormat"],
          ["kind", "Movement", "textFormat"],
          ["funded", "Paid in", "currencyFormat"],
          ["held", "Held at PayPal", "currencyFormat"],
          ["inEscrow", "Waiting in escrow", "currencyFormat"],
          ["workerPay", "Paid to workers", "currencyFormat"],
          ["fees", "Fees", "currencyFormat"],
          ["refunded", "Refunded to you", "currencyFormat"],
          ["onItsWay", "On its way", "currencyFormat"],
          ["returned", "Returned", "currencyFormat"],
          ["at", "Recorded", "dateTimeFormat"],
        ]),
      },
    );
  }
  if (rows.earnings) {
    dates.push(...rows.earnings.map((j) => j.claimedAt));
    sources.push({
      id: "jobs",
      name: "Your work",
      data: rows.earnings,
      fields: fields([
        ["id", "Task ID", "textFormat", true],
        ["ref", "Task", "textFormat"],
        ["description", "Task description", "textFormat"],
        ["requester", "Posted by", "textFormat"],
        ["rail", "Paid with", "textFormat"],
        ["state", "Payment", "textFormat"],
        ["paid", "Paid to you", "currencyFormat"],
        ["onItsWay", "On its way", "currencyFormat"],
        ["heldForYou", "Held for you", "currencyFormat"],
        ["paidTasks", "Paid tasks", "integerFormat"],
        ["tasks", "Tasks", "integerFormat"],
        ["claimedAt", "Claimed", "dateTimeFormat"],
        ["paidAt", "Paid", "dateTimeFormat"],
        ["hoursToPaid", "Hours from result to pay", "decimalFormat"],
      ]),
    });
  }
  const today = rows.asOf.slice(0, 10);
  const first = dates.sort()[0]?.slice(0, 10) ?? today;
  const onCalendar = (tableId: string, fieldId: string) => ({ id: `${tableId}-${fieldId}`, source: { tableId, fieldId }, target: { calendarId: "calendar" }, truncate: "day" as const });
  return {
    sources,
    relationships: [
      ...(rows.spending
        ? [
            { id: "money-task", source: { tableId: "spendMoney", fieldId: "taskId" }, target: { tableId: "spend", fieldId: "id" }, type: "many-to-one" as const },
            onCalendar("spend", "postedAt"),
            onCalendar("spendMoney", "at"),
          ]
        : []),
      ...(rows.earnings ? [onCalendar("jobs", "claimedAt")] : []),
    ],
    calendars: [{ id: "calendar", label: "Calendar", range: { from: { type: "date", value: first }, to: { type: "date", value: today } }, fragments: ["year", "month", "week", "day"] }],
    expressions: rows.spending
      ? [{ id: "passRate", name: "Pass rate", format: "percentageFormat", isMeasure: true, expression: { operator: "divide", inputs: [{ id: "spend.passed", aggregation: "sum" }, { id: "spend.decided", aggregation: "sum" }] } }]
      : [],
  };
}

const at = (xTrack: number, yTrack: number, xSpan: number, ySpan: number) => ({ xTrack, yTrack, xSpan, ySpan });
const title = (text: string, subtitle?: string) => ({ title: { enabled: true, text }, ...(subtitle && { subtitle: { enabled: true, text: subtitle } }) });
const sum = (id: string) => ({ id, aggregation: "sum" as const });
const avg = (id: string) => ({ id, aggregation: "avg" as const });
const field = (id: string) => ({ id });
const SANS = "var(--font-manrope), ui-sans-serif, system-ui, sans-serif";
const kpi = (text: string, value: { id: string; aggregation?: "sum" | "avg" }) => ({
  type: "value",
  dataMapping: { value: [value] },
  format: {
    title: { enabled: true, text, typography: { fontFamily: SANS, fontSize: 12, fontWeight: "bold", fontStyle: "normal" } },
    caption: { enabled: false },
    style: { typography: { fontFamily: SANS, fontSize: 22, fontWeight: "bold", fontStyle: "normal" } },
  },
});
const legend = { theme: { common: { legend: { enabled: true, position: "bottom" } } } };

const spendingPage = {
  id: "spending",
  widgets: {
    "kpi-in": kpi("Paid in", sum("spendMoney.funded")),
    "kpi-held": kpi("Held at PayPal now", sum("spendMoney.held")),
    "kpi-workers": kpi("Paid to workers", sum("spendMoney.workerPay")),
    "kpi-fees": kpi("Fees", sum("spendMoney.fees")),
    "kpi-refunded": kpi("Refunded to you", sum("spendMoney.refunded")),
    "kpi-pass": kpi("Pass rate", field("passRate")),
    flow: {
      type: MONEY_FLOW,
      dataMapping: {
        value: [
          sum("spendMoney.funded"),
          sum("spendMoney.held"),
          sum("spendMoney.inEscrow"),
          sum("spendMoney.workerPay"),
          sum("spendMoney.fees"),
          sum("spendMoney.refunded"),
          sum("spendMoney.onItsWay"),
          sum("spendMoney.returned"),
        ],
      },
      format: title("Where your money is", "Everything you paid in, and where it is now"),
    },
    "by-week": {
      type: "column-chart-stacked",
      dataMapping: { categoryKey: [field("calendar::week")], valueKey: [sum("spend.total")], legendKey: [field("spend.postedBy")] },
      format: { ...title("Spent by week"), style: legend },
    },
    tasks: {
      type: "grid",
      dataMapping: {
        cols: [field("spend.postedAt"), field("spend.ref"), field("spend.postedBy"), field("spend.description"), field("spend.status"), field("spend.verdict"), field("spend.rail"), sum("spend.total"), avg("spend.hoursToResult")],
      },
      sort: [{ field: field("spend.postedAt"), direction: "desc" }],
      format: title("Your tasks"),
    },
  },
  widgetLayout: {
    "kpi-in": at(0, 0, 4, 7),
    "kpi-held": at(4, 0, 4, 7),
    "kpi-workers": at(8, 0, 4, 7),
    "kpi-fees": at(12, 0, 4, 7),
    "kpi-refunded": at(16, 0, 4, 7),
    "kpi-pass": at(20, 0, 4, 7),
    flow: at(0, 7, 14, 19),
    "by-week": at(14, 7, 10, 19),
    tasks: at(0, 26, 24, 20),
  },
};

const earningsPage = {
  id: "earnings",
  widgets: {
    "kpi-paid": kpi("Paid to you", sum("jobs.paid")),
    "kpi-way": kpi("On its way", sum("jobs.onItsWay")),
    "kpi-held": kpi("Held for you", sum("jobs.heldForYou")),
    "kpi-count": kpi("Tasks paid", sum("jobs.paidTasks")),
    "kpi-speed": kpi("Avg hours, result to pay", avg("jobs.hoursToPaid")),
    "by-week": {
      type: "column-chart-stacked",
      dataMapping: { categoryKey: [field("calendar::week")], valueKey: [sum("jobs.paid")], legendKey: [field("jobs.rail")] },
      format: { ...title("Earned by week"), style: legend },
    },
    requesters: {
      type: "donut-chart",
      dataMapping: { categoryKey: [field("jobs.requester")], valueKey: [sum("jobs.paid")] },
      format: { ...title("Who you worked for"), style: { custom: { pieDataLabel: { enabled: true }, totalLabel: { enabled: true } } } },
    },
    jobs: {
      type: "grid",
      dataMapping: { cols: [field("jobs.claimedAt"), field("jobs.ref"), field("jobs.description"), field("jobs.requester"), field("jobs.state"), field("jobs.rail"), sum("jobs.paid"), field("jobs.paidAt")] },
      sort: [{ field: field("jobs.claimedAt"), direction: "desc" }],
      format: title("Your tasks"),
    },
  },
  widgetLayout: {
    "kpi-paid": at(0, 0, 5, 7),
    "kpi-way": at(5, 0, 5, 7),
    "kpi-held": at(10, 0, 5, 7),
    "kpi-count": at(15, 0, 4, 7),
    "kpi-speed": at(19, 0, 5, 7),
    "by-week": at(0, 7, 15, 18),
    requesters: at(15, 7, 9, 18),
    jobs: at(0, 25, 24, 20),
  },
};

export function insightsReport(rows: InsightsRows, start: "spending" | "earnings"): AgReportState {
  const pages = [...(rows.spending ? [spendingPage] : []), ...(rows.earnings ? [earningsPage] : [])];
  return {
    selectedPageId: pages.some((p) => p.id === start) ? start : pages[0]!.id,
    pages,
    panels: { filters: { collapsed: true } },
  } as unknown as AgReportState;
}
