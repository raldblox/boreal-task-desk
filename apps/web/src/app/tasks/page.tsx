import { Inbox } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { Eyebrow } from "@/components/brand";
import { TaskCard } from "@/components/task-card";
import { buttonVariants } from "@/components/ui/button";
import { canBePaidOn } from "@/lib/rails";
import { getDesk } from "@/server/desk";
import { workerFromSession } from "@/server/session";

function EmptyState({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed bg-card/60 px-6 py-14 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-primary-soft text-primary-soft-foreground">
        <Inbox className="size-6" />
      </span>
      <p className="font-semibold">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{body}</p>
      {action}
    </div>
  );
}

async function OpenTasks({ searchParams }: { searchParams: Promise<{ payable?: string }> }) {
  const payable = (await searchParams).payable === "1";
  const worker = await workerFromSession();
  if (!worker) {
    return (
      <EmptyState
        title="Sign in to see tasks"
        body="Log in with PayPal to see tasks near you. A few tasks also ask you to prove your age or country with Concordium ID."
        action={
          <Link href="/signin?next=/tasks" className={buttonVariants({ className: "mt-2" })}>
            Sign in
          </Link>
        }
      />
    );
  }
  const [all, profile] = await Promise.all([getDesk().browseOpenTasks(worker), getDesk().getWorker(worker)]);
  // Off by default: tasks on a rail the worker isn't set up for show too, with a guided setup.
  const tasks = payable ? all.filter((t) => t.test || canBePaidOn(profile, t.paymentRail)) : all;
  const filter = (
    <Link
      href={payable ? "/tasks" : "/tasks?payable=1"}
      className={buttonVariants({ variant: payable ? "default" : "outline", size: "sm", className: "w-fit" })}
      aria-pressed={payable}
    >
      Only tasks I can get paid for
    </Link>
  );
  if (tasks.length === 0) {
    return <div className="flex flex-col gap-3">{all.length > 0 && filter}<EmptyState
        title={payable && all.length > 0 ? "No tasks you can get paid for yet" : "No open tasks right now"}
        body="New tasks appear as agents and people post them. Check back soon; tasks you've claimed are on My account."
        action={
          <Link href="/me" className={buttonVariants({ variant: "outline", className: "mt-2" })}>
            My account
          </Link>
        }
      /></div>;
  }
  return (
    <div className="flex flex-col gap-3">
      {filter}
      <p className="text-sm text-muted-foreground">
        {tasks.length} open {tasks.length === 1 ? "task" : "tasks"} for you
      </p>
      {tasks.map((task) => (
        <TaskCard key={task.id} task={task} />
      ))}
    </div>
  );
}

export default function TasksPage({ searchParams }: PageProps<"/tasks">) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-10 md:py-14">
      <div className="flex flex-col gap-3">
        <Eyebrow>Open tasks</Eyebrow>
        <h1 className="text-3xl font-semibold tracking-tight">Find a task</h1>
        <p className="text-muted-foreground">
          Every task is funded before it appears here. You&apos;re paid when your result passes review.
        </p>
      </div>
      <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-muted" />}>
        <OpenTasks searchParams={searchParams as Promise<{ payable?: string }>} />
      </Suspense>
    </main>
  );
}
