"use client";

import type { AgWidgetField, AgWidgetFormParams, AgWidgetsConfig } from "ag-studio";
import { createWidgets } from "ag-studio-react";
import { createElement } from "react";

import { AlertsWidget } from "./alerts";
import { MoneyFlowWidget } from "./money-flow";
import { PayoutTimelineWidget } from "./payout-timeline";

// boreal's own widgets beside Studio's, in a "boreal" group of the widget picker, plus task
// references in every grid opening the task in the admin area.

export const MONEY_FLOW = "boreal-money-flow";
export const PAYOUT_TIMELINE = "boreal-payout-timeline";
export const ALERTS = "boreal-alerts";

const icon = (path: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;

/** Task refs (first 8 characters) to task ids, so grid cells can link to the task. */
const taskIds = new Map<string, string>();
export function registerTaskRefs(rows: { id: string; ref: string }[]) {
  for (const r of rows) taskIds.set(r.ref, r.id);
}

function TaskLink({ value }: { value?: unknown }) {
  const ref = String(value ?? "");
  const id = taskIds.get(ref);
  if (!id) return ref;
  return createElement("a", { href: `/admin/tasks/${id}`, className: "font-mono text-primary underline-offset-2 hover:underline" }, ref);
}

const isTaskRef = (field: AgWidgetField) => /(^|\.)(ref|taskRef)$/.test(String(field.fieldId));

/** Studio's widgets plus boreal's, with boreal's group first in the picker. */
export function borealWidgets(defaults: AgWidgetsConfig) {
  return createWidgets({
    additionalTypes: [
      {
        id: MONEY_FLOW,
        label: "Money in flight",
        icon: icon('<path d="M3 6h4c5 0 5 12 10 12h4"/><path d="M3 6h4c5 0 5 0 10 0h4"/><path d="M3 6h4c5 0 5 6 10 6h4"/>'),
        dataMapping: {
          value: {
            type: "fieldset",
            supportedRoles: ["numeric"],
            requires: { cardinality: "many" },
            required: true,
            aiDescription: "First the money funded in (the source), then each place it went or sits now, such as held, paid to workers, fees, refunded, on its way, failed. Use sums.",
          },
        },
        form: (params: AgWidgetFormParams) => params.createDefaults({ dataMappingItems: [{ key: "value", label: "Funded in, then where it went" }] }),
        comp: MoneyFlowWidget,
        defaultSize: { width: 720, height: 340 },
        minSize: { width: 420, height: 240 },
        ai: {
          description: "Money in flight: a flow from money funded into escrow to where it is now (held, paid out, fees, refunded, stuck). Use it for escrow and money-movement questions.",
        },
      },
      {
        id: PAYOUT_TIMELINE,
        label: "Payout timeline",
        icon: icon('<circle cx="6" cy="7" r="2"/><circle cx="14" cy="12" r="2"/><circle cx="9" cy="17" r="2"/><path d="M3 21h18"/>'),
        dataMapping: {
          time: { type: "field", supportedRoles: ["temporal"], requires: { cardinality: "one" }, required: true, aiDescription: "When the transfer was queued." },
          state: { type: "field", supportedRoles: ["category"], requires: { cardinality: "one" }, required: true, aiDescription: "Transfer state: done, on its way, stuck, retrying, failed." },
          value: { type: "field", supportedRoles: ["numeric"], requires: { cardinality: "one" }, required: true, aiDescription: "Transfer amount, summed." },
          label: { type: "field", supportedRoles: ["category"], requires: { cardinality: "one" }, required: false, aiDescription: "Optional label for each dot, such as the task." },
        },
        form: (params: AgWidgetFormParams) => {
          const form = params.createDefaults({
            dataMappingItems: [
              { key: "time", label: "Time" },
              { key: "state", label: "State" },
              { key: "value", label: "Amount" },
              { key: "label", label: "Label" },
            ],
          });
          (form.items[1] as { items?: unknown[] } | undefined)?.items?.push({ type: "number", id: "format.style.hours", label: "Hours shown", defaultValue: 48 });
          return form;
        },
        comp: PayoutTimelineWidget,
        defaultSize: { width: 720, height: 300 },
        minSize: { width: 420, height: 220 },
        ai: { description: "Payout status timeline: transfers as dots in lanes by state over the last hours. Use it for payouts on their way, stuck, retrying or failed." },
      },
      {
        id: ALERTS,
        label: "Anomaly alerts",
        icon: icon('<path d="M12 3 2 20h20Z"/><path d="M12 10v4"/><path d="M12 17h.01"/>'),
        dataMapping: {},
        form: (params: AgWidgetFormParams) => params.createDefaults({ dataMappingItems: [] }),
        comp: AlertsWidget,
        defaultSize: { width: 480, height: 340 },
        minSize: { width: 300, height: 200 },
        ai: { description: "The anomaly agent's alert board. Needs no data mapping: it shows failed payouts, refund spikes, stuck payouts and escrow gaps from the desk's checks." },
      },
    ],
    overrides: [{ id: "grid", options: { createCellRenderer: (field: AgWidgetField) => (isTaskRef(field) ? TaskLink : undefined) } }],
    menu: [{ label: "boreal", widgetIds: [MONEY_FLOW, PAYOUT_TIMELINE, ALERTS] }, ...defaults.menu],
  } as never);
}
