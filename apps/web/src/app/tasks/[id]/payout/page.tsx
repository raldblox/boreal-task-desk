import { DeskError } from "@boreal/desk";
import { ArrowLeft, ExternalLink } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import { CONNECT_MESSAGE } from "@boreal/near";

import { Eyebrow } from "@/components/brand";
import { ConnectConcordiumAccount, ConnectNear } from "@/components/connect-wallet";
import { buttonVariants } from "@/components/ui/button";
import { SITE } from "@/content/agent-guide";
import { gatedEnv } from "@/server/addons";
import { usd } from "@/lib/format";
import { canBePaidOn } from "@/lib/rails";
import { getDesk } from "@/server/desk";
import { workerFromSession } from "@/server/session";

// Guided payout setup: a worker who only has PayPal sets up their own account on the rail a task
// pays on, then claims it in the same step. Never custodial: boreal links to wallets the worker
// holds themselves, and never converts one rail's money into another's.

// Meteor makes free accounts on mainnet and testnet and signs messages, so the Connect button offers it.
const NEAR_WALLET = process.env.NEAR_WALLET_URL || "https://wallet.meteorwallet.app";
const CONCORDIUM_WALLET =
  process.env.CONCORDIUM_WALLET_URL || "https://chromewebstore.google.com/detail/concordium-wallet/mnnkpffndmickbiakofclnpoiajlegmg";

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary-soft text-xs font-semibold text-primary-soft-foreground">{n}</span>
      <div className="flex flex-col gap-2 text-sm">{children}</div>
    </li>
  );
}

async function Setup({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const worker = await workerFromSession();
  if (!worker || worker.role !== "worker") redirect(`/signin?next=/tasks/${encodeURIComponent(id)}/payout`);
  const desk = getDesk();
  let task;
  try {
    task = await desk.getTask(worker, id);
  } catch (error) {
    if (error instanceof DeskError && error.code === "not_found") notFound();
    throw error;
  }
  const profile = await desk.getWorker(worker);
  // Already set up (or nothing to set up): straight back to the task.
  if (task.test || canBePaidOn(profile, task.paymentRail)) redirect(`/tasks/${id}`);

  if (task.paymentRail === "paypal") {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Get paid via PayPal</h1>
        <p className="text-muted-foreground">This task pays {usd(task.budget)} via PayPal. Log in with PayPal once and you&apos;re paid the moment it passes.</p>
        {/* A route handler that redirects to PayPal, so a full navigation, not <Link>. */}
        <a href={`/paypal/login?next=${encodeURIComponent(`/tasks/${id}`)}`} className={buttonVariants({ className: "w-fit" })}>
          Log in with PayPal
        </a>
      </div>
    );
  }

  const near = task.paymentRail === "near";
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Eyebrow>{near ? "USDC on NEAR" : "Tokens on Concordium"}</Eyebrow>
        <h1 className="text-2xl font-semibold tracking-tight">{near ? "Connect a NEAR wallet" : "Connect a Concordium wallet"}</h1>
        <p className="text-muted-foreground">
          {near
            ? `This task pays ${usd(task.budget)} in USDC on NEAR. Connect your NEAR wallet once and you're paid there the moment it passes.`
            : `This task pays ${usd(task.budget)} in tokens on Concordium. Connect your Concordium wallet once and you're paid there the moment it passes.`}
        </p>
      </div>
      <ol className="flex flex-col gap-5">
        <Step n={1}>
          {near ? (
            <p>
              No NEAR wallet yet? Create one: it&apos;s free and takes about 2 minutes, and the account and its keys are yours alone. boreal never
              holds them. Already have one (Meteor, Intear, HOT…)? Skip to step 2.
            </p>
          ) : (
            <p>
              Install the Concordium wallet and create an account with the Concordium ID App. The same ID also earns you the Verified by Concordium
              badge, which unlocks tasks that ask for your age or country. Adding the badge on My account costs a little CCD for its proof.
            </p>
          )}
          <a href={near ? NEAR_WALLET : CONCORDIUM_WALLET} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline", className: "w-fit gap-1.5" })}>
            {near ? "Create a NEAR wallet" : "Get the Concordium wallet"} <ExternalLink className="size-4" />
          </a>
        </Step>
        <Step n={2}>
          <p>
            {near
              ? "Connect it and sign a short message. It's free (no transaction, no fee) and proves the account is yours."
              : "Connect it and pick the account to be paid to."}{" "}
            We claim the task for you as soon as it&apos;s connected.
          </p>
          {near ? (
            <ConnectNear
              network={gatedEnv().NEAR_NETWORK === "mainnet" ? "mainnet" : "testnet"}
              recipient={new URL(SITE).host}
              message={CONNECT_MESSAGE}
              taskId={id}
              label="Connect wallet and claim"
            />
          ) : (
            <ConnectConcordiumAccount taskId={id} label="Connect wallet and claim" />
          )}
        </Step>
      </ol>
      <p className="text-xs text-muted-foreground">
        You&apos;re paid in exactly what the task pays in: boreal doesn&apos;t convert between PayPal, NEAR and Concordium. Prefer PayPal? Tasks marked
        &ldquo;Paid via PayPal&rdquo; pay there.
      </p>
    </div>
  );
}

export default function PayoutSetupPage({ params }: PageProps<"/tasks/[id]/payout">) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8 md:py-12">
      <Link href="/tasks" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Open tasks
      </Link>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-muted" />}>
        <Setup params={params} />
      </Suspense>
    </main>
  );
}
