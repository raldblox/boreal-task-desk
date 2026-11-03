"use client";

import "@/components/admin/console/console.css";

import type { AgReportState, AgStudioApi } from "ag-studio";
import { AgStudio, AgStudioProvider } from "ag-studio-react";
import { cn } from "cn";
import { useEffect, useMemo, useRef, useState } from "react";

import { borealStudioTheme } from "@/components/admin/console/theme";
import { borealWidgets, registerTaskRefs } from "@/components/admin/console/widgets";
import { refreshSignal } from "@/components/admin/console/widgets/refresh-signal";

import type { InsightsRows } from "./insights-data";
import { insightsData, insightsReport } from "./insights-studio";

// A person's own money as an AG Studio report, read-only: what they spent on tasks and where it
// is, and what they earned. The same theme and money-flow widget as the operator console, with
// nothing to edit and no assistant: just their numbers.

export interface MyInsightsProps {
  rows: InsightsRows;
  start: "spending" | "earnings";
  licenseKey?: string;
}

const NAMES: Record<string, string> = { spending: "Spending", earnings: "Earnings" };

export default function MyInsights({ rows, start, licenseKey }: MyInsightsProps) {
  const apiRef = useRef<AgStudioApi | null>(null);
  const [initialState] = useState(() => insightsReport(rows, start));
  const [state, setState] = useState<AgReportState>(initialState);
  const data = useMemo(() => insightsData(rows), [rows]);

  useEffect(() => {
    // Posted on the website: the poster's own task page. Worked on: the worker's task page.
    const posted = (rows.spending?.tasks ?? []).map((t) => ({ id: t.id, ref: t.ref, to: t.ownPage ? `/me/posted/${t.id}` : null }));
    const worked = (rows.earnings ?? []).map((j) => ({ id: j.id, ref: j.ref, to: `/tasks/${j.id}` }));
    const links = new Map([...posted, ...worked].map((r) => [r.ref, r.to]));
    registerTaskRefs([...posted, ...worked], (r) => links.get(r.ref) ?? null);
  }, [rows]);

  const select = (pageId: string) => {
    const api = apiRef.current;
    if (api) api.setState({ ...api.getState(), selectedPageId: pageId });
  };

  return (
    <div className="boreal-console flex h-[calc(100dvh-12rem)] min-h-[640px] flex-col overflow-hidden rounded-2xl border bg-background">
      {state.pages.length > 1 && (
        <nav className="flex gap-1 border-b bg-card p-2" aria-label="Report pages">
          {state.pages.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => select(p.id)}
              className={cn(
                "rounded-md px-3 py-1 text-sm font-medium text-muted-foreground hover:text-foreground",
                p.id === state.selectedPageId && "bg-muted text-foreground",
              )}
            >
              {NAMES[p.id] ?? p.id}
            </button>
          ))}
        </nav>
      )}
      <div className="min-h-0 flex-1">
        <AgStudioProvider licenseKey={licenseKey}>
          <AgStudio
            style={{ height: "100%", width: "100%" }}
            theme={borealStudioTheme}
            layout={{ widgetBorderEnabled: true }}
            data={data}
            widgets={borealWidgets}
            initialState={initialState}
            mode="view"
            onApiReady={(event) => {
              apiRef.current = event.api;
            }}
            onStateUpdated={(event) => {
              setState(event.state);
              refreshSignal.bump();
            }}
          />
        </AgStudioProvider>
      </div>
    </div>
  );
}
