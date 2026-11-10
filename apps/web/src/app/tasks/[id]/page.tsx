import { POLICY } from "@boreal/core";
import { type Caller, DeskError, type RequesterKind } from "@boreal/desk";
import type { Task } from "@boreal/db";
import { ArrowLeft, BadgeCheck, Bot, CircleCheck, ShieldCheck, Store, UserCheck } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { claimTask, disputeVerdict, releaseTask, submitResult } from "@/app/actions";
import { PrivateReviewNote } from "@/components/private-review";
import { TxLink } from "@/components/tx-link";
import { TaskProgress } from "@/components/task-progress";
import { Container } from "@/components/page";
import { ActionButton, DisputeForm, SubmitForm } from "@/components/worker-forms";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { RuleRefs } from "@/components/rule-refs";
import { attributeLabel, usd, when, WORKER_STATUS } from "@/lib/format";
import { canBePaidOn, RAIL_LABEL } from "@/lib/rails";
import { getDesk } from "@/server/desk";
import { workerFromSession } from "@/server/session";
import { getAddons } from "@/server/addons";
import { EXPLORER, txUrl } from "@/server/explorer";

function FindAnother() {
  return (
    <Link href="/tasks" className={buttonVariants({ variant: "outline", className: "w-full sm:w-fit" })}>
      Find another task
    </Link>
  );
}

/** What the worker can do next, for each state. */
function NextStep({
  task,
  worker,
  needsBadge,
  needsPayout,
  postedByMe,
}: {
  task: Task;
  worker: Extract<Caller, { role: "worker" }>;
  /** The task needs proven attributes and this worker hasn't added Concordium ID yet. */
  needsBadge: boolean;
  /** The task pays on a rail this worker has no payout account for yet. */
  needsPayout: boolean;
  /** The signed-in person posted this task themselves: they manage it, they can't claim it. */
  postedByMe: boolean;
}) {
  const mine = task.claimedBy === worker.workerId;
  const windowEnds = task.verdictAt ? new Date(task.verdictAt.getTime() + POLICY.objectionWindowMs) : null;

  if (postedByMe) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">You posted this task, so you can&apos;t claim it. Workers see it like this.</p>
        <Link href={`/me/posted/${task.id}`} className={buttonVariants({ className: "w-full" })}>
          Manage your task
        </Link>
      </div>
    );
  }

  switch (task.status) {
    case "open":
      if (needsBadge && !getAddons().ready("concordium", "id")) {
        return (
          <p className="text-sm text-muted-foreground">
            This task needs proven attributes ({task.requiredAttributes.map(attributeLabel).join(", ")}), which need the Concordium
            integration. It isn&apos;t on here, so this task can&apos;t be claimed.
          </p>
        );
      }
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
      if (needsPayout) {
        // No claim without a way to be paid: a guided setup instead, which claims once it is done.
        return (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              {task.paymentRail === "near"
                ? "This task pays in USDC on NEAR. Create a free NEAR account (about 2 minutes) and you’re paid there once it passes."
                : task.paymentRail === "concordium"
                  ? "This task pays in tokens on Concordium. Set up the Concordium ID App and add your account: you’re paid there once it passes."
                  : "This task pays via PayPal. Log in with PayPal so you’re paid there once it passes."}
            </p>
            <Link href={`/tasks/${task.id}/payout`} className={buttonVariants({ className: "w-full" })}>
              Set up and claim
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
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">
              Can&apos;t do it? Release it so someone else can. Nothing is held against you.
            </p>
            <ActionButton action={releaseTask.bind(null, task.id)} variant="outline">
              Release task
            </ActionButton>
          </div>
        </div>
      );
    case "submitted":
      return (
        <p className="text-muted-foreground">
          Submitted. A reviewer is checking it against the criteria above. You&apos;ll see the verdict here and on My
          account.
        </p>
      );
    case "passed":
      return (
        <p className="text-muted-foreground">
          Passed. Your {usd(task.budget)} is held for you and paid when the objection window closes
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
      return (
        <p className="text-muted-foreground">
          Disputed. A panel with a human reviewer is deciding, and its decision is final. The money stays held until then.
        </p>
      );
    case "final_pass":
      return (
        <p className="font-medium">
          {task.test
            ? `Paid ${usd(task.budget)} in test money.`
            : `Paid ${usd(task.budget)} to your ${task.paymentRail === "concordium" ? "Concordium account" : task.paymentRail === "near" ? "NEAR account" : "PayPal"}.`}{" "}
          <Link href="/me" className="font-normal text-primary underline-offset-4 hover:underline">
            See your earnings
          </Link>
          {!task.test && (task.paymentRail === "near" || task.paymentRail === "concordium") && (
            <Suspense fallback={null}>
              <span className="mt-1 block text-sm font-normal">
                <PayoutTx worker={worker} task={task} />
              </span>
            </Suspense>
          )}
        </p>
      );
    case "final_fail":
      return (
        <div className="flex flex-col gap-3">
          <p className="text-muted-foreground">Not paid. The verdict stands, and the money goes back to the requester.</p>
          <FindAnother />
        </div>
      );
    case "expired":
    case "cancelled":
    case "refused":
      return (
        <div className="flex flex-col gap-3">
          <p className="text-muted-foreground">
            {task.status === "expired"
              ? "This task reached its deadline before anyone took it, so it's closed."
              : task.status === "cancelled"
                ? "The requester withdrew this task, so it's closed."
                : "This task didn't pass boreal.work's checks, so it never opened."}{" "}
            Nothing is held against you.
          </p>
          <FindAnother />
        </div>
      );
    default:
      return null;
  }
}

/** The worker's payout for this task on its chain's explorer, once it has settled. */
async function PayoutTx({ worker, task }: { worker: Extract<Caller, { role: "worker" }>; task: Task }) {
  const { payouts } = await getDesk().getWorkerEarnings(worker);
  const payout = payouts.find((p) => p.taskId === task.id && p.status === "settled");
  const rail = task.paymentRail === "near" || task.paymentRail === "concordium" ? task.paymentRail : null;
  if (!payout || !rail) return null;
  return <TxLink href={txUrl(rail, payout.txHash)}>See the payment on {EXPLORER[rail]}</TxLink>;
}

async function TaskDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const worker = await workerFromSession();
  if (!worker || worker.role !== "worker") {
    return (
      <div className="flex flex-col items-start gap-4">
        <p className="text-muted-foreground">Sign in to see this task. You&apos;ll come straight back here.</p>
        <Link href={`/signin?next=/tasks/${encodeURIComponent(id)}`} className={buttonVariants()}>
          Sign in
        </Link>
      </div>
    );
  }

  const desk = getDesk();
  let task: Task & { requesterKind: RequesterKind; fulfilledBy: "person" | "agent" | null };
  try {
    task = await desk.getTask(worker, id);
  } catch (error) {
    if (error instanceof DeskError && error.code === "not_found") notFound();
    throw error;
  }
  const [submission, verdict, profile, mine, proof] = await Promise.all([
    desk.getSubmission(worker, id),
    desk.getVerdict(worker, id),
    desk.getWorker(worker),
    desk.findPersonalRequester(worker.workerId),
    desk.getReviewProof(worker, id),
  ]);
  const needsBadge = task.requiredAttributes.length > 0 && !!profile && !profile.testMode && !profile.hasConcordium;
  const needsPayout = !task.test && !canBePaidOn(profile, task.paymentRail);
  const status = WORKER_STATUS[task.status];

  const verdictTitle =
    verdict?.by === "panel" ? "Panel decision" : task.reviewMode === "requester" ? "Requester verdict" : "Reviewer verdict";

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
      <aside className="flex flex-col gap-5 rounded-2xl border bg-card p-5 lg:sticky lg:top-20 lg:order-2">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-5xl font-light tracking-[-0.04em] tabular-nums text-primary">{usd(task.budget)}</p>
          <Badge variant={status.tone}>{status.label}</Badge>
        </div>
        <TaskProgress status={task.status} />
        <div className="border-t pt-5">
          <NextStep task={task} worker={worker} needsBadge={needsBadge} needsPayout={needsPayout} postedByMe={mine?.id === task.agentId} />
        </div>
      </aside>

      <div className="flex flex-col gap-6 lg:order-1">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {task.test && <Badge className="bg-primary-soft text-primary-soft-foreground">Test task · test money only</Badge>}
            {task.requesterKind === "verified_agent" && (
              <Badge variant="outline" className="gap-1" title="The AI agent that posted this is listed in Concordium's Agent Registry, owned by an accountable Concordium account.">
                <BadgeCheck className="size-3.5 text-primary" /> Verified agent
              </Badge>
            )}
            {task.requesterKind === "verified_person" && (
              <Badge variant="outline" className="gap-1" title="A person posted this themselves from a verified account (PayPal-verified, or with Concordium ID where that integration is on).">
                <UserCheck className="size-3.5 text-primary" /> Posted by a verified person
              </Badge>
            )}
            {task.requesterKind === "market" && (
              <Badge variant="outline" className="gap-1" title="Hired through boreal.work's listing on NEAR Agent Market.">
                <Store className="size-3.5 text-primary" /> NEAR market buyer
              </Badge>
            )}
            {task.paymentRail && <Badge variant="outline">{RAIL_LABEL[task.paymentRail]}</Badge>}
            {task.reviewMode === "requester" && <Badge variant="outline">Reviewed by the requester</Badge>}
            {task.fulfilledBy === "agent" && (
              <Badge variant="outline" className="gap-1" title="An AI agent did this task, signed in with its NEAR account. Its requester opened the task to agents; the review was the same.">
                <Bot className="size-3.5 text-primary" /> Done by an AI agent
              </Badge>
            )}
            {task.fulfilledBy === "person" && task.fulfillers === "people_or_agents" && (
              <Badge variant="outline" className="gap-1" title="A person did this task, though it was open to AI agents too.">
                <UserCheck className="size-3.5 text-primary" /> Done by a person
              </Badge>
            )}
            {task.fulfillers === "people_or_agents" && !task.fulfilledBy && (
              <Badge variant="outline" className="gap-1" title="The requester let AI agents take this too, under the same review.">
                <Bot className="size-3.5 text-primary" /> Open to AI agents
              </Badge>
            )}
            {task.requiredAttributes.length > 0 && (
              <Badge variant="outline" className="gap-1" title="Proven with Concordium ID (the Concordium integration).">
                <ShieldCheck className="size-3.5 text-primary" /> Needs Verified by Concordium
              </Badge>
            )}
            {task.requiredAttributes.map((a) => (
              <Badge key={a.attribute} variant="outline">
                {attributeLabel(a)}
              </Badge>
            ))}
          </div>
          <h1 className="text-3xl leading-tight font-light tracking-[-0.03em] text-balance sm:text-4xl">{task.description}</h1>
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
              <RuleRefs ids={verdict.ruleIds} /> · {when(verdict.at)}
            </p>
            <PrivateReviewNote review={verdict.privateReview} proof={proof} />
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
    <main className="flex-1">
      <Container className="flex flex-col gap-8 py-10 md:py-14">
      <Link href="/tasks" className="group flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" /> Open tasks
      </Link>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-muted" />}>
        <TaskDetail params={params} />
      </Suspense>
      </Container>
    </main>
  );
}
