// AG Studio's data sources for the money console: the console's tables, how they relate, a
// shared calendar and the ratios operators ask for. Field ids (`ledger.feesEarned`) are what the
// report state, the custom widgets and the agents refer to.

import type { AgDataSourcesDefinition, AgExpressionFieldDefinition, AgFieldDefinition, AgFormat, AgRelationDefinition } from "ag-studio";

import type { ConsoleRows } from "./console-data";

export const CALENDAR_ID = "calendar";

type FieldSpec = [id: string, name: string, format: AgFormat, hide?: boolean, description?: string];

const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

const fields = (specs: FieldSpec[]): AgFieldDefinition[] =>
  specs.map(([id, name, format, hide, description]) => ({
    id,
    name,
    format,
    ...(format === "currencyFormat" && { formatOptions: { format: USD } }),
    ...(hide && { hide }),
    ...(description && { description }),
  }));

const manyToOne = (id: string, source: string, target: string): AgRelationDefinition => {
  const [sourceTable, sourceField] = source.split(".");
  const [targetTable, targetField] = target.split(".");
  return { id, source: { tableId: sourceTable!, fieldId: sourceField! }, target: { tableId: targetTable!, fieldId: targetField! }, type: "many-to-one" };
};

const onCalendar = (tableId: string, fieldId: string): AgRelationDefinition => ({
  id: `${tableId}-${fieldId}-calendar`,
  source: { tableId, fieldId },
  target: { calendarId: CALENDAR_ID },
  truncate: "day",
});

const ratio = (id: string, name: string, description: string, numerator: string, denominator: string): AgExpressionFieldDefinition => ({
  id,
  name,
  description,
  format: "percentageFormat",
  isMeasure: true,
  expression: { operator: "divide", inputs: [{ id: numerator, aggregation: "sum" }, { id: denominator, aggregation: "sum" }] },
});

export function studioData(rows: ConsoleRows): AgDataSourcesDefinition {
  const days = [...rows.tasks.map((t) => t.postedAt), ...rows.ledger.map((e) => e.at)].sort();
  const today = rows.asOf.slice(0, 10);
  return {
    description:
      "boreal.work's live money: AI agents and people post real-world tasks, fund them into escrow (a PayPal authorization held on the payer's PayPal, or USDC/tokens on NEAR and Concordium), " +
      "verified workers do them, a reviewer passes or fails the result, and escrow pays the worker, the reviewer and boreal.work's platform fee, or refunds the requester. " +
      "Money is in US dollars. Test money is excluded. Workers and people appear only as shortened pseudonyms.",
    sources: [
      {
        id: "tasks",
        description: "One row per task. GMV is the task's full total (budget plus fees) once funded. Flags (funded, decided, passed, failed, disputed, overturned) are 1 or 0, so sum them.",
        data: rows.tasks,
        fields: fields([
          ["id", "Task ID", "textFormat", true],
          ["ref", "Task", "textFormat"],
          ["status", "Task status", "textFormat"],
          ["stage", "Funnel stage", "textFormat", false, "Furthest step reached: posted, screened, funded, claimed, submitted, reviewed, paid out."],
          ["rail", "Payment rail", "textFormat", false, "paypal, concordium, near, or unfunded."],
          ["requesterKind", "Requester kind", "textFormat", false, "agent (an AI agent), person (posting on the website) or NEAR market buyer."],
          ["requester", "Requester", "textFormat", false, "Agent name, or a person's shortened pseudonym."],
          ["verified", "Requester verification", "textFormat"],
          ["workerKind", "Worker kind", "textFormat", false, "person, agent (an AI agent worker on NEAR) or none (unclaimed)."],
          ["worker", "Worker", "textFormat", false, "Shortened pseudonym."],
          ["reviewMode", "Reviewed by", "textFormat"],
          ["verdict", "Verdict", "textFormat"],
          ["budget", "Worker pay", "currencyFormat"],
          ["fees", "Task fees", "currencyFormat"],
          ["gmv", "GMV", "currencyFormat", false, "Task budgets plus fees, counted once funded."],
          ["funded", "Funded tasks", "integerFormat"],
          ["decided", "Reviewed tasks", "integerFormat"],
          ["passed", "Passed tasks", "integerFormat"],
          ["failed", "Failed tasks", "integerFormat"],
          ["disputed", "Disputed tasks", "integerFormat"],
          ["overturned", "Overturned on dispute", "integerFormat"],
          ["tasks", "Tasks", "integerFormat"],
          ["refunded", "Refunded on task", "currencyFormat"],
          ["postedAt", "Posted", "dateTimeFormat"],
          ["fundedAt", "Funded at", "dateTimeFormat"],
          ["paidAt", "Worker paid at", "dateTimeFormat"],
          ["hoursToClaim", "Hours to claim", "decimalFormat", false, "From funding to the first claim."],
          ["hoursToReview", "Hours to review", "decimalFormat", false, "From submission to the verdict that stands."],
          ["hoursPassToPayout", "Hours from pass to payout", "decimalFormat", false, "From the passing verdict to the worker's payout settling."],
        ]),
      },
      {
        id: "funnel",
        name: "Funnel steps",
        description: "One row per step each task reached (a paid task has all seven), so counting rows per step gives a funnel. Sort by order.",
        data: rows.funnel,
        fields: fields([
          ["id", "Step ID", "textFormat", true],
          ["taskId", "Task ID", "textFormat", true],
          ["step", "Funnel step", "textFormat"],
          ["order", "Step order", "integerFormat"],
          ["rail", "Funnel rail", "textFormat"],
          ["requesterKind", "Funnel requester kind", "textFormat"],
          ["tasks", "Tasks reaching step", "integerFormat"],
        ]),
      },
      {
        id: "ledger",
        name: "Ledger entries",
        description:
          "Every money movement, written before it is sent. kind: funding (requester to escrow), worker payout, review fee, platform fee, refund. " +
          "state: held (a PayPal authorization not yet captured), captured, received, paid, returned (refunded), on its way, failed. " +
          "The money columns (fundedIn, heldNow, inEscrow, paidToWorkers, platformFees, reviewFees, feesEarned, refunded, onItsWay, failed) are the amount when the row is of that kind and state, else 0, so sum them directly.",
        data: rows.ledger,
        fields: fields([
          ["id", "Entry ID", "textFormat", true],
          ["taskId", "Entry task ID", "textFormat", true],
          ["taskRef", "Entry task", "textFormat"],
          ["kind", "Movement", "textFormat"],
          ["state", "Money state", "textFormat"],
          ["direction", "Direction", "textFormat"],
          ["rail", "Rail", "textFormat"],
          ["requesterKind", "Payer kind", "textFormat"],
          ["requester", "Payer", "textFormat"],
          ["amount", "Amount", "currencyFormat"],
          ["signedAmount", "Net to escrow", "currencyFormat"],
          ["fundedIn", "Funded in", "currencyFormat"],
          ["heldNow", "Held at PayPal", "currencyFormat"],
          ["inEscrow", "In escrow", "currencyFormat"],
          ["paidToWorkers", "Paid to workers", "currencyFormat"],
          ["platformFees", "Platform fees", "currencyFormat"],
          ["reviewFees", "Review fees", "currencyFormat"],
          ["feesEarned", "Fees earned", "currencyFormat"],
          ["refunded", "Refunded", "currencyFormat"],
          ["onItsWay", "On its way", "currencyFormat"],
          ["failed", "Failed transfers", "currencyFormat"],
          ["entries", "Entries", "integerFormat"],
          ["at", "Recorded", "dateTimeFormat"],
          ["settledAt", "Settled", "dateTimeFormat"],
          ["hoursToSettle", "Hours to settle", "decimalFormat"],
          ["txRef", "Transaction", "textFormat"],
        ]),
      },
      {
        id: "transfers",
        name: "Money transfers",
        description:
          "Captures, releases, payouts and refunds as the outbox sends them. state: done, on its way (queued under 2 hours), stuck (queued over 2 hours), retrying (the last attempt failed), failed (the provider returned it).",
        data: rows.transfers,
        fields: fields([
          ["id", "Transfer ID", "textFormat", true],
          ["taskId", "Transfer task ID", "textFormat", true],
          ["taskRef", "Transfer task", "textFormat"],
          ["kind", "Transfer kind", "textFormat"],
          ["rail", "Transfer rail", "textFormat"],
          ["to", "Paid to", "textFormat"],
          ["amount", "Transfer amount", "currencyFormat"],
          ["state", "Transfer state", "textFormat"],
          ["attempts", "Attempts", "integerFormat"],
          ["lastError", "Last error", "textFormat"],
          ["transfers", "Transfers", "integerFormat"],
          ["queuedAt", "Queued", "dateTimeFormat"],
          ["doneAt", "Done", "dateTimeFormat"],
          ["minutesOpen", "Minutes open", "integerFormat"],
        ]),
      },
      {
        id: "escrow",
        name: "Escrow by rail",
        description: "Each rail's escrow position now: holds not yet taken, money received, where it went, and the balance escrow should hold.",
        data: rows.escrow,
        fields: fields([
          ["rail", "Escrow rail", "textFormat"],
          ["held", "PayPal holds", "currencyFormat"],
          ["received", "Received", "currencyFormat"],
          ["paidToWorkers", "To workers", "currencyFormat"],
          ["reviewFees", "To reviewers", "currencyFormat"],
          ["platformFees", "To boreal.work", "currencyFormat"],
          ["refunded", "Back to payers", "currencyFormat"],
          ["onItsWay", "Still sending", "currencyFormat"],
          ["failed", "Returned", "currencyFormat"],
          ["balance", "Escrow balance", "currencyFormat"],
        ]),
      },
    ],
    relationships: [
      manyToOne("ledger-task", "ledger.taskId", "tasks.id"),
      manyToOne("transfer-task", "transfers.taskId", "tasks.id"),
      manyToOne("funnel-task", "funnel.taskId", "tasks.id"),
      onCalendar("tasks", "postedAt"),
      onCalendar("ledger", "at"),
      onCalendar("transfers", "queuedAt"),
    ],
    calendars: [
      {
        id: CALENDAR_ID,
        label: "Calendar",
        range: { from: { type: "date", value: (days[0] ?? today).slice(0, 10) }, to: { type: "date", value: today } },
        fragments: ["year", "quarter", "month", "week", "day", "dayOfWeek"],
      },
    ],
    expressions: [
      ratio("passRate", "Pass rate", "Passed / reviewed tasks.", "tasks.passed", "tasks.decided"),
      ratio("disputeRate", "Dispute rate", "Disputed / reviewed tasks.", "tasks.disputed", "tasks.decided"),
      ratio("takeRate", "Take rate", "Fees earned / money funded in.", "ledger.feesEarned", "ledger.fundedIn"),
      ratio("refundRate", "Refund rate", "Refunded / money funded in.", "ledger.refunded", "ledger.fundedIn"),
    ],
  };
}
