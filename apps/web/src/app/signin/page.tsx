import { Check, EyeOff, Wallet } from "lucide-react";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { signIn } from "@/app/actions";
import { BorealMark, Eyebrow } from "@/components/brand";
import { ConcordiumSignIn } from "@/components/concordium-sign-in";
import { ConcordiumWalletSignIn } from "@/components/concordium-wallet-sign-in";
import { DevWallet } from "@/components/worker-forms";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { demoMoney, getConcordium, getDesk } from "@/server/desk";
import { getIdAppVerifier } from "@/server/id-app";
import { paypalLoginEnabled } from "@/server/paypal-accounts";
import { workerFromSession } from "@/server/session";

/** Where to go after signing in: only a path on this site. */
function safeNext(next: string | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/tasks";
}

const PAYPAL_NOTICES: Record<string, string> = {
  failed: "PayPal didn't finish signing you in. Try again.",
  cancelled: "You cancelled on PayPal. Nothing changed.",
  off: "Log in with PayPal isn't switched on here yet.",
};

/** Log in with PayPal: a route handler that redirects to PayPal, so a full navigation, not <Link>. */
function PayPalSignIn({ next }: { next: string }) {
  return (
    <div className="flex flex-col gap-5 rounded-2xl border bg-card p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="grid size-9 place-items-center rounded-xl bg-primary-soft text-primary-soft-foreground">
          <Wallet className="size-5" />
        </span>
        <div>
          <p className="font-semibold">Log in with PayPal</p>
          <p className="text-sm text-muted-foreground">
            {demoMoney() ? "PayPal sandbox accounts only, on testnet" : "Get paid to the PayPal account you sign in with"}
          </p>
        </div>
      </div>
      <a
        href={`/paypal/login?next=${encodeURIComponent(next)}`}
        className={buttonVariants({ size: "lg", className: "h-auto min-h-11 w-full text-base" })}
      >
        Log in with PayPal
      </a>
      <p className="text-xs text-muted-foreground">
        boreal keeps a one-way code for your PayPal account, your PayPal email for payouts, and whether PayPal has verified
        the account. Never your password.
      </p>
    </div>
  );
}

/** Concordium ID: signs in, and carries the Verified by Concordium badge with proven attributes. */
async function ConcordiumOption({ next, alone }: { next: string; alone: boolean }) {
  const title = alone ? "Sign in with Concordium ID" : "Or sign in with Concordium ID";
  if (getIdAppVerifier()) {
    const network = process.env.CONCORDIUM_NETWORK === "mainnet" ? "mainnet" : "testnet";
    return (
      <div className="flex flex-col gap-5 rounded-2xl border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <BorealMark className="size-9" />
          <div>
            <p className="font-semibold">{title}</p>
            <p className="text-sm text-muted-foreground">
              The ID App or Wallet for Web{network === "testnet" ? ", on testnet" : ""}. Adds the Verified by Concordium badge.
            </p>
          </div>
        </div>
        <ol className="flex flex-col gap-2 text-sm text-muted-foreground">
          <li>1. Tap the button and scan the code with the ID App.</li>
          <li>2. Approve the request in the app.</li>
          <li>3. You&apos;re signed in. No password, no email.</li>
        </ol>
        <ConcordiumSignIn projectId={process.env.NEXT_PUBLIC_REOWN_PROJECT_ID!} network={network} next={next} />
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          or on a computer
          <span className="h-px flex-1 bg-border" />
        </div>
        <ConcordiumWalletSignIn next={next} />
      </div>
    );
  }

  if (getConcordium() && process.env.CONCORDIUM_MODE === "dev") {
    // Local stand-in mode (pnpm dev:local): a fresh, signed challenge each time.
    const request = await getDesk().workerProofRequest([]);
    return (
      <div className="flex flex-col gap-4 rounded-2xl border bg-card p-6">
        <p className="font-semibold">{alone ? "Development wallet" : "Or the development wallet"}</p>
        <p className="text-sm text-muted-foreground">Stands in for the Concordium ID App during local development.</p>
        <DevWallet action={signIn} request={JSON.stringify(request)} />
      </div>
    );
  }

  if (!alone) {
    return (
      <p className="px-1 text-sm text-muted-foreground">
        Concordium ID sign-in is opening soon. You&apos;ll be able to add it on My account for the Verified by Concordium
        badge.
      </p>
    );
  }
  return (
    <Alert>
      <AlertTitle>Sign-in is opening soon</AlertTitle>
      <AlertDescription>Workers will sign in with PayPal or Concordium ID.</AlertDescription>
    </Alert>
  );
}

async function SignInOptions({ searchParams }: { searchParams: Promise<{ next?: string; paypal?: string }> }) {
  const params = await searchParams;
  const next = safeNext(params.next);
  // Already signed in: nothing to do here.
  if (await workerFromSession()) redirect(next);
  const paypal = paypalLoginEnabled();
  const notice = PAYPAL_NOTICES[params.paypal ?? ""];
  return (
    <div className="flex flex-col gap-4">
      {notice && (
        <Alert>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      {paypal && <PayPalSignIn next={next} />}
      <ConcordiumOption next={next} alone={!paypal} />
    </div>
  );
}

export default function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string; paypal?: string }> }) {
  return (
    <main className="mx-auto grid w-full max-w-5xl flex-1 grid-cols-1 items-start gap-10 px-4 py-12 md:grid-cols-2 md:py-20">
      <div className="flex flex-col gap-6">
        <Eyebrow>Sign in to work</Eyebrow>
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">Your identity stays with you.</h1>
        <p className="text-lg leading-relaxed text-muted-foreground">
          Sign in with PayPal and get paid there. Add Concordium ID for the Verified by Concordium badge: a zero-knowledge
          proof of what some tasks need, like your age or country. You prove facts, not who you are.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">What Concordium ID shares</p>
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
      <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl border bg-card" />}>
        <SignInOptions searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
