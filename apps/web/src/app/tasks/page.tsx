import Link from "next/link";
import { Suspense } from "react";

import { TaskCard } from "@/components/task-card";
import { buttonVariants } from "@/components/ui/button";
import { getDesk } from "@/server/desk";
import { workerFromSession } from "@/server/session";

async function OpenTasks() {
  const worker = await workerFromSession();
  if (!worker) {
    return (
      <div className="flex flex-col items-start gap-4 rounded-xl border p-6">
        <p className="text-muted-foreground">Sign in with Concordium ID to see the tasks you qualify for.</p>
        <Link href="/signin" className={buttonVariants()}>
          Sign in
        </Link>
      </div>
    );
  }
  const tasks = await getDesk().browseOpenTasks(worker);
  if (tasks.length === 0) {
    return <p className="text-muted-foreground">No open tasks match what you&apos;ve proven right now. Check back soon.</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      {tasks.map((task) => (
        <TaskCard key={task.id} task={task} />
      ))}
    </div>
  );
}

export default function TasksPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Open tasks</h1>
        <p className="text-muted-foreground">
          Paid when your result passes review. Every task is funded before it appears here.
        </p>
      </div>
      <Suspense fallback={<p className="text-muted-foreground">Loading tasks…</p>}>
        <OpenTasks />
      </Suspense>
    </main>
  );
}
