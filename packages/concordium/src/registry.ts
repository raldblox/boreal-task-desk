import {
  AccountAddress,
  type AccountTransactionSignature,
  type ConcordiumGRPCClient,
  tokenAddressFromBase58,
  verifyMessageSignature,
} from "@concordium/web-sdk";
import { ConcordiumGRPCNodeClient, credentials } from "@concordium/web-sdk/nodejs";

// Verified by Concordium: checks an agent's badge in Concordium's Agent Registry, and that
// the person linking it controls the account that owns it. The registry only says who owns
// an entry; the badge string itself is public, so the owner proves control by signing a
// message with that account's keys.

export const REGISTRY_MCP_URL = "https://agent-registry-mcp.concordium.com/mcp";

export type RegistryNetwork = "testnet" | "mainnet";

export class BadgeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BadgeError";
  }
}

export interface BadgeCheck {
  tokenAddress: string;
  ownerAccount: string;
  agentUri: string | null;
}

type Fetch = typeof fetch;

/** Calls one tool on the registry's MCP server (stateless JSON-RPC over HTTP). */
async function registryTool(name: string, args: Record<string, unknown>, fetchImpl: Fetch): Promise<unknown> {
  const res = await fetchImpl(REGISTRY_MCP_URL, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new BadgeError(`the Agent Registry answered ${res.status}; try again`);
  const text = await res.text();
  const line = text.split("\n").find((l) => l.startsWith("data:"));
  const body = JSON.parse(line ? line.slice(5) : text) as {
    result?: { content?: { text?: string }[]; isError?: boolean };
    error?: { message?: string };
  };
  const out = body.result?.content?.[0]?.text;
  if (body.error || body.result?.isError || !out) throw new BadgeError("that badge isn't in the Agent Registry");
  return JSON.parse(out);
}

/** What the registry's `check_badge` says about one badge (the fields boreal reads). */
export interface BadgeVerdict {
  token_address?: string;
  agent_uri?: string;
  card_sha256?: string;
  on_chain?: { owner_account?: string; status?: string; agent_uri?: string; metadata_hash_hex?: string };
  checks?: { on_chain_agent_found?: boolean; status_active?: boolean; card_fetched?: boolean; hash_matches_on_chain?: boolean };
  badge_valid?: boolean;
  issues?: { severity?: string; field?: string; message?: string }[];
}

const BADGE_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{8,64}$/;

/** The registry's raw verdict on a badge, without judging it. */
export async function registryBadgeVerdict(badge: string, network: RegistryNetwork, fetchImpl: Fetch = fetch): Promise<BadgeVerdict> {
  const tokenAddress = badge.trim();
  if (!BADGE_PATTERN.test(tokenAddress)) throw new BadgeError("a badge is a base58 token address, like Mf22soLh1NuZYFgBK8iSs");
  return (await registryTool("check_badge", { id: tokenAddress, network }, fetchImpl)) as BadgeVerdict;
}

/** Looks a badge up in the registry and requires it to be active, with a card matching its on-chain hash. */
export async function checkRegistryBadge(badge: string, network: RegistryNetwork, fetchImpl: Fetch = fetch): Promise<BadgeCheck> {
  const tokenAddress = badge.trim();
  const result = await registryBadgeVerdict(tokenAddress, network, fetchImpl);
  const checks = result.checks ?? {};
  if (!checks.on_chain_agent_found || !result.on_chain?.owner_account) throw new BadgeError(`that badge isn't registered on ${network}`);
  if (!checks.status_active || result.on_chain.status !== "Active") throw new BadgeError("that agent's registry entry has been revoked");
  if (!checks.hash_matches_on_chain) {
    throw new BadgeError("the agent's card doesn't match the hash on-chain; update the card or its hash in the registry");
  }
  return { tokenAddress, ownerAccount: result.on_chain.owner_account, agentUri: result.agent_uri ?? null };
}

/**
 * Concordium's official Agent Registry on each network: the CAIP-2 chain id (the genesis hash's
 * first 32 hex characters) and the CIS-8004 and CIS-8 contracts. Mainnet's are in Concordium's
 * docs; testnet's are what the registry's own build_agent_card puts in a testnet card.
 */
export const REGISTRY_CONTRACTS: Record<RegistryNetwork, { chain: string; cis8004: [number, number]; cis8: [number, number] }> = {
  mainnet: { chain: "ccd:9dd9ca4d19e9393877d2c44b70f89acb", cis8004: [10082, 0], cis8: [10081, 0] },
  testnet: { chain: "ccd:4221332d34e1694168c2a0c0b3fd0f27", cis8004: [12802, 0], cis8: [12801, 0] },
};

export const BADGE_EXTENSION_URI = "https://docs.concordium.com/a2a-extensions/concordium-badge/v1";

/**
 * The Verified by Concordium badge as an Agent Card extension (Concordium's normative form),
 * plus the card's ERC-8004 registrations entry, built from the badge and its owner alone so
 * the card stays byte-stable. Throws when the badge isn't from `network`'s registry.
 */
export function badgeCardFields(network: RegistryNetwork, badge: string, owner: string) {
  const { chain, cis8004, cis8 } = REGISTRY_CONTRACTS[network];
  const short = badge.trim();
  let token: ReturnType<typeof tokenAddressFromBase58>;
  try {
    if (!BADGE_PATTERN.test(short)) throw new Error();
    token = tokenAddressFromBase58(short);
  } catch {
    throw new BadgeError(`${short} isn't a badge (a base58 token address)`);
  }
  if (token.contract.index !== BigInt(cis8004[0]) || token.contract.subindex !== BigInt(cis8004[1])) {
    throw new BadgeError(`${short} isn't from the ${network} Agent Registry <${cis8004.join(",")}>`);
  }
  try {
    AccountAddress.fromBase58(owner.trim());
  } catch {
    throw new BadgeError(`${owner} isn't a Concordium account address`);
  }
  // CIS-8004 token ids are u64, little-endian.
  const agentId = Number(Buffer.from(token.id, "hex").readBigUInt64LE());
  const registry = `${chain}:${cis8004.join(".")}`;
  return {
    extension: {
      uri: BADGE_EXTENSION_URI,
      description: "Verified by Concordium badge — on-chain agent identity in a CIS-8004 registry",
      required: false,
      params: {
        tokenAddress: `${chain}/cis-2:${short}`,
        owner: { account: `${chain}:${owner.trim()}` },
        // boreal takes no payments through its registry entry, so the wallet is the owner.
        agentWallet: `${chain}:${owner.trim()}`,
        contracts: { cis8004: registry, cis8: `${chain}:${cis8.join(".")}` },
        // Worded as the registry's own build_agent_badge writes it, so its output matches ours byte for byte.
        verify: "Resolve tokenAddress via CIS-8004 agent_of; confirm owner + status=Active + card SHA-256 == metadata_hash.",
        verification: {
          service: "Concordium Agent Registry",
          verifyUrl: `https://agent-registry-mcp.concordium.com/v1/badge-check/${short}`,
          mcp: REGISTRY_MCP_URL,
          docs: "https://docs.concordium.com/en/mainnet/technical-reference/agent-registry/concordium-badge.html",
        },
      },
    },
    registration: { agentId, agentRegistry: registry },
  };
}

/** The exact text the owner's wallet signs. It names the link code, so a signature can't be reused for another link. */
export function badgeProofMessage({ code, badge }: { code: string; badge: string }): string {
  return `boreal.work: I own the Agent Registry entry ${badge} and link it to the agent requesting code ${code}.`;
}

function grpcFor(network: RegistryNetwork): ConcordiumGRPCClient {
  const host = network === "mainnet" ? "grpc.mainnet.concordium.software" : "grpc.testnet.concordium.com";
  return new ConcordiumGRPCNodeClient(host, 20000, credentials.createSsl(), { timeout: 15_000 });
}

/** Checks that `account` signed `message` (as the Concordium wallets sign messages). */
export async function verifyAccountSignature(
  network: RegistryNetwork,
  account: string,
  message: string,
  signature: AccountTransactionSignature,
  grpc: ConcordiumGRPCClient = grpcFor(network),
): Promise<boolean> {
  let address: AccountAddress.Type;
  try {
    address = AccountAddress.fromBase58(account);
  } catch {
    throw new BadgeError("that isn't a Concordium account address");
  }
  const info = await grpc.getAccountInfo(address).catch(() => {
    throw new BadgeError(`that account doesn't exist on ${network}`);
  });
  try {
    return await verifyMessageSignature(message, signature, info);
  } catch {
    return false;
  }
}
