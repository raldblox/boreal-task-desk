import { Suspense } from "react";

import { ConsoleLoader, ConsoleSkeleton } from "@/components/admin/console/console-loader";
import { NETWORK } from "@/content/agent-guide";
import { requireAdmin } from "@/server/admin";
import { anomalyReport, consoleData } from "@/server/console";
import { consoleAiEnabled } from "@/server/console-ai";

async function Console() {
  await requireAdmin();
  const [rows, anomalies] = await Promise.all([consoleData(), anomalyReport()]);
  const demo = process.env.BOREAL_DEMO_DATA === "1";
  if (rows.tasks.length === 0) {
    return (
      <div className="flex min-h-[420px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed bg-card p-8 text-center">
        <p className="font-mono text-xs tracking-wider text-primary uppercase">Money console</p>
        <h1 className="text-xl font-semibold tracking-tight">No live money in the last 90 days yet</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          The console fills in as soon as a task is posted: funding, holds, payouts, fees and refunds, straight from the ledger. Test tasks are left out. To see it with
          data locally, run <code className="font-mono">pnpm dev:demo</code>.
        </p>
      </div>
    );
  }
  return (
    <ConsoleLoader
      rows={rows}
      anomalies={anomalies}
      licenseKey={process.env.AG_STUDIO_LICENSE_KEY || process.env.NEXT_PUBLIC_AG_GRID_LICENSE_KEY || undefined}
      aiEnabled={consoleAiEnabled()}
      demo={demo}
      network={NETWORK === "mainnet" ? "Live" : "Sandbox"}
    />
  );
}

export default function AdminConsolePage() {
  // An operator console wants the width: it breaks out of the admin area's reading column.
  return (
    <main className="w-[min(100vw-2rem,1760px)] self-center">
      <Suspense fallback={<ConsoleSkeleton />}>
        <Console />
      </Suspense>
    </main>
  );
}
