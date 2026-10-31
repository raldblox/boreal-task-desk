import { POLICY } from "@boreal/core";
import { type Caller, DeskError } from "@boreal/desk";
import type { Task } from "@boreal/db";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { claimTask, disputeVerdict, releaseTask, submitResult } from "@/app/actions";
import { ActionButton, DisputeForm, SubmitForm } from "@/components/worker-forms";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { attributeLabel, usd, when, WORKER_STATUS } from "@/lib/format";
import { getDesk } from "@/server/desk";
import { workerFromSession } from "@/server/session";

/** What the worker can do next, for each state. */
function NextStep({ task, worker }: { task: Task; worker: Extract<Caller, { role: "worker" }> }) {
  const mine = task.claimedBy === worker.workerId;
  const windowEnds = task.verdictAt ? new Date(task.verdictAt.getTime() + POLICY.objectionWindowMs) : null;

  switch (task.status) {
    case "open":
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
  const [submission, verdict] = await Promise.all([desk.getSubmission(worker, id), desk.getVerdict(worker, id)]);
  const status = WORKER_STATUS[task.status];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={status.tone}>{status.label}</Badge>
          {task.test && <Badge variant="secondary">Test task: test money only</Badge>}
          {task.reviewMode === "requester" && <Badge variant="outline">Reviewed by the requester</Badge>}
          {task.requiredAttributes.map((a) => (
            <Badge key={a.attribute} variant="outline">
              {attributeLabel(a)}
            </Badge>
          ))}
        </div>
        <h1 className="text-xl font-semibold leading-snug tracking-tight">{task.description}</h1>
        <p className="text-muted-foreground">
          Pays <span className="font-medium text-foreground">{usd(task.budget)}</span> · due {when(task.deadline)}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">What counts as done</CardTitle>
          <CardDescription>The reviewer checks your result against these, and only these.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1 pl-5">
            {task.acceptanceCriteria.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {verdict && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {verdict.by === "panel" ? "Panel decision" : task.reviewMode === "requester" ? "Requester verdict" : "Reviewer verdict"}:{" "}
              {verdict.outcome}
            </CardTitle>
            <CardDescription>
              Rules cited: {verdict.ruleIds.length ? verdict.ruleIds.join(", ") : "none"} · {when(verdict.at)}
            </CardDescription>
          </CardHeader>
          <CardContent>{verdict.reasoning}</CardContent>
        </Card>
      )}

      {submission && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your submission</CardTitle>
            <CardDescription>{when(submission.createdAt)}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {submission.fileUrls.map((path) =>
              path.endsWith(".pdf") ? (
                <a key={path} href={`/api/files/${path}`} className="underline">
                  View file
                </a>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- private files are served by our own route
                <img key={path} src={`/api/files/${path}`} alt="Submitted photo" className="max-h-96 rounded-lg border" />
              ),
            )}
            {submission.text && <p className="whitespace-pre-wrap">{submission.text}</p>}
          </CardContent>
        </Card>
      )}

      <NextStep task={task} worker={worker} />
    </div>
  );
}

export default function TaskPage({ params }: PageProps<"/tasks/[id]">) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-10">
      <Link href="/tasks" className="text-sm text-muted-foreground hover:text-foreground">
        ← Open tasks
      </Link>
      <Suspense fallback={<p className="text-muted-foreground">Loading task…</p>}>
        <TaskDetail params={params} />
      </Suspense>
    </main>
  );
}
