import type { Metadata } from "next";
import { FEE_POLICY } from "@boreal/core";
import { DeskError } from "@boreal/desk";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { decideApproval } from "@/app/owner/actions";
import { LoadingPanel } from "@/components/loader";
import { OwnerActionForm } from "@/components/owner-agent-controls";
import { Container, EmptyState, MoreLink, PageHero } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { usd, when } from "@/lib/format";
import { getDesk } from "@/server/desk";
import { workerFromSession } from "@/server/session";

export const metadata: Metadata = { title: "Approve a payment", robots: { index: false, follow: false } };

type Props = { params: Promise<{ id: string }> };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** Desk refusals are lower-case clauses; on this page they follow a task, so they start with a capital. */
const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1) + (/[.!?]$/.test(s) ? "" : ".");

/**
 * A payment one of your agents asked you to approve ("Ask me each time"). Only its owner sees it,
 * usually on a phone, from a link the agent sent: the amount and who is asking come first.
 */
async function Approval({ params }: Props) {
  const { id } = await params;
  const worker = await workerFromSession();
  if (!worker || worker.role !== "worker") redirect(`/signin?next=/approve/${encodeURIComponent(id)}`);
  const desk = getDesk();
  let approval: Awaited<ReturnType<ReturnType<typeof getDesk>["ownerFundingApproval"]>>;
  try {
    approval = await desk.ownerFundingApproval(worker.workerId, id);
  } catch (error) {
    if (!(error instanceof DeskError)) throw error;
    return (
      <EmptyState title="No payment request here" action={<MoreLink href="/me">Go to My account</MoreLink>}>
        There is no payment request at this link for the account you are signed in with. If your agent sent it, check you signed in with the
        PayPal account you approved the agent with.
      </EmptyState>
    );
  }
  const agent = (await desk.ownerAgentsOverview(worker.workerId)).find((a) => a.id === approval.agent.id);
  const { status, tasks, result } = approval;
  const pending = status === "pending";
  const decided = status === "approved" || status === "used";
  const failed = new Map((result?.failed ?? []).map((f) => [f.taskId, f.error]));
  const funded = new Set(result?.funded ?? []);
  const reviewPart = `${Math.round(FEE_POLICY.reviewRate * 100)}%`;

  return (
    <div className="flex flex-col gap-8">
      {/* The ask: amount, who, how many */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-muted-foreground">{approval.agent.name} asks to pay</p>
          {status === "pending" && <Badge>Waiting for you</Badge>}
          {decided && <Badge variant="secondary">Approved</Badge>}
          {status === "declined" && <Badge variant="outline">Declined</Badge>}
          {status === "expired" && <Badge variant="outline">Expired</Badge>}
        </div>
        <p className="text-5xl font-light tracking-[-0.03em] tabular-nums">{usd(approval.total)}</p>
        <p className="text-muted-foreground">
          for {plural(tasks.length, "task")}, from your saved PayPal account.
        </p>
      </div>

      {/* Things that change what approving does */}
      {pending && agent?.paused && (
        <p className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
          {approval.agent.name} is paused, so approving won&apos;t pay for these tasks. Resume it on My account → Agents first, or decline.
        </p>
      )}
      {pending && agent && !agent.paymentSaved && (
        <p className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
          No PayPal account is saved for {approval.agent.name} any more, so there is nothing to pay from. Save one on My account → Agents, or
          decline.
        </p>
      )}

      {/* What "held" means */}
      {(pending || decided) && (
        <ul className="flex flex-col gap-1.5 text-sm text-muted-foreground">
          <li>PayPal holds the money on your account: authorized, not charged.</li>
          <li>Each task is charged only when its result passes.</li>
          <li>
            Refused, expired or cancelled before a claim: released in full. Failed by boreal.work&apos;s reviewer: only the review part ({reviewPart}
            of the pay) is kept.
          </li>
        </ul>
      )}

      {/* The tasks */}
      <ul className="flex flex-col gap-3">
        {tasks.map((task) => (
          <li key={task.id} className="flex flex-col gap-3 rounded-2xl border bg-card p-5">
            <p className="line-clamp-4 leading-relaxed">{task.description}</p>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
              <span className="text-muted-foreground">
                {usd(task.budget)} to the worker · due {when(task.deadline)}
              </span>
              <span className="font-medium tabular-nums">{usd(task.total)} held</span>
            </div>
            {decided && funded.has(task.id) && <p className="text-sm text-primary">Paid for. It goes to screening, then to workers.</p>}
            {decided && failed.has(task.id) && (
              <p className="text-sm text-destructive">Not paid for, and nothing held: {sentence(failed.get(task.id)!)}</p>
            )}
          </li>
        ))}
      </ul>

      {/* The decision, or what happened */}
      {pending ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-start gap-3">
            <OwnerActionForm action={decideApproval.bind(null, approval.id, "approve")} label={`Approve ${usd(approval.total)}`} variant="default" />
            <OwnerActionForm action={decideApproval.bind(null, approval.id, "decline")} label="Decline" />
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            This request waits until {when(approval.expiresAt)}, then expires and nothing is held. If you decline, your agent can&apos;t ask again
            for these tasks. To stop being asked, set {approval.agent.name} to Pay on its own on My account → Agents.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-2xl border bg-muted/40 p-5 text-sm">
          {decided && (
            <p>
              You approved this.{" "}
              {failed.size === 0
                ? `${plural(funded.size, "task is", "tasks are")} paid for.`
                : `${funded.size} paid for, ${failed.size} not; each task above says why.`}
            </p>
          )}
          {status === "declined" && <p>You declined this. Nothing was held, and your agent can&apos;t ask again for these tasks.</p>}
          {status === "expired" && <p>This request expired before it was answered. Nothing was held; your agent can ask again.</p>}
          <MoreLink href="/me">See your agents on My account</MoreLink>
        </div>
      )}
    </div>
  );
}

export default function ApprovePage(props: Props) {
  return (
    <main className="flex-1">
      <PageHero kicker="Payment request" title="Approve a payment" lede="Your agent is on Ask me each time, so it needs your OK before anything is held." />
      <Container className="max-w-2xl pb-16">
        <Suspense fallback={<LoadingPanel className="h-80" />}>
          <Approval {...props} />
        </Suspense>
      </Container>
    </main>
  );
}
