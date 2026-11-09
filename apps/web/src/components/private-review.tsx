import { type PrivateInferenceProof, proofChecks } from "@boreal/brain";
import { CheckCircle2, ExternalLink, LockKeyhole, XCircle } from "lucide-react";

const VERIFIER = "https://github.com/nearai/nearai-cloud-verifier";
const short = (hex: string, head = 8, tail = 6) => (hex.length > head + tail + 1 ? `${hex.slice(0, head)}…${hex.slice(-tail)}` : hex);

/**
 * Under a verdict reviewed by private AI on NEAR AI Cloud: one line, and a panel that repeats
 * the proof's three checks (packages/brain/src/tee-proof.ts) on the recorded proof, with the
 * proof itself to download and check elsewhere.
 */
export function PrivateReviewNote({
  review,
  proof,
}: {
  review: { model: string; signingAddress: string; completionId: string } | null;
  proof?: PrivateInferenceProof | null;
}) {
  if (!review) return null;
  const line = (
    <span className="flex items-center gap-1.5">
      <LockKeyhole className="size-3.5 text-primary" aria-hidden />
      Reviewed by private AI on NEAR AI Cloud · signed by <span className="font-mono">{short(review.signingAddress, 6, 4)}</span>
    </span>
  );
  if (!proof) return <p className="text-xs text-muted-foreground">{line}</p>;

  const checks = proofChecks(proof);
  const allOk = checks.every((c) => c.ok);
  const detail: Record<(typeof checks)[number]["id"], { title: string; body: React.ReactNode }> = {
    covers: {
      title: "The signature covers this exact review",
      body: (
        <>
          request <span className="font-mono">{short(proof.requestSha256)}</span>, response{" "}
          <span className="font-mono">{short(proof.responseSha256)}</span> (SHA-256)
        </>
      ),
    },
    signature: {
      title: "Signed by the model's own key",
      body: (
        <>
          recovers to <span className="font-mono">{short(proof.signingAddress, 10, 6)}</span>
        </>
      ),
    },
    attestation: {
      title: "That key lives inside a TEE",
      body: (
        <>
          Intel TDX quote binds the key and our nonce <span className="font-mono">{short(proof.attestation.nonce)}</span>,{" "}
          {new Date(proof.attestation.checkedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC
        </>
      ),
    },
  };
  const download = `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(proof, null, 2))}`;

  return (
    <details className="group text-xs text-muted-foreground">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 [&::-webkit-details-marker]:hidden">
        {line}
        <span className={`flex items-center gap-1 font-medium ${allOk ? "text-primary" : "text-destructive"}`}>
          {allOk ? <CheckCircle2 className="size-3.5" aria-hidden /> : <XCircle className="size-3.5" aria-hidden />}
          {allOk ? "Proof checks out" : "Proof doesn't check out"}
          <span className="text-muted-foreground group-open:hidden">· show</span>
        </span>
      </summary>
      <div className="mt-3 flex flex-col gap-3 rounded-xl border bg-background/70 p-4">
        <ul className="flex flex-col gap-2.5">
          {checks.map((c) => (
            <li key={c.id} className="flex gap-2">
              {c.ok ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-label="passed" />
              ) : (
                <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-label="failed" />
              )}
              <div className="flex min-w-0 flex-col">
                <span className="font-medium text-foreground">{detail[c.id].title}</span>
                <span className="break-words">{c.problem ?? detail[c.id].body}</span>
              </div>
            </li>
          ))}
        </ul>
        <p>
          Model <span className="font-mono">{proof.model}</span> · completion <span className="font-mono">{short(proof.completionId, 10, 4)}</span>
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <a href={download} download={`private-review-proof-${proof.completionId}.json`} className="text-primary underline-offset-4 hover:underline">
            Download the proof
          </a>
          <a href={VERIFIER} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline">
            Check the quote with NEAR&apos;s verifier <ExternalLink className="size-3" aria-hidden />
          </a>
        </div>
      </div>
    </details>
  );
}
