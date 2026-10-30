import { redirect } from "next/navigation";
import { Suspense } from "react";

import { TaskCard } from "@/components/task-card";
import { getDesk } from "@/server/desk";
import { workerFromSession } from "@/server/session";

async function MyTasks() {
  const worker = await workerFromSession();
  if (!worker) redirect("/signin");
  const tasks = await getDesk().listWorkerTasks(worker);
  if (tasks.length === 0) {
    return <p className="text-muted-foreground">You haven&apos;t claimed any tasks yet.</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      {tasks.map((task) => (
        <TaskCard key={task.id} task={task} showStatus />
      ))}
    </div>
  );
}

export default function MyTasksPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">My tasks</h1>
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <MyTasks />
      </Suspense>
    </main>
  );
}
