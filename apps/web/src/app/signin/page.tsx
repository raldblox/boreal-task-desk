import type { Metadata } from "next";
import { Check, EyeOff} from "lucide-react";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { signIn } from "@/app/actions";
import { RelatedQuestions } from "@/components/related-questions";
import { PayPalLoginButton } from "@/components/paypal-brand";
import { Eyebrow } from "@/components/brand";
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
    <div className="flex flex-col gap-5 rounded-2xl border bg-card p-6 shadow-sm">
      <p className="text-sm text-muted-foreground">
        {demoMoney() ? "PayPal sandbox accounts only, on testnet." : "You're paid to the PayPal account you log in with."}
      </p>
      <PayPalLoginButton next={next} className="w-full" />
      <p className="text-sm text-muted-foreground">
        Free. To claim tasks, PayPal must have verified your account (in PayPal&apos;s settings, also free); otherwise verify with
        one of the ways below.
      </p>
      <p className="text-xs text-muted-foreground">
        boreal.work keeps a one-way code for your PayPal account, your PayPal email for payouts, and whether PayPal has verified
        the account. Never your password.
      </p>
    </div>
  );
}

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
          Concordium ID proves you&apos;re a real, verified person without telling boreal.work who you are. Only verified people
          work here, so this is the way in if PayPal didn&apos;t work for you or hasn&apos;t verified your account.
        </p>
        <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-muted-foreground">
          <li>
            Get the Concordium ID App (free) on{" "}
            <a href="https://play.google.com/store/apps/details?id=com.idwallet.app" target="_blank" rel="noreferrer" className="text-primary underline-offset-4 hover:underline">
              Android
            </a>{" "}
            or{" "}
            <a href="https://apps.apple.com/app/concordium-id/id6746754485" target="_blank" rel="noreferrer" className="text-primary underline-offset-4 hover:underline">
              iPhone
            </a>
            .
          </li>
          <li>Verify once in the app with your passport or national ID and a selfie (free). An identity provider checks them; boreal.work never sees them.</li>
          <li>Scan the code below with the app and approve.</li>
        </ol>
        <p className="text-muted-foreground">
          You don&apos;t need any CCD: proving yourself is free for you, and boreal.work pays the small network fee for recording it.
        </p>
        <ConcordiumSignIn projectId={gatedEnv().NEXT_PUBLIC_REOWN_PROJECT_ID!} network={network} next={next} />
        <p className="mt-2 text-muted-foreground">
          Already have a Concordium account in Concordium Wallet for Web (Chrome)? Sign in by signing a message. It&apos;s free
          for you and for boreal.work: nothing is recorded on chain, and the chain only opens an account on an identity a provider
          has checked.
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
    <details open={open} className="group rounded-2xl border bg-card px-6 py-4 text-sm">
      <summary className="cursor-pointer text-muted-foreground marker:text-muted-foreground">
        No PayPal, or PayPal hasn&apos;t verified you? Sign in with Concordium ID
      </summary>
      <div className="mt-4 flex flex-col gap-3">{body}</div>
    </details>
  );
}

/**
 * A third way in for verified people: the passport's chip, proven on the phone with ZKPassport.
 * Free for the person and for boreal.work; nothing goes on any chain.
 */
function PassportSignIn({ next, open }: { next: string; open: boolean }) {
  if (!passportReady()) return null;
  return (
    <details open={open} className="group rounded-2xl border bg-card px-6 py-4 text-sm">
      <summary className="cursor-pointer text-muted-foreground marker:text-muted-foreground">
        Have a passport with a chip? Sign in with ZKPassport
      </summary>
      <div className="mt-4 flex flex-col gap-3">
        <p className="text-muted-foreground">
          Your phone reads the chip in your passport and proves you&apos;re 18 or older, your nationality, and that you&apos;re one
          person. boreal.work checks the proof; it never sees your passport or photo.
        </p>
        <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-muted-foreground">
          <li>
            Get the free ZKPassport app (about 400 MB) from{" "}
            <a href="https://zkpassport.id" target="_blank" rel="noreferrer" className="text-primary underline-offset-4 hover:underline">
              zkpassport.id
            </a>
            . Your phone needs NFC and must pass the app&apos;s device check; some rooted or older phones don&apos;t.
          </li>
          <li>
            You need a passport or ID card with a chip: an ePassport has the chip symbol on its cover. Philippine ePassports
            work; the PhilSys ID card doesn&apos;t.
          </li>
          <li>Scan the code below with the app, hold your passport to the phone, and take a quick selfie for the face check.</li>
        </ol>
        <p className="text-muted-foreground">
          It costs nothing, for you or for boreal.work. Your name and birth date are turned into a one-way code at once, so one
          person keeps one account, and are never stored.
        </p>
        <ZkPassportSignIn next={next} />
      </div>
    </details>
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
          <AlertTitle>Sign-in isn&apos;t ready yet</AlertTitle>
          <AlertDescription>
            This site signs people in with Log in with PayPal, which isn&apos;t switched on here yet (PAYPAL_LOGIN and a
            pseudonym secret).
          </AlertDescription>
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
      <RelatedQuestions ids={["who-can-take-tasks", "what-you-keep", "no-concordium-id", "contact"]} className="max-w-2xl md:col-span-2" />
    </main>
  );
}
