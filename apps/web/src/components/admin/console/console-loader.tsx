"use client";

import dynamic from "next/dynamic";

import type { MoneyConsoleProps } from "./money-console";

// AG Studio is large and browser-only, so it loads here, on the console page alone, after the
// page has rendered.
const MoneyConsole = dynamic(() => import("./money-console"), {
  ssr: false,
  loading: () => <ConsoleSkeleton />,
});

export function ConsoleSkeleton() {
  return (
    <div className="flex h-[calc(100dvh-7.5rem)] min-h-[720px] flex-col gap-3 rounded-2xl border bg-background p-4" aria-busy="true">
      <div className="h-10 w-2/5 animate-pulse rounded-lg bg-muted" />
      <div className="grid grid-cols-6 gap-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
      <div className="grid flex-1 grid-cols-[3fr_2fr] gap-3">
        <div className="animate-pulse rounded-xl bg-muted" />
        <div className="animate-pulse rounded-xl bg-muted" />
      </div>
      <p className="text-center text-xs text-muted-foreground">Loading the money console…</p>
    </div>
  );
}

export function ConsoleLoader(props: MoneyConsoleProps) {
  return <MoneyConsole {...props} />;
}
