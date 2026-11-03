"use client";

import "./console.css";

import { type AgReportState, type AgStudioApi, type AgStudioMode, AgStudioAiModule, enableStudioDevValidations } from "ag-studio";
import { AgStudio, AgStudioProvider } from "ag-studio-react";
import { cn } from "cn";
import { Bot, LayoutDashboard, PencilRuler, RotateCcw, ScanSearch } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

import { borealAi } from "./agents";
import { ANOMALY_PAGE, buildAnomalyPage } from "./anomaly-page";
import { anomalyStore, useAnomalies } from "./anomaly-store";
import type { AnomalyReport, ConsoleRows } from "./console-data";
import { consoleReport, PAGES } from "./report";
import { studioData } from "./studio-data";
import { borealStudioTheme } from "./theme";
import { borealWidgets, registerTaskRefs } from "./widgets";
import { refreshSignal } from "./widgets/refresh-signal";

if (process.env.NODE_ENV !== "production") enableStudioDevValidations();

// The money console: one AG Studio report over boreal's live money, in boreal's brand, with
// boreal's widgets and agents. The shell around it owns page tabs, view/edit, the anomaly scan
// and the saved layout (this browser only); Studio owns the report itself.

export interface MoneyConsoleProps {
  rows: ConsoleRows;
  anomalies: AnomalyReport;
  licenseKey?: string;
  aiEnabled: boolean;
  /** Labels the data as generated (`pnpm dev:demo`). */
  demo: boolean;
  network: string;
}

// Bump when the built-in report changes, so browsers drop a layout saved from the old one.
const SAVED = "boreal-console-report-v4";
const NAMES: Record<string, string> = { ...Object.fromEntries(PAGES), [ANOMALY_PAGE]: "Anomalies" };

/** The filters panel stays folded away: page filters live on the canvas as filter widgets. */
const withPanels = (state: AgReportState): AgReportState => ({
  ...state,
  panels: { ...state.panels, filters: { ...state.panels?.filters, collapsed: true } },
});

function savedReport(): AgReportState {
  try {
    const raw = localStorage.getItem(SAVED);
    if (raw) return withPanels(JSON.parse(raw) as AgReportState);
  } catch {
    // No storage here (private window, blocked site data): start from the built-in report.
  }
  return withPanels(consoleReport);
}

export default function MoneyConsole({ rows, anomalies, licenseKey, aiEnabled, demo, network }: MoneyConsoleProps) {
  const apiRef = useRef<AgStudioApi | null>(null);
  const [initialState] = useState(savedReport);
  const [state, setState] = useState<AgReportState>(initialState);
  const [mode, setMode] = useState<AgStudioMode>("view");
  const { report, scanning } = useAnomalies();

  useEffect(() => {
    anomalyStore.set(anomalies);
    registerTaskRefs(rows.tasks);
  }, [anomalies, rows]);

  const data = useMemo(() => studioData(rows), [rows]);
  const ai = useMemo(() => borealAi({ enabled: aiEnabled }), [aiEnabled]);

  const select = (pageId: string) => {
    const api = apiRef.current;
    if (api) api.setState({ ...api.getState(), selectedPageId: pageId });
  };
  const scan = async () => {
    const found = await anomalyStore.rescan();
    if (found && apiRef.current) buildAnomalyPage(apiRef.current, found.anomalies);
  };
  const reset = () => {
    try {
      localStorage.removeItem(SAVED);
    } catch {
      // Nothing saved to clear.
    }
    apiRef.current?.setState(withPanels(consoleReport));
    apiRef.current?.clearHistory();
  };

  const critical = report?.anomalies.filter((a) => a.severity === "critical").length ?? 0;
  const asOf = new Date(rows.asOf).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" });

  return (
    <div className="boreal-console flex h-[calc(100dvh-7.5rem)] min-h-[720px] flex-col overflow-hidden rounded-2xl border bg-background">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b bg-card px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground">
            <LayoutDashboard className="size-5" />
          </span>
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-lg leading-tight font-semibold tracking-tight">
              Money console
              {demo ? (
                <span className="rounded-full bg-[var(--bc-warn)]/15 px-2 py-0.5 font-mono text-[10px] font-medium tracking-wider text-[var(--bc-warn)] uppercase">
                  Demo dataset · generated locally
                </span>
              ) : (
                <span className="rounded-full bg-primary-soft px-2 py-0.5 font-mono text-[10px] font-medium tracking-wider text-primary-soft-foreground uppercase">{network}</span>
              )}
            </h1>
            <p className="truncate text-xs text-muted-foreground">
              Escrow, payouts and revenue across PayPal, Concordium and NEAR · live money only · as of {asOf} Manila
            </p>
          </div>
        </div>

        <nav className="flex items-center gap-1 rounded-lg bg-muted p-1" aria-label="Console pages">
          {state.pages.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onClick={() => select(p.id)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
                p.id === state.selectedPageId && "bg-card text-foreground shadow-sm",
              )}
            >
              {NAMES[p.id] ?? `Page ${i + 1}`}
              {p.id === ANOMALY_PAGE && critical > 0 && <span className="size-1.5 rounded-full bg-[var(--bc-bad)]" />}
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <span
            className={cn(
              "hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs xl:flex",
              aiEnabled ? "text-foreground" : "text-muted-foreground",
            )}
            title={aiEnabled ? "boreal ops and the anomaly agent run on Claude Sonnet 5.5 with AG Studio's built-in agents" : "Set ANTHROPIC_API_KEY on the server to turn the agents on"}
          >
            <Bot className="size-3.5" />
            {aiEnabled ? "Ops agent on · Claude" : "Ops agent off"}
          </span>
          <Button variant="outline" size="sm" onClick={() => void scan()} disabled={scanning}>
            <ScanSearch className={cn(scanning && "animate-pulse")} />
            {scanning ? "Scanning…" : "Scan for anomalies"}
            {critical > 0 && <span className="rounded-full bg-[var(--bc-bad)] px-1.5 text-[10px] leading-4 font-semibold text-white">{critical}</span>}
          </Button>
          <Button
            variant={mode === "edit" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode(mode === "edit" ? "view" : "edit")}
            title="Rearrange widgets, add boreal's and Studio's widgets, and ask the ops agent"
          >
            <PencilRuler />
            {mode === "edit" ? "Done editing" : "Edit · Ask AI"}
          </Button>
          <Button variant="ghost" size="sm" onClick={reset} title="Back to the built-in report">
            <RotateCcw />
            <span className="sr-only">Reset layout</span>
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1">
        <AgStudioProvider licenseKey={licenseKey} modules={[AgStudioAiModule]}>
          <AgStudio
            style={{ height: "100%", width: "100%" }}
            theme={borealStudioTheme}
            layout={{ widgetBorderEnabled: true }}
            data={data}
            widgets={borealWidgets}
            ai={ai}
            initialState={initialState}
            mode={mode}
            onApiReady={(event) => {
              apiRef.current = event.api;
            }}
            onStateUpdated={(event) => {
              setState(event.state);
              refreshSignal.bump();
              try {
                localStorage.setItem(SAVED, JSON.stringify(event.state));
              } catch {
                // The layout just isn't remembered in this browser.
              }
            }}
          />
        </AgStudioProvider>
      </div>
    </div>
  );
}

