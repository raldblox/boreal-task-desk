"use client";

import type { AgWidgetParams } from "ag-studio";
import { AlertTriangle, CheckCircle2, Info, RefreshCw, ShieldAlert } from "lucide-react";

import { useEffect } from "react";

import { anomalyStore, useAnomalies } from "../anomaly-store";
import { money } from "./use-widget-rows";

// The anomaly agent's alert board: failed payouts, refund spikes, payouts stuck on their way,
// holds not captured and escrow that doesn't match the ledger, from the desk's own read-only
// checks. The agent adds it to a page when it finds something; operators can add it too.

const SEVERITY = {
  critical: { icon: ShieldAlert, tone: "var(--bc-bad)", label: "Critical" },
  warning: { icon: AlertTriangle, tone: "var(--bc-warn)", label: "Warning" },
  info: { icon: Info, tone: "var(--bc-chart-2)", label: "Note" },
} as const;

export function AlertsWidget({ widgetApi }: AgWidgetParams) {
  const { report, scanning } = useAnomalies();
  // No data mapping: its data is the agent's report, so it is always ready to show.
  useEffect(() => widgetApi.setDisplayState("displayed"), [widgetApi]);
  const found = report?.anomalies ?? [];
  const checked = report ? new Date(report.checkedAt).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" }) : null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 font-sans text-xs">
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
          Anomaly agent{checked && ` · checked ${checked}`}
        </p>
        <button
          type="button"
          onClick={() => void anomalyStore.rescan()}
          disabled={scanning}
          className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium hover:bg-accent disabled:opacity-60"
        >
          <RefreshCw className={`size-3 ${scanning ? "animate-spin" : ""}`} /> {scanning ? "Checking" : "Rescan"}
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
        {found.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-1.5 text-center text-muted-foreground">
            <CheckCircle2 className="size-6" style={{ color: "var(--bc-ok)" }} />
            <p className="font-medium text-foreground">All clear</p>
            <p className="max-w-64">No failed or stuck payouts this week, refunds at their usual rate, and escrow matches the ledger on every rail checked.</p>
          </div>
        ) : (
          found.map((a) => {
            const s = SEVERITY[a.severity];
            return (
              <div key={a.id} className="relative flex gap-2.5 overflow-hidden rounded-lg border bg-background/60 p-2.5 pl-3.5">
                <span className="absolute inset-y-0 left-0 w-1" style={{ background: s.tone }} />
                <s.icon className="mt-0.5 size-4 shrink-0" style={{ color: s.tone }} aria-label={s.label} />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="font-semibold text-foreground">{a.title}</p>
                    <p className="shrink-0 font-mono font-medium tabular-nums">{money(a.amount / 100)}</p>
                  </div>
                  <p className="text-muted-foreground">{a.detail}</p>
                  {a.taskIds.length > 0 && (
                    <p className="flex flex-wrap gap-1 pt-0.5">
                      {a.taskIds.slice(0, 4).map((id) => (
                        <a key={id} href={`/admin/tasks/${id}`} className="rounded bg-muted px-1.5 py-px font-mono text-[10px] hover:bg-accent hover:text-foreground">
                          {id.slice(0, 8)}
                        </a>
                      ))}
                      {a.taskIds.length > 4 && <span className="text-[10px] text-muted-foreground">+{a.taskIds.length - 4} more</span>}
                    </p>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
      {report && (
        <p className="flex flex-wrap gap-x-3 gap-y-0.5 border-t pt-1.5 text-[11px] text-muted-foreground">
          <span className="font-medium">Escrow vs ledger:</span>
          {report.reconciliation.length === 0 && <span>no rail configured here</span>}
          {report.reconciliation.map((r) => (
            <span key={r.rail} title={r.error}>
              {r.rail}{" "}
              {r.error ? "not checked" : r.gap === 0 ? <span style={{ color: "var(--bc-ok)" }}>matches</span> : <span style={{ color: "var(--bc-bad)" }}>off by {money(Math.abs(r.gap ?? 0) / 100)}</span>}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
