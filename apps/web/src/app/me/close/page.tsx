import { RETENTION } from "@boreal/desk";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { CloseAccountForm } from "@/components/close-account-form";
import { Container, MoreLink, PageHero } from "@/components/page";
import { getDesk } from "@/server/desk";
import { workerFromSession } from "@/server/session";

export const metadata: Metadata = { title: "Close your account", robots: { index: false, follow: false } };

const DAYS = (ms: number) => ms / (24 * 60 * 60 * 1000);

/**
 * Closing an account, with everything it does said before the button: what is deleted, what
 * stays and why, what happens to agents, and that it can't be undone. Anything still moving for
 * the person is listed first, and the form only appears once nothing is.
 */
async function Closing() {
  const worker = await workerFromSession();
  if (!worker || worker.role !== "worker") redirect("/signin?next=/me/close");
  const check = await getDesk()
    .closingCheck(worker.workerId)
    .catch(() => null);
  if (!check) redirect("/signin?next=/me/close");

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-3">
        <h2 className="text-2xl font-light tracking-[-0.025em]">What closing does</h2>
        <ul className="flex flex-col gap-2 leading-relaxed text-muted-foreground [&_li]:ml-5 [&_li]:list-disc">
          <li>
            <span className="font-medium text-foreground">Deleted at once:</span> your sign-in (PayPal, and Concordium ID if you added it), your PayPal
            email, every payout account you connected, and anything you proved, such as your country.
          </li>
          {check.agents > 0 && (
            <li>
              <span className="font-medium text-foreground">
                Your {check.agents === 1 ? "agent stops" : `${check.agents} agents stop`} working:
              </span>{" "}
              {check.agents === 1 ? "its key is revoked" : "their keys are revoked"} and{" "}
              {check.savedPayPal > 0 ? `the ${check.savedPayPal === 1 ? "PayPal account" : "PayPal accounts"} you saved for them ${check.savedPayPal === 1 ? "is" : "are"} deleted, here and at PayPal` : "nothing more can be paid for"}
              . Any payment waiting for your approval is declined.
            </li>
          )}
          <li>
            <span className="font-medium text-foreground">Kept:</span>{" "}
            {check.history > 0
              ? `the record of the ${check.history === 1 ? "task" : `${check.history} tasks`} you worked on or posted, and the money that moved for them,`
              : "the record of any task and money,"}{" "}
            as amounts, hashes and a closed pseudonym that no longer leads to you. This record can&apos;t be edited or removed, so anyone can
            check a payment was right. Photos and files in results are deleted {DAYS(RETENTION.resultFilesMs)} days after their task is final, as
            for every account.
          </li>
          <li>
            <span className="font-medium text-foreground">It can&apos;t be undone.</span> If you sign in again later with the same PayPal account,
            you start a new, empty account: none of this one&apos;s history or agents comes back.
          </li>
        </ul>
      </section>

      {check.blockers.length > 0 ? (
        <section className="flex flex-col gap-3 rounded-2xl border p-5 md:p-6">
          <h2 className="text-xl font-light tracking-[-0.025em]">Not yet</h2>
          <p className="text-sm text-muted-foreground">Something is still moving for you. Closing now could leave money or work stuck, so it waits until:</p>
          <ul className="flex flex-col gap-2 text-sm [&_li]:ml-5 [&_li]:list-disc">
            {check.blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-x-6 gap-y-2 pt-1">
            <MoreLink href="/me?tab=work">My work</MoreLink>
            <MoreLink href="/me?tab=posted">Posted</MoreLink>
            <MoreLink href="/me?tab=payouts">Getting paid</MoreLink>
          </div>
        </section>
      ) : (
        <section className="flex flex-col gap-5 rounded-2xl border border-destructive/40 p-5 md:p-6">
          <h2 className="text-xl font-light tracking-[-0.025em]">Close your account</h2>
          <CloseAccountForm />
        </section>
      )}
    </div>
  );
}

export default function CloseAccountPage() {
  return (
    <main className="flex-1">
      <PageHero
        kicker="Your account"
        title="Close your account"
        lede="Read this first. Closing deletes what identifies you and can't be undone."
      />
      <Container className="max-w-3xl pb-16">
        <Suspense fallback={<div className="h-80 animate-pulse rounded-2xl bg-muted" />}>
          <Closing />
        </Suspense>
      </Container>
    </main>
  );
}
