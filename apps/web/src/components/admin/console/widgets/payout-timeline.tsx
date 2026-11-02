"use client";

import { type MappedParams, money, useWidgetRows, valueOf } from "./use-widget-rows";

// Payout status timeline: every capture, payout and refund over the last hours as a dot in its
// state's lane, sized by amount. Anything outside "done" is something an operator may need to
// look at: still on its way, stuck past two hours, retrying after an error, or returned.

const LANES: [state: string, label: string, tone: string][] = [
  ["done", "Done", "var(--bc-ok)"],
  ["on its way", "On its way", "var(--bc-chart-2)"],
  ["stuck", "Stuck > 2 h", "var(--bc-warn)"],
  ["retrying", "Retrying", "var(--bc-warn)"],
  ["failed", "Returned", "var(--bc-bad)"],
];

const HOUR = 60 * 60 * 1000;

export function PayoutTimelineWidget(params: MappedParams<"time" | "state" | "value" | "label">) {
  const m = params.dataMapping;
  const time = m.time?.[0];
  const state = m.state?.[0];
  const value = m.value?.[0];
  const label = m.label?.[0];
  const fields = time && state && value ? [time, state, value, ...(label ? [label] : [])] : null;
  const result = useWidgetRows(params, fields);
  if (!fields || !result) return null;

  const hours = Number((params.format as { style?: { hours?: number } } | undefined)?.style?.hours ?? 48);
  // The window ends when the data was read, so the dots line up with "now" on the axis.
  const end = result.at;
  const start = end - hours * HOUR;
  const points = result.rows
    .map((r) => ({
      at: new Date(String(valueOf(r, time!))).getTime(),
      state: String(valueOf(r, state!) ?? ""),
      amount: Number(valueOf(r, value!) ?? 0),
      label: label ? String(valueOf(r, label) ?? "") : "",
    }))
    .filter((p) => p.at >= start && p.at <= end);
  const max = Math.max(...points.map((p) => p.amount), 1);
  const ticks = Array.from({ length: 7 }, (_, i) => start + (i * (end - start)) / 6);
  const x = (at: number) => `${((at - start) / (end - start)) * 100}%`;

  return (
    <div className="flex h-full min-h-0 flex-col gap-1 font-sans text-xs">
      <div className="grid min-h-0 flex-1 grid-cols-[7.5rem_1fr]" style={{ gridTemplateRows: `repeat(${LANES.length}, minmax(0, 1fr)) auto` }}>
        {LANES.map(([key, name, tone]) => {
          const lane = points.filter((p) => p.state === key);
          const sum = lane.reduce((s, p) => s + p.amount, 0);
          return [
            <div key={`${key}-label`} className="flex flex-col justify-center border-b border-dashed pr-3">
              <span className="flex items-center gap-1.5 font-medium">
                <span className="size-2 rounded-full" style={{ background: tone }} />
                {name}
              </span>
              <span className="pl-3.5 font-mono text-[11px] text-muted-foreground tabular-nums">
                {lane.length} · {money(sum)}
              </span>
            </div>,
            <div key={`${key}-lane`} className="relative border-b border-dashed">
              {lane.map((p, i) => {
                const size = 6 + Math.sqrt(p.amount / max) * 14;
                return (
                  <span
                    key={i}
                    title={`${p.label ? `${p.label} · ` : ""}${money(p.amount)} · ${new Date(p.at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}`}
                    className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card"
                    style={{ left: x(p.at), width: size, height: size, background: tone, opacity: key === "done" ? 0.55 : 0.95 }}
                  />
                );
              })}
            </div>,
          ];
        })}
        <div />
        <div className="relative h-5">
          {ticks.map((t, i) => (
            <span key={i} className="absolute top-1 -translate-x-1/2 font-mono text-[10px] whitespace-nowrap text-muted-foreground first:translate-x-0 last:-translate-x-full" style={{ left: x(t) }}>
              {i === ticks.length - 1 ? "now" : `−${Math.round((end - t) / HOUR)}h`}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
