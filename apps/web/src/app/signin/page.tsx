import type { Metadata } from "next";
import { ChevronDown, EyeOff } from "lucide-react";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { signIn } from "@/app/actions";
import { Eyebrow, PointMark } from "@/components/brand";
import { ConcordiumSignIn } from "@/components/concordium-sign-in";
import { ConcordiumWalletSignIn } from "@/components/concordium-wallet-sign-in";
import { PAGE_TOP } from "@/components/page";
import { PayPalLoginButton } from "@/components/paypal-brand";
import { RelatedQuestions } from "@/components/related-questions";
import { DevWallet } from "@/components/worker-forms";
import { ZkPassportSignIn } from "@/components/zkpassport-sign-in";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { gatedEnv, getAddons } from "@/server/addons";
import { demoMoney, getConcordium, getDesk } from "@/server/desk";
import { getIdAppVerifier } from "@/server/id-app";
import { paypalLoginEnabled } from "@/server/paypal-accounts";
import { workerFromSession } from "@/server/session";
import { passportReady } from "@/server/zkpassport";

export const metadata: Metadata = { title: "Sign in", robots: { index: false, follow: false } };

/** Where to go after signing in: only a path on this site. */
function safeNext(next: string | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/tasks";
}

const PAYPAL_NOTICES: Record<string, string> = {
  failed: "PayPal didn't finish signing you in. Try again.",
  cancelled: "You cancelled on PayPal. Nothing changed.",
  off: "Log in with PayPal isn't on here. Use one of the other ways.",
};

/**
 * The ways in this site offers right now, so every sentence on the page matches the buttons.
 * PayPal needs its login switched on; Concordium needs the add-on and either the ID App verifier
 * or (locally) the stand-in wallet; the passport needs ZKPassport configured.
 */
function waysIn() {
  const concordium = getAddons().on("concordium") && Boolean(getIdAppVerifier() || (getConcordium() && gatedEnv().CONCORDIUM_MODE === "dev"));
  return { paypal: paypalLoginEnabled(), concordium, passport: passportReady() };
}

function list(words: string[]): string {
  return words.length < 2 ? (words[0] ?? "") : `${words.slice(0, -1).join(", ")} or ${words.at(-1)}`;
}

/** A thin "or" between ways in. */
function Or() {
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground" aria-hidden>
      <span className="h-px flex-1 bg-border" />
      or
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

const STEP_LINK = "text-primary underline-offset-4 hover:underline";

/** Concordium: the ID App on a phone; the Wallet for Web on a computer; the stand-in locally. */
async function ConcordiumWay({ next }: { next: string }) {
  if (getIdAppVerifier()) {
    const network = gatedEnv().CONCORDIUM_NETWORK === "mainnet" ? "mainnet" : "testnet";
    return (
      <div className="flex flex-col gap-1">
        <ConcordiumSignIn projectId={gatedEnv().NEXT_PUBLIC_REOWN_PROJECT_ID!} network={network} next={next} pill />
        <ConcordiumWalletSignIn next={next} quiet />
      </div>
    );
  }
  // Local stand-in mode (pnpm dev:local --addons concordium): a fresh, signed challenge each time.
  const request = await getDesk().workerProofRequest([]);
  return (
    <div className="flex flex-col gap-2 rounded-xl border p-4">
      <p className="text-sm text-muted-foreground">Development wallet: stands in for Concordium ID locally.</p>
      <DevWallet action={signIn} request={JSON.stringify(request)} />
    </div>
  );
}

async function SignInCard({ searchParams }: { searchParams: Promise<{ next?: string; paypal?: string }> }) {
  const params = await searchParams;
  const next = safeNext(params.next);
  // Already signed in: nothing to do here. A session whose worker no longer exists (a reset
  // database) would bounce between here and a page that fails, so only a real worker skips it.
  const session = await workerFromSession();
  if (session && (await getDesk().getWorker(session).catch(() => null))) redirect(next);
  const ways = waysIn();
  const notice = PAYPAL_NOTICES[params.paypal ?? ""];
  const buttons = [
    ways.paypal && (
      <div key="paypal" className="flex flex-col gap-2">
        <PayPalLoginButton next={next} className="h-12 w-full" />
        <p className="text-center text-xs text-muted-foreground">
          {demoMoney() ? "PayPal sandbox accounts, on testnet." : "To claim tasks, PayPal must have verified the account."}
        </p>
      </div>
    ),
    ways.concordium && <ConcordiumWay key="concordium" next={next} />,
    ways.passport && <ZkPassportSignIn key="passport" next={next} pill />,
  ].filter(Boolean);
  return (
    <div className="flex flex-col gap-5 rounded-2xl border bg-card/90 p-6 backdrop-blur-md sm:p-8">
      {notice && (
        <Alert>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      {buttons.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sign-in isn&apos;t switched on here yet.</p>
      ) : (
        buttons.flatMap((button, i) => (i === 0 ? [button] : [<Or key={`or-${i}`} />, button]))
      )}
      {(ways.concordium || ways.passport) && (
        <details className="fold group border-t pt-4">
          <summary className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
            <ChevronDown className="size-4 -rotate-90 transition-transform duration-300 group-open:rotate-0" aria-hidden />
            First time? What you need
          </summary>
          <div className="mt-4 flex flex-col gap-4 text-sm text-muted-foreground">
            {ways.concordium && (
              <div className="flex flex-col gap-1.5">
                <p className="font-medium text-foreground">Concordium ID</p>
                <p>
                  The free Concordium ID App on{" "}
                  <a href="https://play.google.com/store/apps/details?id=com.idwallet.app" target="_blank" rel="noreferrer" className={STEP_LINK}>
                    Android
                  </a>{" "}
                  or{" "}
                  <a href="https://apps.apple.com/app/concordium-id/id6746754485" target="_blank" rel="noreferrer" className={STEP_LINK}>
                    iPhone
                  </a>
                  . Verify once with your passport or national ID and a selfie; the identity provider checks them, and boreal.work never
                  sees them. Then scan the code here and approve.
                </p>
              </div>
            )}
            {ways.passport && (
              <div className="flex flex-col gap-1.5">
                <p className="font-medium text-foreground">Passport</p>
                <p>
                  The free ZKPassport app from{" "}
                  <a href="https://zkpassport.id" target="_blank" rel="noreferrer" className={STEP_LINK}>
                    zkpassport.id
                  </a>{" "}
                  on a phone with NFC, and a passport with the chip symbol on its cover (Philippine ePassports work; the PhilSys card
                  doesn&apos;t).
                </p>
              </div>
            )}
          </div>
        </details>
      )}
    </div>
  );
}

/** The left column: what signing in is, and what boreal.work keeps, for the ways that are on. */
function Intro() {
  const ways = waysIn();
  const names = [ways.paypal && "PayPal", ways.concordium && "Concordium ID", ways.passport && "your passport"].filter((x): x is string => Boolean(x));
  const keeps = ["A one-way code for your account", ...(ways.paypal ? ["Your PayPal email, only to pay you"] : []), "Whether you're a verified person"];
  const never = [
    "A password: there isn't one",
    ...(ways.concordium || ways.passport ? ["Your ID documents or selfie"] : []),
    ...(ways.paypal ? ["Your card or bank details"] : []),
  ];
  return (
    <div className="flex flex-col gap-6">
      <Eyebrow>Sign in</Eyebrow>
      <h1 className="text-4xl font-light tracking-[-0.035em] text-balance sm:text-5xl">Only verified people work here.</h1>
      <p className="max-w-xl text-lg leading-relaxed text-muted-foreground">
        {names.length > 0
          ? `Sign in with ${list(names)}. Each proves you're a real person, costs nothing, and needs no new password.`
          : "Sign-in isn't switched on here yet."}
      </p>
      <div className="grid gap-6 border-t pt-6 sm:grid-cols-2">
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium">What boreal.work keeps</p>
          <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
            {keeps.map((item) => (
              <li key={item} className="flex gap-2.5">
                <PointMark className="mt-1.5 h-2.5 w-1.25 shrink-0 text-primary" /> {item}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium">What it never sees</p>
          <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
            {never.map((item) => (
              <li key={item} className="flex gap-2.5">
                <EyeOff className="mt-0.5 size-4 shrink-0" /> {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export default function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string; paypal?: string }> }) {
  return (
    <main
      className={`mx-auto grid w-full max-w-[1280px] flex-1 grid-cols-1 items-start gap-12 px-5 pb-14 sm:px-8 md:grid-cols-[1.1fr_minmax(0,26rem)] md:pb-24 lg:gap-24 lg:px-12 ${PAGE_TOP}`}
    >
      <Intro />
      <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl border bg-card" />}>
        <SignInCard searchParams={searchParams} />
      </Suspense>
      <RelatedQuestions ids={["who-can-take-tasks", "what-you-keep", "no-concordium-id", "contact"]} className="max-w-2xl md:col-span-2" />
    </main>
  );
}
