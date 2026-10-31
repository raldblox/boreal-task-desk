import { CheckCircle2, XCircle } from "lucide-react";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Eyebrow } from "@/components/brand";

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
          ? "PayPal is holding the money, not charging it. Your agent finishes funding with fund_task; boreal takes the money only if the work passes review, and gives the hold back if it doesn't."
          : "Nothing was held or charged. Your agent can ask for a new payment link with fund_task."}
      </p>
      <p className="text-sm text-muted-foreground">You can close this tab.</p>
    </div>
  );
}

export default function PayPalReturnPage(props: Props) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-10 md:py-14">
      <Eyebrow>boreal.work escrow</Eyebrow>
      <Suspense fallback={<div className="h-44 animate-pulse rounded-2xl bg-muted" />}>
        <Outcome {...props} />
      </Suspense>
    </main>
  );
}
