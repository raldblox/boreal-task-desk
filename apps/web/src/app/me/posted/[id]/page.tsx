import { RULES } from "@boreal/brain";
import { POLICY } from "@boreal/core";
import type { Task } from "@boreal/db";
import { DeskError, taskTotal } from "@boreal/desk";
import { ArrowLeft, CircleCheck } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { after } from "next/server";
import { Suspense } from "react";

import { acceptResult, cancelTask, disputeAsPoster, payTask, reviewResult } from "@/app/post/actions";
import { PrivateReviewNote } from "@/components/private-review";
import { Eyebrow } from "@/components/brand";
import { Container } from "@/components/page";
import { ReviewForm } from "@/components/poster-forms";
import { ActionButton, DisputeForm } from "@/components/worker-forms";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { attributeLabel, posterStatus, usd, when } from "@/lib/format";
import { gatedEnv } from "@/server/addons";
import { getDesk, getRails } from "@/server/desk";
import { kickMonitorSoon } from "@/server/monitor";
import { posterFromSession } from "@/server/poster";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ posted?: string; funded?: string }> };

// The rules a requester's fail can cite: the review rules a result can break.
const REVIEW_RULES = RULES.filter((r) => r.stage === "review" && r.id !== "R4.4").map(({ id, text }) => ({ id, text }));

/** Where screening happens: the AI reviewer within minutes, or boreal's team when there's no AI key. */
/** How long screening takes here: the AI screens when one is set up and not switched off. */
function screeningNote(): string {
  const ai = (process.env.ANTHROPIC_API_KEY || gatedEnv().NEAR_AI_API_KEY) && process.env.AI_SCREENING !== "off";
  return ai
    ? "boreal.work checks it against its rulebook, usually within a minute."
    : "A person on boreal.work's team checks it against the rulebook; this can take a few hours.";
}

function Cancel({ task, note }: { task: Task; note: string }) {
  return (
    <div className="flex flex-col gap-2 border-t pt-5">
      <p className="text-sm text-muted-foreground">{note}</p>
      <ActionButton action={cancelTask.bind(null, task.id)} variant="outline" size="sm">
        Cancel task
      </ActionButton>
    </div>
  );
}

/** What the poster can do next, for each state: the desk's requester commands. */
async function NextStep({ task, requester }: { task: Task; requester: { role: "requester"; agentId: string } }) {
  const desk = getDesk();
  const windowEnds = task.verdictAt ? new Date(task.verdictAt.getTime() + POLICY.objectionWindowMs) : null;
  const canDispute = !task.disputeUsed && windowEnds !== null && windowEnds > new Date();
  switch (task.status) {
    case "posted":
      return (
        <div className="flex flex-col gap-5">
          <p className="text-sm text-muted-foreground">
            Paid and being screened. {screeningNote()} If it&apos;s refused, your payment is released in full.
          </p>
          <Cancel task={task} note="Changed your mind? Cancel and your payment is released in full." />
        </div>
      );
    case "refused": {
      const refusal = await desk.getRefusal(requester, task.id);
      return (
        <div className="flex flex-col gap-3">
          <p className="text-sm">
            This task broke boreal.work&apos;s rulebook, so it won&apos;t open.{" "}
            {task.fundedAt ? "Your payment was released in full." : "Nothing was paid."}
          </p>
          {refusal && (
            <p className="rounded-lg bg-muted p-3 text-sm">
              {refusal.reasoning ?? "No reason given."}{" "}
              <span className="font-mono text-xs text-muted-foreground">{refusal.ruleIds.join(" · ")}</span>
            </p>
          )}
          <Link href="/post" className="text-sm text-primary underline-offset-4 hover:underline">
            Post a corrected task
          </Link>
        </div>
      );
    }
    case "awaiting_funding": {
      const account = await desk.getAgentAccount(requester);
      const paypal = getRails().paypal;
      const saved = account.savedPaymentMethod && Boolean(paypal?.vault);
      return (
        <div className="flex flex-col gap-5">
          <p className="text-sm text-muted-foreground">
            Pay {usd(taskTotal(task))} with PayPal: it&apos;s held, not charged, until the work passes. boreal.work then checks
            the task against its rulebook and opens it to workers.
          </p>
          {paypal ? (
            <ActionButton action={payTask.bind(null, task.id)}>
              {saved ? `Pay ${usd(taskTotal(task))} with your saved PayPal` : `Pay ${usd(taskTotal(task))} with PayPal`}
            </ActionButton>
          ) : (
            <Alert>
              <AlertDescription>Paying on the website needs PayPal, which isn&apos;t switched on here yet.</AlertDescription>
            </Alert>
          )}
          <Cancel task={task} note="Nothing has been paid yet." />
        </div>
      );
    }
    case "open":
      return (
        <div className="flex flex-col gap-5">
          <p className="text-sm text-muted-foreground">
            Paid and open to workers until {when(task.deadline)}. If nobody claims it by then, you get everything back.
          </p>
          <Cancel
            task={task}
            note={`Cancel before anyone claims it and ${task.paymentRail === "paypal" ? "the PayPal hold is released" : "you're refunded"} in full.`}
          />
        </div>
      );
    case "claimed":
      return (
        <p className="text-sm text-muted-foreground">
          A worker claimed it{task.claimExpiresAt ? ` and has until ${when(task.claimExpiresAt)} to send the result` : ""}. If
          they don&apos;t, it reopens for others.
        </p>
      );
    case "submitted":
      if (task.reviewMode === "requester") {
        return (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">The result is in. Judge it against your checks only.</p>
            <ReviewForm action={reviewResult.bind(null, task.id)} rules={REVIEW_RULES} />
          </div>
        );
      }
      return <p className="text-sm text-muted-foreground">The result is in. boreal.work&apos;s reviewer is checking it against your checks.</p>;
    case "passed":
      return (
        <div className="flex flex-col gap-5">
          <p className="text-sm text-muted-foreground">
            Passed. The worker is paid when the objection window closes{windowEnds ? ` on ${when(windowEnds)}` : ""}. Accept now to
            pay them straight away. You can&apos;t overrule a pass, but you can dispute it once.
          </p>
          <ActionButton action={acceptResult.bind(null, task.id)}>Accept and pay now</ActionButton>
          {canDispute && (
            <div className="flex flex-col gap-2 border-t pt-5">
              <p className="text-sm text-muted-foreground">A panel with a human member decides, and its decision is final.</p>
              <DisputeForm action={disputeAsPoster.bind(null, task.id)} />
            </div>
          )}
        </div>
      );
    case "failed":
      // The poster's own fail is theirs to stand by; the worker may dispute it.
      if (task.reviewMode === "requester") {
        return (
          <p className="text-sm text-muted-foreground">
            You failed it. Unless the worker disputes it to the panel, it becomes final
            {windowEnds ? ` on ${when(windowEnds)}` : ""} and your budget is refunded.
          </p>
        );
      }
      return (
        <div className="flex flex-col gap-5">
          <p className="text-sm text-muted-foreground">
            Failed. It becomes final{windowEnds ? ` on ${when(windowEnds)}` : ""}, and your budget is refunded (the review fee is
            kept).
          </p>
          {canDispute && <DisputeForm action={disputeAsPoster.bind(null, task.id)} />}
        </div>
      );
    case "disputed":
      return <p className="text-sm text-muted-foreground">With the dispute panel. Its decision is final; the money stays held until then.</p>;
    case "final_pass":
      return <p className="text-sm">Done. The worker was paid {usd(task.budget)}.</p>;
    case "final_fail":
      return <p className="text-sm">Not paid. Your budget was refunded.</p>;
    case "expired":
      return <p className="text-sm">Nobody claimed it before the deadline. Everything you paid was released.</p>;
    case "cancelled":
      return <p className="text-sm">Cancelled. Anything held was released.</p>;
  }
}

async function PostedTask({ params, searchParams }: Props) {
  const { id } = await params;
  const poster = await posterFromSession();
  if (!poster) redirect(`/signin?next=/me/posted/${encodeURIComponent(id)}`);
  if (!poster.requester) notFound();
  const desk = getDesk();
  let task;
  try {
    task = await desk.getTask(poster.requester, id);
  } catch (error) {
    if (error instanceof DeskError && error.code === "not_found") notFound();
    throw error;
  }
  // Someone is watching their task: move timers and payouts along now.
  after(kickMonitorSoon);
  const [submission, verdict, query] = await Promise.all([
    desk.getSubmission(poster.requester, id),
    desk.getVerdict(poster.requester, id),
    searchParams,
  ]);
  const status = posterStatus(task);

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
      <aside className="flex flex-col gap-5 rounded-2xl border bg-card p-5 lg:sticky lg:top-20 lg:order-2">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-5xl font-light tracking-[-0.04em] tabular-nums">{usd(taskTotal(task))}</p>
          <Badge variant={status.tone}>{status.label}</Badge>
        </div>
        <dl className="grid gap-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Worker&apos;s pay</dt>
            <dd className="tabular-nums">{usd(task.budget)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Platform fee</dt>
            <dd className="tabular-nums">{usd(task.platformFee)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Review fee</dt>
            <dd className="tabular-nums">{task.reviewMode === "requester" ? "none, you review" : usd(task.reviewFee)}</dd>
          </div>
        </dl>
        <div className="border-t pt-5">
          <NextStep task={task} requester={poster.requester} />
        </div>
      </aside>

      <div className="flex flex-col gap-6 lg:order-1">
        {query.posted && task.status === "awaiting_funding" && (
          <Alert>
            <AlertDescription>Posted. Pay below to send it to screening.</AlertDescription>
          </Alert>
        )}
        {query.funded && (task.status === "posted" || task.status === "open") && (
          <Alert>
            <AlertDescription>
              Paid. PayPal holds {usd(taskTotal(task))} until the work passes.{" "}
              {task.status === "open" ? "Your task is open to workers." : screeningNote()}
            </AlertDescription>
          </Alert>
        )}
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{task.reviewMode === "requester" ? "You review it" : "boreal.work reviews it"}</Badge>
            {task.requiredAttributes.map((a) => (
              <Badge key={a.attribute} variant="outline">
                {attributeLabel(a)}
              </Badge>
            ))}
          </div>
          <h1 className="text-3xl leading-tight font-light tracking-[-0.03em] text-balance sm:text-4xl">{task.description}</h1>
          <p className="text-sm text-muted-foreground">
            Posted {when(task.createdAt)} · deadline {when(task.deadline)}
          </p>
        </div>

        <section className="flex flex-col gap-3 rounded-2xl border bg-card p-5">
          <h2 className="font-semibold">What counts as done</h2>
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
              {verdict.by === "panel" ? "Panel decision" : task.reviewMode === "requester" ? "Your verdict" : "Reviewer verdict"}:{" "}
              {verdict.outcome === "pass" ? "passed" : "failed"}
            </h2>
            <p>{verdict.reasoning}</p>
            <p className="font-mono text-xs text-muted-foreground">
              {verdict.ruleIds.length ? verdict.ruleIds.join(" · ") : "No rules cited"} · {when(verdict.at)}
            </p>
            <PrivateReviewNote review={verdict.privateReview} />
          </section>
        )}

        {submission && (
          <section className="flex flex-col gap-3 rounded-2xl border bg-card p-5">
            <div>
              <h2 className="font-semibold">The worker&apos;s result</h2>
              <p className="text-sm text-muted-foreground">{when(submission.createdAt)}</p>
            </div>
            {submission.fileUrls.map((path) =>
              path.endsWith(".pdf") ? (
                <a key={path} href={`/api/files/${path}`} className="text-primary underline underline-offset-4">
                  Open the file
                </a>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- private files are served by our own route
                <img key={path} src={`/api/files/${path}`} alt="The submitted photo" className="max-h-[28rem] w-full rounded-xl border object-contain" />
              ),
            )}
            {submission.text && <p className="whitespace-pre-wrap">{submission.text}</p>}
          </section>
        )}
      </div>
    </div>
  );
}

export default function PostedTaskPage(props: Props) {
  return (
    <main className="flex-1">
      <Container className="flex flex-col gap-8 py-10 md:py-14">
      <Link href="/me?tab=posted" className="group flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" /> Tasks you posted
      </Link>
      <Eyebrow>Your task</Eyebrow>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-muted" />}>
        <PostedTask {...props} />
      </Suspense>
      </Container>
    </main>
  );
}
