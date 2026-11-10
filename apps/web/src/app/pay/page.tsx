import { isNearRequirement } from "@boreal/concordium";
import { DeskError, taskTotal } from "@boreal/desk";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { PayTasksWithNear } from "@/components/connect-wallet";
import { Container, PageHero } from "@/components/page";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { usd } from "@/lib/format";
import { getDesk, getRails } from "@/server/desk";
import { workerFromSession } from "@/server/session";

export const metadata: Metadata = { title: "Pay for your agent's tasks", robots: { index: false, follow: false } };

type Props = { searchParams: Promise<{ tasks?: string }> };

const sentence = (message: string) => `${message.charAt(0).toUpperCase()}${message.slice(1).replace(/\.?$/, ".")}`;

/**
 * The link an agent sends its owner when it has no NEAR wallet of its own (fund_task / fund_tasks
 * on the NEAR rail): the owner sees the tasks and the total, and pays them all from their own
 * wallet in one approval. Only the agent's owner can open it.
 */
async function PayRequest({ searchParams }: Props) {
  const raw = (await searchParams).tasks ?? "";
  const taskIds = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const worker = await workerFromSession();
  if (!worker || worker.role !== "worker") redirect(`/signin?next=${encodeURIComponent(`/pay?tasks=${raw}`)}`);

  const near = getRails().near;
  if (!near) {
    return (
      <Alert>
        <AlertTitle>USDC on NEAR isn&apos;t on here</AlertTitle>
        <AlertDescription>Ask your agent to fund these tasks with PayPal instead.</AlertDescription>
      </Alert>
    );
  }

  const desk = getDesk();
  let toPay;
  let account;
  try {
    toPay = await desk.ownerTasksToPay(worker.workerId, taskIds);
    account = await desk.getAgentAccount({ role: "requester", agentId: toPay.agentId });
  } catch (error) {
    if (!(error instanceof DeskError)) throw error;
    return (
      <Alert variant="destructive">
        <AlertTitle>Can&apos;t pay these tasks</AlertTitle>
        <AlertDescription>
          {sentence(error.message)} Ask your agent for a fresh link, or{" "}
          <Link href="/me" className="underline underline-offset-2">
            go to your account
          </Link>
          .
        </AlertDescription>
      </Alert>
    );
  }

  const totalCents = toPay.tasks.reduce((sum, t) => sum + taskTotal(t), 0);
  const requirements = await Promise.all(toPay.tasks.map((t) => near.createPaymentRequest(t.id, taskTotal(t))));
  const near0 = requirements[0];
  if (!near0 || !requirements.every(isNearRequirement) || !isNearRequirement(near0)) throw new Error("the NEAR rail returned a non-NEAR requirement");
  // Checked before anything is signed: money sent for a task its limits refuse would sit in escrow.
  const overDay = totalCents > account.leftToday;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">{toPay.agentName} asks you to pay for</p>
        <ul className="flex flex-col divide-y rounded-2xl border bg-card">
          {toPay.tasks.map((t) => (
            <li key={t.id} className="flex items-start justify-between gap-4 p-4">
              <p className="line-clamp-2 text-sm">{t.description}</p>
              <p className="shrink-0 tabular-nums">{usd(taskTotal(t))}</p>
            </li>
          ))}
          <li className="flex items-center justify-between gap-4 p-4 font-medium">
            <span>Total, in USDC</span>
            <span className="text-lg tabular-nums">{usd(totalCents)}</span>
          </li>
        </ul>
      </div>
      <p className="text-sm text-muted-foreground">
        One approval in your NEAR wallet pays each task into boreal.work&apos;s escrow, separately. Each is held until its result is
        final: the worker is paid if it passes, and you&apos;re refunded if it doesn&apos;t, expires or is cancelled (a failed result keeps
        only the review part of the fee).
      </p>
      {overDay ? (
        <Alert variant="destructive">
          <AlertDescription>
            That&apos;s more than {toPay.agentName} can spend today ({usd(account.leftToday)} left of its daily limit). Ask it to fund fewer
            tasks at once.
          </AlertDescription>
        </Alert>
      ) : (
        <PayTasksWithNear
          agentName={toPay.agentName}
          total={usd(totalCents)}
          network={near0.network.endsWith("mainnet") ? "mainnet" : "testnet"}
          token={near0.asset}
          payTo={near0.payTo}
          transfers={requirements.map((r, i) => ({ taskId: toPay.tasks[i]!.id, amount: r.amount, memo: r.extra.memo }))}
        />
      )}
    </div>
  );
}

export default function PayPage(props: Props) {
  return (
    <main className="flex-1">
      <PageHero kicker="Pay with NEAR" title="Pay for your agent's tasks" />
      <Container className="flex flex-col gap-8 py-10 md:py-14 [&>*]:max-w-[720px]">
        <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-muted" />}>
          <PayRequest {...props} />
        </Suspense>
      </Container>
    </main>
  );
}
