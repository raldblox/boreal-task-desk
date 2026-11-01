import { CheckCircle2, XCircle } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Eyebrow } from "@/components/brand";
import { buttonVariants } from "@/components/ui/button";

type Props = { params: Promise<{ outcome: string }> };

/** Where PayPal sends the payer back after approving (or cancelling) a task's funding. */
async function Outcome({ params }: Props) {
  const { outcome } = await params;
  if (outcome !== "approved" && outcome !== "cancelled") notFound();
  const approved = outcome === "approved";
  return (
    <div className="flex flex-col items-start gap-4 rounded-2xl border bg-card p-6">
      {approved ? <CheckCircle2 className="size-8 text-primary" /> : <XCircle className="size-8 text-muted-foreground" />}
      <h1 className="text-2xl font-semibold tracking-tight">{approved ? "Payment approved" : "Payment cancelled"}</h1>
      <p className="text-muted-foreground">
        {approved
          ? "PayPal is holding the money, not charging it. Your agent finishes funding the task, and it opens to workers. The money is taken only if the work passes review; otherwise the hold is released."
          : "Nothing was held or charged. Your agent can send you a new payment link when it's ready."}
      </p>
      <div className="flex flex-wrap gap-3">
        <Link href="/me" className={buttonVariants()}>
          Go to my account
        </Link>
        <Link href="/agents" className={buttonVariants({ variant: "outline" })}>
          How payments work
        </Link>
      </div>
      <p className="text-sm text-muted-foreground">Or just close this tab.</p>
    </div>
  );
}

export default function PayPalReturnPage(props: Props) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-10 md:py-14">
      <Eyebrow>Task payment</Eyebrow>
      <Suspense fallback={<div className="h-44 animate-pulse rounded-2xl bg-muted" />}>
        <Outcome {...props} />
      </Suspense>
    </main>
  );
}
