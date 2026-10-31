import { AccountAddress, type AccountTransactionSignature, type ConcordiumGRPCClient, verifyMessageSignature } from "@concordium/web-sdk";
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

/** Looks a badge up in the registry and requires it to be active, with a card matching its on-chain hash. */
export async function checkRegistryBadge(badge: string, network: RegistryNetwork, fetchImpl: Fetch = fetch): Promise<BadgeCheck> {
  const tokenAddress = badge.trim();
  if (!/^[1-9A-HJ-NP-Za-km-z]{8,64}$/.test(tokenAddress)) throw new BadgeError("a badge is a base58 token address, like Mf22soLh1NuZYFgBK8iSs");
  const result = (await registryTool("check_badge", { id: tokenAddress, network }, fetchImpl)) as {
    token_address?: string;
    agent_uri?: string;
    on_chain?: { owner_account?: string; status?: string };
    checks?: { on_chain_agent_found?: boolean; status_active?: boolean; hash_matches_on_chain?: boolean };
  };
  const checks = result.checks ?? {};
  if (!checks.on_chain_agent_found || !result.on_chain?.owner_account) throw new BadgeError(`that badge isn't registered on ${network}`);
  if (!checks.status_active || result.on_chain.status !== "Active") throw new BadgeError("that agent's registry entry has been revoked");
  if (!checks.hash_matches_on_chain) {
    throw new BadgeError("the agent's card doesn't match the hash on-chain; update the card or its hash in the registry");
  }
  return { tokenAddress, ownerAccount: result.on_chain.owner_account, agentUri: result.agent_uri ?? null };
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
