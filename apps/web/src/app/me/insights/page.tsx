import { INSIGHTS_MIN_TASKS } from "@boreal/desk";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { Eyebrow } from "@/components/brand";
import { earningsRows, spendingRows } from "@/components/insights/insights-data";
import { InsightsLoader, InsightsSkeleton } from "@/components/insights/insights-loader";
import { getDesk } from "@/server/desk";
import { workerFromSession } from "@/server/session";

// A person's own money report: spending for people who post tasks or own agents, earnings for
// workers. My account links here only once there is enough to show; nothing here is anyone else's.

async function Report({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const caller = await workerFromSession();
  if (caller?.role !== "worker") redirect("/signin?next=/me/insights");
  const desk = getDesk();
  const { view } = await searchParams;
  const available = await desk.insightsAvailable(caller);
  if (!available.spending && !available.earnings) {
    return (
      <div className="flex flex-col gap-2 rounded-2xl border border-dashed bg-card p-8 text-center">
        <p className="font-semibold">Your report fills in as you go</p>
        <p className="text-sm text-muted-foreground">
          Once {INSIGHTS_MIN_TASKS} of your tasks are funded, or you&apos;ve been paid for {INSIGHTS_MIN_TASKS} tasks, you&apos;ll see where your money is here.
        </p>
        <Link href="/me" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
          Back to My account
        </Link>
      </div>
    );
  }
  const [spending, earnings] = await Promise.all([
    available.spending ? desk.mySpending(caller).then(spendingRows) : null,
    available.earnings ? desk.myEarnings(caller).then(earningsRows) : null,
  ]);
  return (
    <InsightsLoader
      rows={{ asOf: new Date().toISOString(), spending, earnings }}
      start={view === "earnings" ? "earnings" : "spending"}
      licenseKey={process.env.AG_STUDIO_LICENSE_KEY || process.env.NEXT_PUBLIC_AG_GRID_LICENSE_KEY || undefined}
    />
  );
}

export default function InsightsPage({ searchParams }: PageProps<"/me/insights">) {
  return (
    <main className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-6 px-4 py-8">
      <div className="flex flex-col gap-2">
        <Eyebrow>Your money</Eyebrow>
        <h1 className="text-3xl font-semibold tracking-tight">Insights</h1>
        <p className="text-sm text-muted-foreground">Only your own tasks and money. Live money only; test tasks are left out.</p>
      </div>
      <Suspense fallback={<InsightsSkeleton />}>
        <Report searchParams={searchParams as Promise<{ view?: string }>} />
      </Suspense>
    </main>
  );
}
