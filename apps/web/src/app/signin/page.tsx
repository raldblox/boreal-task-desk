import type { Metadata } from "next";
import { EyeOff, Plus } from "lucide-react";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { signIn } from "@/app/actions";
import { RelatedQuestions } from "@/components/related-questions";
import { PayPalLoginButton } from "@/components/paypal-brand";
import { Eyebrow, PointMark } from "@/components/brand";
import { ConcordiumSignIn } from "@/components/concordium-sign-in";
import { ConcordiumWalletSignIn } from "@/components/concordium-wallet-sign-in";
import { ZkPassportSignIn } from "@/components/zkpassport-sign-in";
import { passportReady } from "@/server/zkpassport";
import { DevWallet } from "@/components/worker-forms";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
    <div className="flex flex-col gap-5 rounded-2xl border bg-card p-6 sm:p-8">
      <div className="flex flex-col gap-1">
        <p className="text-xl font-light tracking-[-0.015em]">Log in with PayPal</p>
        <p className="text-sm text-muted-foreground">
          {demoMoney() ? "PayPal sandbox accounts only, on testnet." : "Free, and you're paid to the same account."}
        </p>
      </div>
      <PayPalLoginButton next={next} className="w-full" />
      <p className="text-sm text-muted-foreground">
        Claiming needs a PayPal-verified account. Not verified yet? Use your passport or Concordium ID below.
      </p>
    </div>
  );
}

/** One of the other ways in: a closed row that opens in place. */
function OtherWay({ title, open, children }: { title: string; open: boolean; children: React.ReactNode }) {
  return (
    <details open={open} className="group rounded-2xl border bg-card text-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-4 font-medium [&::-webkit-details-marker]:hidden">
        {title}
        <Plus className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-45" aria-hidden />
      </summary>
      <div className="flex flex-col gap-3 px-6 pb-6">{children}</div>
    </details>
  );
}

const STEP_LINK = "text-primary underline-offset-4 hover:underline";

/**
 * The other way in for verified people: when PayPal login fails, or PayPal hasn't verified the
 * account. Both Concordium paths prove a real person checked by an identity provider, and neither
 * needs CCD from the person: boreal.work pays the network fee for recording a proof.
 */
async function ConcordiumReturn({ next, open }: { next: string; open: boolean }) {
  let body: React.ReactNode = null;
  if (getIdAppVerifier()) {
    const network = gatedEnv().CONCORDIUM_NETWORK === "mainnet" ? "mainnet" : "testnet";
    body = (
      <>
        <p className="text-muted-foreground">
          Prove you&apos;re a real, verified person without telling boreal.work who you are.
        </p>
        <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-muted-foreground">
          <li>
            Get the Concordium ID App (free) on{" "}
            <a href="https://play.google.com/store/apps/details?id=com.idwallet.app" target="_blank" rel="noreferrer" className={STEP_LINK}>
              Android
            </a>{" "}
            or{" "}
            <a href="https://apps.apple.com/app/concordium-id/id6746754485" target="_blank" rel="noreferrer" className={STEP_LINK}>
              iPhone
            </a>
            .
          </li>
          <li>Verify once with your passport or national ID and a selfie. An identity provider checks them; boreal.work never sees them.</li>
          <li>Scan the code below and approve.</li>
        </ol>
        <p className="text-muted-foreground">No CCD needed. boreal.work pays the network fee.</p>
        <ConcordiumSignIn projectId={gatedEnv().NEXT_PUBLIC_REOWN_PROJECT_ID!} network={network} next={next} />
        <p className="mt-2 text-muted-foreground">
          Using Concordium Wallet for Web? Sign a message instead. Free, and nothing goes on chain.
        </p>
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
    <OtherWay title="Sign in with Concordium ID" open={open}>
      {body}
    </OtherWay>
  );
}

/**
 * A third way in for verified people: the passport's chip, proven on the phone with ZKPassport.
 * Free for the person and for boreal.work; nothing goes on any chain.
 */
function PassportSignIn({ next, open }: { next: string; open: boolean }) {
  if (!passportReady()) return null;
  return (
    <OtherWay title="Sign in with your passport (ZKPassport)" open={open}>
        <p className="text-muted-foreground">
          Your phone reads your passport&apos;s chip and proves you&apos;re 18 or older, your nationality, and that you&apos;re one
          person. boreal.work sees the proof, never the passport.
        </p>
        <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-muted-foreground">
          <li>
            Get the free ZKPassport app (about 400 MB) from{" "}
            <a href="https://zkpassport.id" target="_blank" rel="noreferrer" className={STEP_LINK}>
              zkpassport.id
            </a>
            . Your phone needs NFC.
          </li>
          <li>
            A passport with the chip symbol on its cover. Philippine ePassports work; the PhilSys card doesn&apos;t.
          </li>
          <li>Scan the code below, hold your passport to the phone, and take a selfie.</li>
        </ol>
        <p className="text-muted-foreground">
          Free. Your name and birth date become a one-way code at once, so one person keeps one account. Neither is stored.
        </p>
        <ZkPassportSignIn next={next} />
    </OtherWay>
  );
}

async function SignInOptions({ searchParams }: { searchParams: Promise<{ next?: string; paypal?: string }> }) {
  const params = await searchParams;
  const next = safeNext(params.next);
  // Already signed in: nothing to do here.
  // A session whose worker no longer exists (a reset database) would bounce between here and a
  // page that fails, so only a real worker skips sign-in.
  const session = await workerFromSession();
  if (session && (await getDesk().getWorker(session).catch(() => null))) redirect(next);
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
          <AlertTitle>Log in with PayPal is off on this site</AlertTitle>
          <AlertDescription>Sign in with one of the ways below.</AlertDescription>
        </Alert>
      )}
      <PassportSignIn next={next} open={!paypal} />
      {getAddons().on("concordium") && <ConcordiumReturn next={next} open={!paypal} />}
    </div>
  );
}

export default function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string; paypal?: string }> }) {
  return (
    <main className="mx-auto grid w-full max-w-[1280px] flex-1 grid-cols-1 items-start gap-12 px-5 py-14 sm:px-8 md:grid-cols-[1.1fr_1fr] md:py-24 lg:gap-20 lg:px-12">
      <div className="flex flex-col gap-6">
        <Eyebrow>Sign in</Eyebrow>
        <h1 className="text-4xl font-light tracking-[-0.035em] text-balance sm:text-5xl">Your PayPal is your account.</h1>
        <p className="text-lg leading-relaxed text-muted-foreground">
          No new password. Claim paid tasks, and every passed result pays out to the PayPal you log in with.
        </p>
        <div className="grid gap-6 border-t pt-6 sm:grid-cols-2">
          <div className="flex flex-col gap-3">
            <p className="text-sm font-medium">What boreal.work keeps</p>
            <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
              {["A one-way code for your account", "Your PayPal email, only to pay you", "Whether PayPal has verified you"].map((item) => (
                <li key={item} className="flex gap-2.5">
                  <PointMark className="mt-1.5 h-2.5 w-1.25 shrink-0 text-primary" /> {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-3">
            <p className="text-sm font-medium">What it never sees</p>
            <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
              {["Your PayPal password", "Your card or bank details", "Your PayPal account ID"].map((item) => (
                <li key={item} className="flex gap-2.5">
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
      <RelatedQuestions ids={["who-can-take-tasks", "what-you-keep", "no-concordium-id", "contact"]} className="max-w-2xl md:col-span-2" />
    </main>
  );
}
