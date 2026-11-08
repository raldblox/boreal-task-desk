import { REGISTRY_MCP_URL } from "@boreal/concordium";
import { BadgeCheck, FileJson } from "lucide-react";

import { CARD_URL, NETWORK } from "@/content/agent-guide";
import { verifiedBadge } from "@/server/registry";

// boreal's own Verified by Concordium badge. Shown only while the registry confirms the entry
// is active and pins the card this site serves; render inside <Suspense>.

/** A small pill linking to the registry's verdict, or nothing until boreal's badge checks out. */
export async function RegistryBadge() {
  const badge = await verifiedBadge();
  if (!badge) return null;
  return (
    <a
      href={`https://agent-registry-mcp.concordium.com/v1/check-badge/${badge}`}
      className="inline-flex w-fit items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-xs font-medium hover:bg-muted"
      title={`Concordium Agent Registry badge ${badge} on ${NETWORK}`}
    >
      <BadgeCheck className="size-3.5 text-primary" aria-hidden /> Verified by Concordium
      <span className="font-mono text-muted-foreground">{badge}</span>
    </a>
  );
}

/** For /agents: where boreal's own card is, and how an agent checks boreal with check_badge. */
export function RegistryListingNote() {
  return (
    <div className="flex flex-col gap-2 text-sm leading-relaxed text-muted-foreground">
      <p>
        boreal.work lists itself in the same registry. Its Agent Card is at{" "}
        <a href={CARD_URL} className="inline-flex items-center gap-1 break-all font-mono text-foreground underline-offset-4 hover:underline">
          <FileJson className="size-3.5 shrink-0 text-primary" aria-hidden />
          {CARD_URL.replace(/^https?:\/\//, "")}
        </a>
        , and the <code className="font-mono text-foreground">x-card-sha256</code> header is its hash. Your agent can check boreal.work
        is the real one by calling <code className="font-mono text-foreground">check_badge</code> on the registry&apos;s MCP server (
        <code className="break-all font-mono text-foreground">{REGISTRY_MCP_URL}</code>) with the badge in the card: the entry
        should be active, point at this card, and match its on-chain hash.
      </p>
    </div>
  );
}
