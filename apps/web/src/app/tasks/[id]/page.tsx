import { POLICY } from "@boreal/core";
import { type Caller, DeskError } from "@boreal/desk";
import type { Task } from "@boreal/db";
import { ArrowLeft, CircleCheck, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { claimTask, disputeVerdict, releaseTask, submitResult } from "@/app/actions";
import { TaskProgress } from "@/components/task-progress";
import { ActionButton, DisputeForm, SubmitForm } from "@/components/worker-forms";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { attributeLabel, usd, when, WORKER_STATUS } from "@/lib/format";
import { getDesk } from "@/server/desk";
import { workerFromSession } from "@/server/session";

/** What the worker can do next, for each state. */
function NextStep({
  task,
  worker,
  needsBadge,
}: {
  task: Task;
  worker: Extract<Caller, { role: "worker" }>;
  /** The task needs proven attributes and this worker hasn't added Concordium ID yet. */
  needsBadge: boolean;
}) {
  const mine = task.claimedBy === worker.workerId;
  const windowEnds = task.verdictAt ? new Date(task.verdictAt.getTime() + POLICY.objectionWindowMs) : null;

  switch (task.status) {
    case "open":
      if (needsBadge) {
        return (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              This task needs the Verified by Concordium badge: add Concordium ID on My account to prove what it asks for ({task.requiredAttributes.map(attributeLabel).join(", ")}), then claim it.
            </p>
            <Link href="/me" className={buttonVariants({ className: "w-full" })}>
              Add Concordium ID
            </Link>
          </div>
        );
      }
      return (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Claiming reserves the task for you for up to {POLICY.claimDurationMs / 3_600_000} hours.
          </p>
          <ActionButton action={claimTask.bind(null, task.id)}>Claim this task</ActionButton>
        </div>
      );
    case "claimed":
      if (!mine) return null;
      return (
        <div className="flex flex-col gap-6">
          {task.claimExpiresAt && (
            <p className="text-sm text-muted-foreground">Submit by {when(task.claimExpiresAt)} or the task reopens.</p>
          )}
          <SubmitForm action={submitResult.bind(null, task.id)} resultFormat={task.resultFormat} />
          <Separator />
          <ActionButton action={releaseTask.bind(null, task.id)} variant="outline">
            Release task
          </ActionButton>
        </div>
      );
    case "submitted":
      return <p className="text-muted-foreground">Submitted. A reviewer is checking it against the criteria.</p>;
    case "passed":
      return (
        <p className="text-muted-foreground">
          Passed. You&apos;re paid {usd(task.budget)} when the objection window closes
          {windowEnds ? ` on ${when(windowEnds)}` : ""}, or sooner if the requester accepts early.
        </p>
      );
    case "failed":
      if (task.disputeUsed || !windowEnds || windowEnds <= new Date()) {
        return <p className="text-muted-foreground">This verdict can no longer be disputed.</p>;
      }
      return (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            You can dispute once, until {when(windowEnds)}. A panel with a human reviewer decides, and its decision is
            final.
          </p>
          <DisputeForm action={disputeVerdict.bind(null, task.id)} />
        </div>
      );
    case "disputed":
      return <p className="text-muted-foreground">Disputed. The review panel is deciding.</p>;
    case "final_pass":
      return (
        <p className="font-medium">
          {task.test ? `Paid ${usd(task.budget)} in test money.` : `Paid ${usd(task.budget)} to your account.`}
        </p>
      );
    case "final_fail":
      return <p className="text-muted-foreground">Not paid. The verdict stands.</p>;
    default:
      return null;
  }
}

async function TaskDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const worker = await workerFromSession();
  if (!worker || worker.role !== "worker") {
    return (
      <div className="flex flex-col items-start gap-4">
        <p className="text-muted-foreground">Sign in to see this task.</p>
        <Link href="/signin" className={buttonVariants()}>
          Sign in
        </Link>
      </div>
    );
  }

  const desk = getDesk();
  let task: Task;
  try {
    task = await desk.getTask(worker, id);
  } catch (error) {
    if (error instanceof DeskError && error.code === "not_found") notFound();
    throw error;
  }
  const [submission, verdict, profile] = await Promise.all([
    desk.getSubmission(worker, id),
    desk.getVerdict(worker, id),
    desk.getWorker(worker),
  ]);
  const needsBadge = task.requiredAttributes.length > 0 && !!profile && !profile.testMode && !profile.hasConcordium;
  const status = WORKER_STATUS[task.status];

  const verdictTitle =
    verdict?.by === "panel" ? "Panel decision" : task.reviewMode === "requester" ? "Requester verdict" : "Reviewer verdict";

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
      <aside className="flex flex-col gap-5 rounded-2xl border bg-card p-5 lg:sticky lg:top-20 lg:order-2">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-3xl font-semibold tabular-nums text-primary">{usd(task.budget)}</p>
          <Badge variant={status.tone}>{status.label}</Badge>
        </div>
        <TaskProgress status={task.status} />
        <div className="border-t pt-5">
          <NextStep task={task} worker={worker} needsBadge={needsBadge} />
        </div>
      </aside>

      <div className="flex flex-col gap-6 lg:order-1">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {task.test && <Badge className="bg-primary-soft text-primary-soft-foreground">Test task · test money only</Badge>}
            {task.reviewMode === "requester" && <Badge variant="outline">Reviewed by the requester</Badge>}
            {task.requiredAttributes.length > 0 && (
              <Badge variant="outline" className="gap-1">
                <ShieldCheck className="size-3.5 text-primary" /> Needs Verified by Concordium
              </Badge>
            )}
            {task.requiredAttributes.map((a) => (
              <Badge key={a.attribute} variant="outline">
                {attributeLabel(a)}
              </Badge>
            ))}
          </div>
          <h1 className="text-2xl font-semibold leading-snug tracking-tight text-balance">{task.description}</h1>
          <p className="text-sm text-muted-foreground">Due {when(task.deadline)}</p>
        </div>

        <section className="flex flex-col gap-3 rounded-2xl border bg-card p-5">
          <div>
            <h2 className="font-semibold">What counts as done</h2>
            <p className="text-sm text-muted-foreground">The reviewer checks your result against these, and only these.</p>
          </div>
          <ul className="flex flex-col gap-2">
            {task.acceptanceCriteria.map((c) => (
              <li key={c} className="flex gap-2.5">
                <CircleCheck className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </section>

        {verdict && (
          <section
            className={`flex flex-col gap-2 rounded-2xl border p-5 ${verdict.outcome === "pass" ? "border-primary/30 bg-primary-soft/40" : "border-destructive/30 bg-destructive/5"}`}
          >
            <h2 className="font-semibold">
              {verdictTitle}: {verdict.outcome === "pass" ? "passed" : "failed"}
            </h2>
            <p>{verdict.reasoning}</p>
            <p className="font-mono text-xs text-muted-foreground">
              {verdict.ruleIds.length ? verdict.ruleIds.join(" · ") : "No rules cited"} · {when(verdict.at)}
            </p>
          </section>
        )}

        {submission && (
          <section className="flex flex-col gap-3 rounded-2xl border bg-card p-5">
            <div>
              <h2 className="font-semibold">Your submission</h2>
              <p className="text-sm text-muted-foreground">{when(submission.createdAt)}</p>
            </div>
            {submission.fileUrls.map((path) =>
              path.endsWith(".pdf") ? (
                <a key={path} href={`/api/files/${path}`} className="text-primary underline underline-offset-4">
                  View file
                </a>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- private files are served by our own route
                <img key={path} src={`/api/files/${path}`} alt="Your submitted photo" className="max-h-[28rem] w-full rounded-xl border object-contain" />
              ),
            )}
            {submission.text && <p className="whitespace-pre-wrap">{submission.text}</p>}
          </section>
        )}
      </div>
    </div>
  );
}

export default function TaskPage({ params }: PageProps<"/tasks/[id]">) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 md:py-12">
      <Link href="/tasks" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Open tasks
      </Link>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-muted" />}>
        <TaskDetail params={params} />
      </Suspense>
    </main>
  );
}
