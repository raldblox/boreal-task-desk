import { DeskError } from "@boreal/desk";
import { CheckCircle2, XCircle } from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { after } from "next/server";
import { Suspense } from "react";

import { Eyebrow } from "@/components/brand";
import { Container, PAGE_TOP } from "@/components/page";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { CHECKOUT_COOKIE, readCheckout } from "@/lib/checkout";
import { getDesk, getRails } from "@/server/desk";
import { kickMonitor } from "@/server/monitor";
import { posterFromSession } from "@/server/poster";

type Props = { params: Promise<{ outcome: string }>; searchParams: Promise<{ token?: string }> };

/**
 * A person who pressed Pay with PayPal on their own task: finish funding it with the order they
 * just approved, then send them to the task. Null when the order isn't theirs (an agent's owner
 * approving an agent's checkout: the agent finishes with fund_task, as before).
 */
async function finishPersonalFunding(orderId: string | undefined): Promise<{ error: string; taskId: string } | null> {
  if (!orderId) return null;
  const poster = await posterFromSession();
  const paypal = getRails().paypal;
  if (!poster?.requester || !paypal) return null;
  const desk = getDesk();
  const checkout = readCheckout((await cookies()).get(CHECKOUT_COOKIE)?.value);
  // The cookie names the task; without it (another browser), try their tasks waiting for money.
  // PayPal's order names its task, so the wrong one is refused before anything moves.
  const candidates =
    checkout?.orderId === orderId
      ? [checkout.taskId]
      : (await desk.listTasks(poster.requester, { status: "awaiting_funding", limit: 5 })).map((t) => t.id);

  for (const taskId of candidates) {
    let task;
    try {
      task = await desk.getTask(poster.requester, taskId);
    } catch {
      continue;
    }
    // Already funded with this order: a reload, or PayPal sending them back twice.
    if (task.fundingTxHash === `paypal:order:${orderId}`) redirect(`/me/posted/${task.id}?funded=1`);
    if (task.status !== "awaiting_funding") continue;
    try {
      await desk.fundTask(
        poster.requester,
        task.id,
        {
          async confirm() {
            try {
              return await paypal.confirmPayment(task.id, { orderId });
            } catch (error) {
              throw new DeskError("invalid", error instanceof Error ? error.message : "payment was not accepted");
            }
          },
        },
        { rail: "paypal" },
      );
    } catch (error) {
      if (!(error instanceof DeskError)) throw error;
      // Another task's order: try the next one.
      if (error.code === "invalid" && /another task/.test(error.message) && candidates.length > 1) continue;
      // PayPal's refusal is worded for agents; say it in the poster's terms.
      const message = /isn't approved yet/.test(error.message)
        ? "PayPal hasn't approved this payment yet. Press Pay with PayPal on your task and finish on PayPal."
        : error.message;
      return { error: message, taskId: task.id };
    }
    after(kickMonitor);
    redirect(`/me/posted/${task.id}?funded=1`);
  }
  return null;
}

/** Where PayPal sends the payer back after approving (or cancelling) a task's funding. */
async function Outcome({ params, searchParams }: Props) {
  const { outcome } = await params;
  if (outcome !== "approved" && outcome !== "cancelled") notFound();
  const approved = outcome === "approved";
  const failed = approved ? await finishPersonalFunding((await searchParams).token) : null;
  if (failed) {
    return (
      <div className="flex flex-col items-start gap-4 rounded-2xl border bg-card p-6">
        <XCircle className="size-8 text-destructive" />
        <h1 className="text-4xl font-light tracking-[-0.035em]">Payment not finished</h1>
        <Alert variant="destructive">
          <AlertDescription>{failed.error}</AlertDescription>
        </Alert>
        <p className="text-muted-foreground">
          Nothing was taken. If PayPal placed a hold, it lapses on its own. Try paying again from your task.
        </p>
        <Link href={`/me/posted/${failed.taskId}`} className={buttonVariants()}>
          Back to your task
        </Link>
      </div>
    );
  }
  const poster = approved ? null : await posterFromSession();
  return (
    <div className="flex flex-col items-start gap-4 rounded-2xl border bg-card p-6">
      {approved ? <CheckCircle2 className="size-8 text-primary" /> : <XCircle className="size-8 text-muted-foreground" />}
      <h1 className="text-4xl font-light tracking-[-0.035em]">{approved ? "Payment approved" : "Payment cancelled"}</h1>
      <p className="text-muted-foreground">
        {approved
          ? "PayPal is holding the money, not charging it. Your agent finishes funding the task, and it opens to workers. The money is taken only if the work passes review; otherwise the hold is released."
          : poster?.requester
            ? "Nothing was held or charged. Your task stays ready to pay whenever you are."
            : "Nothing was held or charged. Your agent can send you a new payment link when it's ready."}
      </p>
      <div className="flex flex-wrap gap-3">
        <Link href="/me" className={buttonVariants()}>
          Go to my account
        </Link>
        <Link href="/agents" className={buttonVariants({ variant: "outline" })}>
          How payments work
        </Link>
      </div>
      <p className="text-sm text-muted-foreground">Or just close this tab.</p>
    </div>
  );
}

export default function PayPalReturnPage(props: Props) {
  return (
    <main className="flex-1">
      <Container className={`flex flex-col gap-8 ${PAGE_TOP} pb-10 md:pb-14 [&>*]:max-w-[860px]`}>
      <Eyebrow>Task payment</Eyebrow>
      <Suspense fallback={<div className="h-44 animate-pulse rounded-2xl bg-muted" />}>
        <Outcome {...props} />
      </Suspense>
      </Container>
    </main>
  );
}
