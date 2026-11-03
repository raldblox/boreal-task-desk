import { POLICY } from "@boreal/core";
import { badgeProofMessage } from "@boreal/concordium";
import { DeskError, normaliseLinkCode } from "@boreal/desk";
import { Bot, CheckCircle2, XCircle } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { approveLink, denyLink } from "@/app/link/actions";
import { ApproveLinkForm } from "@/app/link/approve-form";
import { Eyebrow } from "@/components/brand";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { getDesk, paymentRails } from "@/server/desk";
import { paypalAccounts } from "@/server/paypal-accounts";
import { workerFromSession } from "@/server/session";

/** Desk errors are lower-case clauses; show one as a sentence. */
const sentence = (message: string) => `${message.charAt(0).toUpperCase()}${message.slice(1).replace(/\.?$/, ".")}`;

type Props = { params: Promise<{ code: string }>; searchParams: Promise<{ done?: string; agent?: string }> };

async function LinkRequest({ params, searchParams }: Props) {
  const code = normaliseLinkCode(decodeURIComponent((await params).code));
  const { done, agent } = await searchParams;

  if (done === "approved" || done === "denied") {
    // canSaveAccounts reads the clock (its cached PayPal token), so render at request time.
    await connection();
    const approved = done === "approved";
    return (
      <div className="flex flex-col items-start gap-4 rounded-2xl border bg-card p-6">
        {approved ? <CheckCircle2 className="size-8 text-primary" /> : <XCircle className="size-8 text-muted-foreground" />}
        <h2 className="text-xl font-semibold">{approved ? "Approved" : "Denied"}</h2>
        <p className="text-muted-foreground">
          {approved
            ? "Your agent picks up its key the next time it checks, usually within seconds, and can post tasks for verified workers right away, within the limits you set."
            : "The agent won't get a key from this request. If that was a mistake, ask it to connect again."}
        </p>
        {approved && agent && paymentRails().includes("paypal") && (await paypalAccounts()?.canSaveAccounts()) && (
          <div className="flex flex-col gap-2 rounded-xl border bg-muted/40 p-4">
            <p className="font-medium">Let it pay with your PayPal</p>
            <p className="text-sm text-muted-foreground">
              Approve once on PayPal and your agent funds its tasks from your account, within its limits, without asking
              you each time. Money is only held until a task passes, and returned if it doesn&apos;t.
            </p>
            <a href={`/paypal/save/${encodeURIComponent(agent)}`} className={buttonVariants({ className: "w-full sm:w-fit" })}>
              Connect PayPal
            </a>
          </div>
        )}
        <Link href="/me" className={buttonVariants({ variant: "outline" })}>
          {approved && agent ? "Skip for now" : "Go to my account"}
        </Link>
      </div>
    );
  }

  const worker = await workerFromSession();
  if (!worker || worker.role !== "worker") redirect(`/signin?next=/link/${code}`);

  const desk = getDesk();
  let link;
  let myAgents;
  try {
    link = await desk.getAgentLink(code);
    myAgents = await desk.listOwnerAgents(worker.workerId);
  } catch (error) {
    if (!(error instanceof DeskError)) throw error;
    return (
      <Alert variant="destructive">
        <AlertTitle>Can&apos;t approve this request</AlertTitle>
        <AlertDescription>
          {sentence(error.message)} Ask your agent for a new link, or{" "}
          <Link href="/link" className="underline underline-offset-2">
            enter its code
          </Link>
          .
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-3 rounded-2xl border bg-card p-5">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary-soft-foreground">
          <Bot className="size-5" />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <p className="font-semibold">{link.agentName}</p>
          {link.agentDescription && <p className="text-sm text-muted-foreground">{link.agentDescription}</p>}
          <p className="font-mono text-xs text-muted-foreground">Code {link.code}</p>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Only approve if you just asked this agent to connect and the code matches what it showed you. You&apos;ll be its
        accountable owner, and it can spend up to the limits below.
      </p>
      <ApproveLinkForm
        action={approveLink.bind(null, link.code)}
        agentName={link.agentName}
        proofTemplate={badgeProofMessage({ code: link.code, badge: "{badge}" })}
        myAgents={myAgents.map((a) => ({ id: a.id, name: a.name }))}
        maxTaskBudget={POLICY.maxTaskBudget}
        maxDailySpend={POLICY.maxAgentDailySpend}
      />
      <form action={denyLink.bind(null, link.code)}>
        <Button type="submit" variant="ghost" className="text-muted-foreground">
          Deny this request
        </Button>
      </form>
    </div>
  );
}

export default function LinkPage(props: Props) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-8 px-4 py-12 md:py-16">
      <div className="flex flex-col gap-3">
        <Eyebrow>Link an agent</Eyebrow>
        <h1 className="text-3xl font-semibold tracking-tight">An agent wants a boreal key</h1>
      </div>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-muted" />}>
        <LinkRequest {...props} />
      </Suspense>
    </main>
  );
}
