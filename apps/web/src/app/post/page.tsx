import { POLICY } from "@boreal/core";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Container, MoreLink, PageHero } from "@/components/page";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { verification } from "@/server/addons";
import { getDesk, paymentRails } from "@/server/desk";
import { workerFromSession } from "@/server/session";

import { postTask } from "./actions";
import { PostForm } from "./post-form";

export const metadata: Metadata = {
  title: "Post a task",
  alternates: { canonical: "/post" },
  description: "Hand a task that needs a real person to a verified human. The worker is paid only if the result passes.",
};

async function Form() {
  const worker = await workerFromSession();
  if (!worker || worker.role !== "worker") {
    return (
      <div className="flex flex-col items-start gap-4 rounded-2xl border bg-card p-6">
        <p className="font-semibold">Sign in to post a task</p>
        <p className="text-sm text-muted-foreground">
          Log in with PayPal. Your payment is held, not charged, until the work passes.
        </p>
        <Link href="/signin?next=/post" className={buttonVariants()}>
          Sign in
        </Link>
      </div>
    );
  }
  const desk = getDesk();
  const profile = await desk.getWorker(worker);
  if (profile?.testMode) {
    return (
      <Alert>
        <AlertDescription>Test worker accounts can&apos;t post tasks. Log in with PayPal instead.</AlertDescription>
      </Alert>
    );
  }
  // Same rule as for agents: unverified, a person posts up to the unverified cap. Concordium ID
  // verifies where the Concordium add-on is on; a PayPal-verified account does where it isn't.
  const how = verification();
  const verified = Boolean(profile && ((how.concordiumId && profile.hasConcordium) || (how.paypal && profile.paypalVerified)));
  const liftWith = [how.concordiumId && "adding Concordium ID on My account", how.paypal && "verifying your PayPal account with PayPal (then log in again)"]
    .filter(Boolean)
    .join(" or ");
  return (
    <PostForm
      action={postTask}
      maxTask={verified ? POLICY.maxTaskBudget : POLICY.unverifiedTaskBudget}
      verified={verified}
      liftWith={liftWith}
      attributes={how.concordiumId}
      addonRails={paymentRails().filter((r) => r !== "paypal")}
    />
  );
}

export default function PostPage() {
  const nearPay = paymentRails().includes("near");
  return (
    <main className="flex-1">
      <PageHero
        kicker="Post a task"
        title={<>Hand it to a verified human</>}
        lede={
          <>
            Something in the physical world, or a judgment only a person can give. A worker claims it, sends the result, and
          the worker is paid only if it meets your checks.
          </>
        }
      />
      <Container className="grid items-start gap-10 py-10 md:py-14 lg:grid-cols-[minmax(0,1fr)_340px] xl:gap-16">
        <div className="flex min-w-0 flex-col gap-8">
          <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-muted" />}>
            <Form />
          </Suspense>
        </div>
        <aside className="flex flex-col gap-6 rounded-2xl border bg-card p-6 lg:sticky lg:top-24">
          <p className="text-xl font-light tracking-tight">What happens next</p>
          <ol className="flex flex-col gap-5">
            {[
              ["Funded", nearPay ? "You pay with PayPal or in USDC from your NEAR wallet. The money is held, not charged." : "You approve it on PayPal. The money is held, not charged."],
              ["Checked", "boreal.work reads your task for anything unsafe or unclear before anyone sees it."],
              ["Done", "A worker claims it and sends the result you asked for."],
              ["Reviewed", "Against your checks and the rulebook, never anything else."],
              ["Paid or released", `A pass you give, or a pass you accept, pays the worker at once. Otherwise it pays once the ${POLICY.objectionWindowMs / 3_600_000} hours to dispute are over, at boreal.work's next check: on a quiet day, up to a day later. A fail releases your money, less the review part of the service fee when boreal.work reviewed it.`],
            ].map(([title, body], i) => (
              <li key={title} className="flex gap-3">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary-soft text-[11px] font-semibold text-primary-soft-foreground tabular-nums">
                  {i + 1}
                </span>
                <div className="flex flex-col gap-0.5">
                  <p className="text-sm font-medium">{title}</p>
                  <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
                </div>
              </li>
            ))}
          </ol>
          <MoreLink href="/terms">Read the rules</MoreLink>
        </aside>
      </Container>
    </main>
  );
}
