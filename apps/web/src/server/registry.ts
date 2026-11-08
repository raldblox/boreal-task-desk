import "server-only";

import { BadgeError, registryBadgeVerdict } from "@boreal/concordium";
import { cacheLife } from "next/cache";

import { agentCardBytes } from "@/content/agent-card";
import { CARD_URL, LIVE_SITE, NETWORK, SITE } from "@/content/agent-guide";

import { gatedEnv } from "./addons";
import { getRails } from "./desk";

// boreal.work's own listing in Concordium's Agent Registry: the card this deployment serves,
// and whether the registry agrees with it. BOREAL_REGISTRY_BADGE (the badge's token address)
// and BOREAL_REGISTRY_OWNER (the account that registered it) are set once boreal is registered.

/** boreal's own badge, when this deployment has one. */
export function ownBadge(): { token: string; owner: string } | null {
  const token = gatedEnv().BOREAL_REGISTRY_BADGE?.trim();
  const owner = gatedEnv().BOREAL_REGISTRY_OWNER?.trim();
  return token && owner ? { token, owner } : null;
}

let served: { body: string; sha256: string } | undefined;

/** The card this deployment serves, built once per process. */
export function servedCard(): { body: string; sha256: string } {
  served ??= agentCardBytes({
    site: SITE,
    liveSite: LIVE_SITE,
    network: NETWORK,
    x402: "concordium" in getRails(),
    badge: ownBadge(),
    // Listing A2A changes the pinned bytes: turn it on together with the new on-chain hash.
    a2a: process.env.A2A_IN_CARD === "1",
  });
  return served;
}

export type Listing =
  | { state: "unregistered" }
  | { state: "verified"; badge: string }
  | { state: "mismatch"; badge: string; detail: string }
  | { state: "unknown"; badge: string; detail: string };

/** Asks the registry (check_badge) whether boreal's entry is active and pins the card served here. */
export async function registryListing(): Promise<Listing> {
  const badge = ownBadge();
  if (!badge) return { state: "unregistered" };
  try {
    const verdict = await registryBadgeVerdict(badge.token, NETWORK);
    const checks = verdict.checks ?? {};
    const local = servedCard().sha256;
    const pinned = verdict.on_chain?.metadata_hash_hex;
    if (!checks.on_chain_agent_found) return { state: "mismatch", badge: badge.token, detail: `The badge isn't registered on ${NETWORK}` };
    if (!checks.status_active) return { state: "mismatch", badge: badge.token, detail: "The registry entry has been revoked" };
    if (verdict.on_chain?.agent_uri !== CARD_URL) {
      return { state: "mismatch", badge: badge.token, detail: `The entry points at ${verdict.on_chain?.agent_uri ?? "no card"}, not ${CARD_URL}` };
    }
    if (pinned !== local || !checks.hash_matches_on_chain) {
      return { state: "mismatch", badge: badge.token, detail: `On-chain hash ${pinned?.slice(0, 12) ?? "none"}… differs from the served card ${local.slice(0, 12)}…; pin the new hash` };
    }
    return { state: "verified", badge: badge.token };
  } catch (error) {
    if (!(error instanceof BadgeError)) console.error("[registry] check_badge failed", error);
    return { state: "unknown", badge: badge.token, detail: error instanceof BadgeError ? error.message : "The Agent Registry didn't answer" };
  }
}

/** boreal's badge when it checks out (else null), cached for an hour; pages show "Verified by Concordium" with it. */
export async function verifiedBadge(): Promise<string | null> {
  "use cache";
  cacheLife("hours");
  const listing = await registryListing();
  return listing.state === "verified" ? listing.badge : null;
}
