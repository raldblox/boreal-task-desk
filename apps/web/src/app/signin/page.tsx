import { Check, EyeOff } from "lucide-react";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { signIn, signInTest } from "@/app/actions";
import { BorealMark, Eyebrow } from "@/components/brand";
import { ConcordiumSignIn } from "@/components/concordium-sign-in";
import { ConcordiumWalletSignIn } from "@/components/concordium-wallet-sign-in";
import { DevWallet, TestSignIn } from "@/components/worker-forms";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getConcordium, getDesk } from "@/server/desk";
import { getIdAppVerifier } from "@/server/id-app";
import { workerFromSession } from "@/server/session";

function TesterInvite() {
  if (!process.env.TEST_WORKER_INVITE) return null;
  return (
    <details className="group rounded-xl border bg-card">
      <summary className="cursor-pointer list-none px-5 py-4 text-sm font-medium marker:hidden">
        <span className="flex items-center justify-between">
          I have a tester invite
          <span className="text-muted-foreground transition-transform group-open:rotate-45">+</span>
        </span>
      </summary>
      <div className="flex flex-col gap-4 border-t px-5 py-5">
        <p className="text-sm text-muted-foreground">
          Testers run test tasks paid in test money. Attributes are self-declared until you use Concordium ID.
        </p>
        <TestSignIn action={signInTest} />
      </div>
    </details>
  );
}

async function SignInOptions() {
  // Already signed in: nothing to do here.
  if (await workerFromSession()) redirect("/tasks");

  if (getIdAppVerifier()) {
    const network = process.env.CONCORDIUM_NETWORK === "mainnet" ? "mainnet" : "testnet";
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-5 rounded-2xl border bg-card p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <BorealMark className="size-9" />
            <div>
              <p className="font-semibold">Sign in with Concordium ID</p>
              <p className="text-sm text-muted-foreground">
                The ID App or Wallet for Web{network === "testnet" ? ", on testnet" : ""}
              </p>
            </div>
          </div>
          <ol className="flex flex-col gap-2 text-sm text-muted-foreground">
            <li>1. Tap the button and scan the code with the ID App.</li>
            <li>2. Approve the request in the app.</li>
            <li>3. You&apos;re signed in. No password, no email.</li>
          </ol>
          <ConcordiumSignIn projectId={process.env.NEXT_PUBLIC_REOWN_PROJECT_ID!} network={network} />
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or on a computer
            <span className="h-px flex-1 bg-border" />
          </div>
          <ConcordiumWalletSignIn />
        </div>
        <TesterInvite />
      </div>
    );
  }

  if (getConcordium()) {
    // Local stand-in mode (pnpm dev:local): a fresh, signed challenge each time.
    const request = await getDesk().workerProofRequest([]);
    return (
      <div className="flex flex-col gap-4 rounded-2xl border bg-card p-6">
        <p className="font-semibold">Development wallet</p>
        <p className="text-sm text-muted-foreground">Stands in for the Concordium ID App during local development.</p>
        <DevWallet action={signIn} request={JSON.stringify(request)} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Alert>
        <AlertTitle>Concordium ID sign-in is opening soon</AlertTitle>
        <AlertDescription>Workers will sign in by proving only what tasks need, like residency or age.</AlertDescription>
      </Alert>
      <TesterInvite />
    </div>
  );
}

export default function SignInPage() {
  return (
    <main className="mx-auto grid w-full max-w-5xl flex-1 grid-cols-1 items-start gap-10 px-4 py-12 md:grid-cols-2 md:py-20">
      <div className="flex flex-col gap-6">
        <Eyebrow>Sign in to work</Eyebrow>
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">Your identity stays with you.</h1>
        <p className="text-lg leading-relaxed text-muted-foreground">
          boreal checks what a task needs with a zero-knowledge proof from your Concordium ID. You prove facts, not who you
          are.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">What you share</p>
            <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
              {[
                "That you're 18 or older",
                "Your country of residence",
                "Your ID document number, turned at once into a one-way code that stays the same; the number itself is never kept",
              ].map((item) => (
                <li key={item} className="flex gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" /> {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">What we never see</p>
            <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
              {["Your name", "Your date of birth", "Photos of your documents"].map((item) => (
                <li key={item} className="flex gap-2">
                  <EyeOff className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      <Suspense fallback={<div className="h-64 rounded-2xl border bg-card" />}>
        <SignInOptions />
      </Suspense>
    </main>
  );
}
