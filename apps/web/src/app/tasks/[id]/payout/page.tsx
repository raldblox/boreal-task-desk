import { DeskError } from "@boreal/desk";
import { ArrowLeft, ExternalLink } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import { setUpPayoutAndClaim } from "@/app/actions";
import { Eyebrow } from "@/components/brand";
import { PayoutForm } from "@/components/worker-forms";
import { buttonVariants } from "@/components/ui/button";
import { NETWORK } from "@/content/agent-guide";
import { usd } from "@/lib/format";
import { canBePaidOn } from "@/lib/rails";
import { getDesk } from "@/server/desk";
import { workerFromSession } from "@/server/session";

// Guided payout setup: a worker who only has PayPal sets up their own account on the rail a task
// pays on, then claims it in the same step. Never custodial: boreal links to wallets the worker
// holds themselves, and never converts one rail's money into another's.

const NEAR_WALLET = process.env.NEAR_WALLET_URL || (NETWORK === "mainnet" ? "https://app.mynearwallet.com" : "https://testnet.mynearwallet.com");
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
        <h1 className="text-2xl font-semibold tracking-tight">{near ? "Create a free NEAR account" : "Set up Concordium"}</h1>
        <p className="text-muted-foreground">
          {near
            ? `This task pays ${usd(task.budget)} in USDC on NEAR. Create a free NEAR account (about 2 minutes) and you're paid the moment it passes.`
            : `This task pays ${usd(task.budget)} in tokens on Concordium. Set up a Concordium account and you're paid there the moment it passes.`}
        </p>
      </div>
      <ol className="flex flex-col gap-5">
        <Step n={1}>
          {near ? (
            <p>
              Open a NEAR wallet and create an account. It&apos;s free, and the account and its keys are yours alone: boreal never holds them.
            </p>
          ) : (
            <p>
              Install the Concordium wallet and create an account with the Concordium ID App. The same ID also earns you the Verified by Concordium
              badge, which unlocks tasks that ask for your age or country. Adding the badge on My account costs a little CCD for its proof.
            </p>
          )}
          <a href={near ? NEAR_WALLET : CONCORDIUM_WALLET} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline", className: "w-fit gap-1.5" })}>
            {near ? "Open a NEAR wallet" : "Get the Concordium wallet"} <ExternalLink className="size-4" />
          </a>
        </Step>
        <Step n={2}>
          <p>{near ? "Copy your account name (like you.near) and paste it here." : "Copy your account address and paste it here."} We claim the task for you as soon as it&apos;s saved.</p>
          <PayoutForm action={setUpPayoutAndClaim.bind(null, id, near ? "near" : "concordium")} current={null} paypal={false} near={near} submitLabel="Save and claim" />
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
