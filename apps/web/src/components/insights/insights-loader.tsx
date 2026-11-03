"use client";

import dynamic from "next/dynamic";

import type { MyInsightsProps } from "./my-insights";

// AG Studio loads only here, in the browser, for people who open their report.
const MyInsights = dynamic(() => import("./my-insights"), {
  ssr: false,
  loading: () => <InsightsSkeleton />,
});

export function InsightsSkeleton() {
  return (
    <div className="flex h-[calc(100dvh-12rem)] min-h-[640px] flex-col gap-3 rounded-2xl border bg-background p-4" aria-busy="true">
      <div className="grid grid-cols-3 gap-3 md:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
      <div className="flex-1 animate-pulse rounded-xl bg-muted" />
      <p className="text-center text-xs text-muted-foreground">Loading your report…</p>
    </div>
  );
}

export function InsightsLoader(props: MyInsightsProps) {
  return <MyInsights {...props} />;
}
