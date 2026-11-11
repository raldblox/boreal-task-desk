import type { Metadata } from "next";
import { DeskError } from "@boreal/desk";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { decideApproval } from "@/app/owner/actions";
import { OwnerActionForm } from "@/components/owner-agent-controls";
import { Container, PageHero } from "@/components/page";
import { usd, when } from "@/lib/format";
import { getDesk } from "@/server/desk";
import { workerFromSession } from "@/server/session";

export const metadata: Metadata = { title: "Approve a payment", robots: { index: false, follow: false } };

type Props = { params: Promise<{ id: string }> };

/** A payment one of your agents asked you to approve ("ask me each time"). Only its owner sees it. */
async function Approval({ params }: Props) {
  const { id } = await params;
  const worker = await workerFromSession();
  if (!worker || worker.role !== "worker") redirect(`/signin?next=/approve/${encodeURIComponent(id)}`);
  let approval: Awaited<ReturnType<ReturnType<typeof getDesk>["ownerFundingApproval"]>>;
  try {
    approval = await getDesk().ownerFundingApproval(worker.workerId, id);
  } catch (error) {
    if (!(error instanceof DeskError)) throw error;
    return <p className="text-muted-foreground">There is no payment request at this link for the account you are signed in with.</p>;
  }
  const pending = approval.status === "pending";
  return (
    <div className="flex flex-col gap-6 rounded-2xl border bg-card p-6">
      <div className="flex flex-col gap-1">
        <p className="text-lg font-medium">
          {approval.agent.name} asks to pay {usd(approval.total)} for {approval.tasks.length} {approval.tasks.length === 1 ? "task" : "tasks"}
        </p>
        <p className="text-sm text-muted-foreground">
          From your saved PayPal account. PayPal only holds the money: each task is charged when its result passes review, and released in full if it
          is refused, expires or fails.
        </p>
      </div>
      <ul className="flex flex-col divide-y rounded-xl border">
        {approval.tasks.map((task) => (
          <li key={task.id} className="flex flex-col gap-1 p-4 text-sm">
            <p>{task.description}</p>
            <p className="text-muted-foreground">
              {usd(task.total)} held ({usd(task.budget)} to the worker, the rest is the service fee) · due {when(task.deadline)}
            </p>
          </li>
        ))}
      </ul>
      {pending ? (
        <div className="flex flex-wrap gap-6">
          <OwnerActionForm action={decideApproval.bind(null, approval.id, "approve")} label={`Approve ${usd(approval.total)}`} variant="default" />
          <OwnerActionForm action={decideApproval.bind(null, approval.id, "decline")} label="Decline" />
        </div>
      ) : (
        <p className="text-sm">
          {approval.status === "expired" && "This request expired before it was answered. Nothing was held; your agent can ask again."}
          {approval.status === "declined" && "You declined this. Nothing was held."}
          {(approval.status === "used" || approval.status === "approved") &&
            `You approved this. ${approval.result?.funded.length ?? 0} paid for${approval.result?.failed.length ? `, ${approval.result.failed.length} not: ${approval.result.failed.map((f) => f.error).join("; ")}` : ""}.`}
        </p>
      )}
      {pending && <p className="text-xs text-muted-foreground">Open until {when(approval.expiresAt)}. To stop being asked, change this agent to pay on its own on My account, under Agents.</p>}
    </div>
  );
}

export default function ApprovePage(props: Props) {
  return (
    <>
      <PageHero title="Approve a payment" lede="Your agent wants to fund tasks from your saved PayPal account." />
      <Container className="py-10">
        <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
          <Approval {...props} />
        </Suspense>
      </Container>
    </>
  );
}
