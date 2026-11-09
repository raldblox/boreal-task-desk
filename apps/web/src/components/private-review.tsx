import { LockKeyhole } from "lucide-react";

/** One line under a verdict reviewed in a TEE on NEAR AI Cloud. The full proof is in the task's trail. */
export function PrivateReviewNote({ review }: { review: { model: string; signingAddress: string; completionId: string } | null }) {
  if (!review) return null;
  const signer = `${review.signingAddress.slice(0, 6)}…${review.signingAddress.slice(-4)}`;
  return (
    <p
      className="flex items-center gap-1.5 text-xs text-muted-foreground"
      title={`Model ${review.model} · completion ${review.completionId} · signed in a TEE by ${review.signingAddress}`}
    >
      <LockKeyhole className="size-3.5 text-primary" aria-hidden />
      Reviewed privately on NEAR AI Cloud · TEE-signed by <span className="font-mono">{signer}</span>
    </p>
  );
}
