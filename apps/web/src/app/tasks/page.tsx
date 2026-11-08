import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Container, Cta, EmptyState, PageHero } from "@/components/page";
import { TaskCard } from "@/components/task-card";
import { canBePaidOn } from "@/lib/rails";
import { getDesk } from "@/server/desk";
import { workerFromSession } from "@/server/session";

export const metadata: Metadata = {
  title: "Find tasks",
  description: "Paid real-world tasks near you: photos, checks and visits. Funded before they appear, paid with PayPal when they pass.",
  alternates: { canonical: "/tasks" },
};


async function OpenTasks({ searchParams }: { searchParams: Promise<{ payable?: string }> }) {
  const payable = (await searchParams).payable === "1";
  const worker = await workerFromSession();
  if (!worker) {
    return (
      <EmptyState title="Sign in to see tasks" action={<Cta href="/signin?next=/tasks">Log in with PayPal</Cta>}>
        Log in with PayPal to see tasks near you, and get paid there when your work passes.
      </EmptyState>
    );
  }
  const [all, profile] = await Promise.all([getDesk().browseOpenTasks(worker), getDesk().getWorker(worker)]);
  // Off by default: tasks on a rail the worker isn't set up for show too, with a guided setup.
  const tasks = payable ? all.filter((t) => t.test || canBePaidOn(profile, t.paymentRail)) : all;
  // A filter, so a segmented toggle: two options, the current one marked.
  const filter = (
    <div role="group" aria-label="Which tasks" className="inline-flex w-fit rounded-lg border bg-card p-1 text-sm">
      {[
        { href: "/tasks", label: "All open tasks", on: !payable },
        { href: "/tasks?payable=1", label: "Only tasks I can get paid for", on: payable },
      ].map((option) => (
        <Link
          key={option.href}
          href={option.href}
          aria-current={option.on ? "true" : undefined}
          className={`rounded-md px-3.5 py-2 transition-colors ${option.on ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
        >
          {option.label}
        </Link>
      ))}
    </div>
  );
  if (tasks.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        {all.length > 0 && filter}
        <EmptyState
          title={payable && all.length > 0 ? "No tasks you can get paid for yet" : "No open tasks right now"}
          action={<Cta href="/me?tab=work" variant="outline">Your claimed tasks</Cta>}
        >
          New tasks appear as agents and people post them. Check back soon.
        </EmptyState>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        {filter}
        <p className="text-sm text-muted-foreground">
          {tasks.length} open {tasks.length === 1 ? "task" : "tasks"} for you
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} />
        ))}
      </div>
    </div>
  );
}

export default function TasksPage({ searchParams }: PageProps<"/tasks">) {
  return (
    <main className="flex-1">
      <PageHero
        kicker="Open tasks"
        title={<>Find a task</>}
        lede={
          <>
            Every task is funded before it appears here. You&apos;re paid when your result passes review.
          </>
        }
      />
      <Container className="flex flex-col gap-8 py-10 md:py-14">
      <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-muted" />}>
        <OpenTasks searchParams={searchParams as Promise<{ payable?: string }>} />
      </Suspense>
      </Container>
    </main>
  );
}
