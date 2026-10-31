import { BadgeCheck, Bot } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { Eyebrow } from "@/components/brand";
import { TaskCard } from "@/components/task-card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { attributeLabel, usd, workerHandle } from "@/lib/format";
import { getDesk } from "@/server/desk";
import { workerFromSession } from "@/server/session";

const ACTIVE = new Set(["claimed", "submitted", "passed", "failed", "disputed"]);

/** Who the desk knows you as: a pseudonym and what you proved, nothing more. */
async function Identity() {
  const worker = await workerFromSession();
  if (!worker) redirect("/signin");
  const profile = await getDesk().getWorker(worker);
  if (!profile) redirect("/signin");
  const since = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "Asia/Manila" }).format(profile.createdAt);
  return (
    <section className="flex flex-col gap-4 rounded-2xl border bg-card p-6">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary-soft-foreground">
          <BadgeCheck className="size-5" />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <p className="font-semibold">{profile.testMode ? "Tester" : "Verified with Concordium ID"}</p>
          <p className="text-sm text-muted-foreground">
            <span className="font-mono">{workerHandle(profile.pseudonym)}</span> · worker since {since}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {Object.entries(profile.provenAttributes).map(([attribute, value]) => (
          <Badge key={attribute} variant="outline">
            {attributeLabel({ attribute, value })}
          </Badge>
        ))}
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-xs font-medium text-muted-foreground">Your worker ID</p>
        <code className="break-all rounded-lg bg-muted px-3 py-2 font-mono text-xs">{profile.pseudonym}</code>
        <p className="text-xs text-muted-foreground">
          {profile.testMode
            ? "Test workers see and do only test tasks."
            : "A one-way code made from your ID document. It's the same every time you sign in, and it can't be turned back into who you are."}
        </p>
      </div>
    </section>
  );
}

/** What this worker has earned: paid, settling, and passes still inside their objection window. */
async function Earnings() {
  const worker = await workerFromSession();
  if (!worker) return null;
  const earnings = await getDesk().getWorkerEarnings(worker);
  const rows = [
    { label: "Earnings", money: earnings.real, note: "Paid to your Concordium account." },
    { label: "Test money", money: earnings.test, note: "From test tasks. Not real money." },
  ].filter((r, i) => i === 0 || r.money.paid + r.money.settling + r.money.upcoming > 0);
  return (
    <section className="grid gap-3 sm:grid-cols-2">
      {rows.map(({ label, money, note }) => (
        <div key={label} className="flex flex-col gap-3 rounded-2xl border bg-card p-5">
          <p className="text-sm font-semibold text-muted-foreground">{label}</p>
          <p className="text-3xl font-semibold tabular-nums">{usd(money.paid)}</p>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <dt className="text-muted-foreground">On its way</dt>
              <dd className="font-medium tabular-nums">{usd(money.settling)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Passed, pending</dt>
              <dd className="font-medium tabular-nums">{usd(money.upcoming)}</dd>
            </div>
          </dl>
          <p className="text-xs text-muted-foreground">
            {note} A pass is paid 48 hours after the verdict, or sooner if the requester accepts it.
          </p>
        </div>
      ))}
    </section>
  );
}

/** The agents this person owns, if any: linking happens at /link when an agent asks. */
async function MyAgents() {
  const worker = await workerFromSession();
  if (!worker || worker.role !== "worker") return null;
  const agents = await getDesk()
    .listOwnerAgents(worker.workerId)
    .catch(() => []); // testers can't own agents
  if (agents.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-muted-foreground">Your agents · {agents.length}</h2>
      {agents.map((agent) => (
        <div key={agent.id} className="flex items-center gap-3 rounded-2xl border bg-card p-4">
          <Bot className="size-5 shrink-0 text-primary" />
          <p className="min-w-0 flex-1 truncate font-medium">{agent.name}</p>
          {agent.badgeVerifiedAt && <Badge>Verified by Concordium</Badge>}
          {agent.testMode && <Badge variant="outline">Test mode</Badge>}
        </div>
      ))}
    </section>
  );
}

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
        <h1 className="text-3xl font-semibold tracking-tight">My account</h1>
      </div>
      <Suspense fallback={<div className="h-44 animate-pulse rounded-2xl bg-muted" />}>
        <Identity />
      </Suspense>
      <Suspense fallback={<div className="h-36 animate-pulse rounded-2xl bg-muted" />}>
        <Earnings />
      </Suspense>
      <Suspense>
        <MyAgents />
      </Suspense>
      <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-muted" />}>
        <MyTasks />
      </Suspense>
    </main>
  );
}
