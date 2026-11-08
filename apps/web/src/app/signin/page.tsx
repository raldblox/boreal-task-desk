import type { Metadata } from "next";
import { Check, EyeOff, Wallet } from "lucide-react";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { signIn } from "@/app/actions";
import { Eyebrow } from "@/components/brand";
import { ConcordiumSignIn } from "@/components/concordium-sign-in";
import { ConcordiumWalletSignIn } from "@/components/concordium-wallet-sign-in";
import { DevWallet } from "@/components/worker-forms";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { gatedEnv, getAddons } from "@/server/addons";
import { demoMoney, getConcordium, getDesk } from "@/server/desk";
import { getIdAppVerifier } from "@/server/id-app";
import { paypalLoginEnabled } from "@/server/paypal-accounts";
import { workerFromSession } from "@/server/session";

export const metadata: Metadata = { title: "Sign in", robots: { index: false, follow: false } };


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
        boreal.work keeps a one-way code for your PayPal account, your PayPal email for payouts, and whether PayPal has verified
        the account. Never your password.
      </p>
    </div>
  );
}

/**
 * For people who already added Concordium ID on My account: a quiet way back in, with no pitch.
 * Concordium ID is offered and explained on My account (Integrations), never here.
 */
async function ConcordiumReturn({ next, open }: { next: string; open: boolean }) {
  let body: React.ReactNode = null;
  if (getIdAppVerifier()) {
    const network = gatedEnv().CONCORDIUM_NETWORK === "mainnet" ? "mainnet" : "testnet";
    body = (
      <>
        <ConcordiumSignIn projectId={gatedEnv().NEXT_PUBLIC_REOWN_PROJECT_ID!} network={network} next={next} />
        <ConcordiumWalletSignIn next={next} />
      </>
    );
  } else if (getConcordium() && gatedEnv().CONCORDIUM_MODE === "dev") {
    // Local stand-in mode (pnpm dev:local --addons concordium): a fresh, signed challenge each time.
    const request = await getDesk().workerProofRequest([]);
    body = (
      <>
        <p className="text-sm text-muted-foreground">Development wallet: stands in for the Concordium ID App locally.</p>
        <DevWallet action={signIn} request={JSON.stringify(request)} />
      </>
    );
  }
  if (!body) return null;
  return (
    <details open={open} className="group rounded-2xl border bg-card px-6 py-4 text-sm">
      <summary className="cursor-pointer text-muted-foreground marker:text-muted-foreground">
        Added Concordium ID to your account? Sign in with it
      </summary>
      <div className="mt-4 flex flex-col gap-3">{body}</div>
    </details>
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
      {paypal ? (
        <PayPalSignIn next={next} />
      ) : (
        <Alert>
          <AlertTitle>Sign-in isn&apos;t ready yet</AlertTitle>
          <AlertDescription>
            This site signs people in with Log in with PayPal, which isn&apos;t switched on here yet (PAYPAL_LOGIN and a
            pseudonym secret).
          </AlertDescription>
        </Alert>
      )}
      {getAddons().on("concordium") && <ConcordiumReturn next={next} open={!paypal} />}
    </div>
  );
}

export default function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string; paypal?: string }> }) {
  return (
    <main className="mx-auto grid w-full max-w-[1280px] flex-1 grid-cols-1 items-start gap-12 px-5 py-14 sm:px-8 md:grid-cols-[1.1fr_1fr] md:py-24 lg:gap-20 lg:px-12">
      <div className="flex flex-col gap-6">
        <Eyebrow>Sign in to work</Eyebrow>
        <h1 className="text-4xl font-light tracking-[-0.035em] sm:text-5xl text-balance sm:text-4xl">Log in with PayPal. Get paid there.</h1>
        <p className="text-lg leading-relaxed text-muted-foreground">
          Your PayPal account is your boreal.work account: no new password, and passed tasks pay out to it with PayPal Payouts.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">What boreal.work keeps</p>
            <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
              {[
                "A one-way code for your PayPal account, so it's always the same boreal.work account",
                "Your PayPal email, only to pay you",
                "Whether PayPal has verified your account",
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
              {["Your PayPal password", "Your card or bank details", "Your PayPal account ID itself"].map((item) => (
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
