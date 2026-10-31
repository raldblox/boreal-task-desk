import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { Eyebrow } from "@/components/brand";
import { TaskCard } from "@/components/task-card";
import { buttonVariants } from "@/components/ui/button";
import { getDesk } from "@/server/desk";
import { workerFromSession } from "@/server/session";

const ACTIVE = new Set(["claimed", "submitted", "passed", "failed", "disputed"]);

async function MyTasks() {
  const worker = await workerFromSession();
  if (!worker) redirect("/signin");
  const tasks = await getDesk().listWorkerTasks(worker);
  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed bg-card/60 p-8">
        <p className="font-semibold">You haven&apos;t claimed a task yet</p>
        <p className="text-sm text-muted-foreground">Claimed tasks show up here until they&apos;re paid.</p>
        <Link href="/tasks" className={buttonVariants({ className: "mt-1" })}>
          Find a task
        </Link>
      </div>
    );
  }
  const active = tasks.filter((t) => ACTIVE.has(t.status));
  const done = tasks.filter((t) => !ACTIVE.has(t.status));
  return (
    <div className="flex flex-col gap-10">
      {[
        { title: "In progress", list: active },
        { title: "Finished", list: done },
      ]
        .filter((g) => g.list.length > 0)
        .map((group) => (
          <section key={group.title} className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-muted-foreground">
              {group.title} · {group.list.length}
            </h2>
            {group.list.map((task) => (
              <TaskCard key={task.id} task={task} showStatus />
            ))}
          </section>
        ))}
    </div>
  );
}

export default function MyTasksPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-10 md:py-14">
      <div className="flex flex-col gap-3">
        <Eyebrow>Your work</Eyebrow>
        <h1 className="text-3xl font-semibold tracking-tight">My tasks</h1>
      </div>
      <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-muted" />}>
        <MyTasks />
      </Suspense>
    </main>
  );
}
