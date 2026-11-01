import Link from "next/link";
import { Suspense } from "react";

import { BarChart, duration, Stat } from "@/components/admin/parts";
import { usd } from "@/lib/format";
import { requireAdmin } from "@/server/admin";
import { getDesk } from "@/server/desk";

async function Charts({ searchParams }: { searchParams: Promise<{ test?: string }> }) {
  await requireAdmin();
  const includeTest = (await searchParams).test === "1";
  const a = await getDesk().adminAnalytics({ days: 30, includeTest });
  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        Last 30 days, by day in Manila time, {includeTest ? "live and test" : "live only"}.{" "}
        <Link href={includeTest ? "/admin/analytics" : "/admin/analytics?test=1"} className="underline">
          {includeTest ? "Live only" : "Include test tasks"}
        </Link>
      </p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Pass rate" value={a.passRate === null ? "—" : `${Math.round(a.passRate * 100)}%`} note={`${a.verdicts} standing verdicts`} />
        <Stat label="Median time to claim" value={duration(a.medianMsToClaim)} note={`from funding · ${a.claims} claims`} />
        <Stat label="Median time to pay" value={duration(a.medianMsToPay)} note={`from submission · ${a.payouts} payouts`} />
        <Stat label="Funded" value={usd(a.days.reduce((s, d) => s + d.funded, 0))} note="into escrow" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <BarChart title="Tasks posted" data={a.days.map((d) => ({ day: d.day, value: d.posted }))} />
        <BarChart title="Funded into escrow" money data={a.days.map((d) => ({ day: d.day, value: d.funded }))} />
        <BarChart title="Paid to workers" money data={a.days.map((d) => ({ day: d.day, value: d.paid }))} />
        <BarChart title="Passes" data={a.days.map((d) => ({ day: d.day, value: d.passes }))} />
        <BarChart title="Fails" data={a.days.map((d) => ({ day: d.day, value: d.fails }))} />
      </div>
    </div>
  );
}

export default function AdminAnalyticsPage({ searchParams }: PageProps<"/admin/analytics">) {
  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Analytics</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <Charts searchParams={searchParams as Promise<{ test?: string }>} />
      </Suspense>
    </main>
  );
}
