import type { TransferJournal } from "@boreal/concordium";
import { borealNetwork } from "@boreal/core";
import type { Database } from "@boreal/db";
import type { Desk } from "@boreal/desk";

import { createMarketBridge, type MarketBridge, treasuryJournal } from "./bridge";
import { createNearRpc, type NearChain } from "./chain";
import { signFileLink } from "./file-links";
import { createAgentMarket } from "./market";
import { createNearPayments, createTokenSender, type NearPayments } from "./payments";
import { dbMarketJobStore } from "./store";
import { nearSigner } from "./tx";

export {
  type BridgeReport,
  createMarketBridge,
  type MarketBridge,
  type MarketBridgeOptions,
  type MarketJob,
  type MarketJobStore,
  taskFromBrief,
  treasuryJournal,
} from "./bridge";
export { createNearRpc, type NearChain, NearRpcError, type TxOutcome } from "./chain";
export { signFileLink, verifyFileLink } from "./file-links";
export { type AgentMarket, createAgentMarket, MARKET_URL, type MarketAssignment, MarketError } from "./market";
export {
  createNearPayments,
  createTokenSender,
  fundingMemo,
  fundingUnits,
  isNearAccountId,
  type NearFundingProof,
  NearPaymentError,
  type NearPayments,
  type NearPaymentsOptions,
  type TokenSender,
} from "./payments";
export { dbMarketJobStore } from "./store";
export { base58Decode, base58Encode, nearSigner, type NearSigner, signTransaction } from "./tx";

type Env = Record<string, string | undefined>;

const RPC = { testnet: "https://rpc.testnet.near.org", mainnet: "https://rpc.mainnet.near.org" } as const;

/** Which NEAR this deployment uses: it follows `BOREAL_NETWORK`, and refuses the other pairing. */
export function nearNetwork(env: Env): "testnet" | "mainnet" {
  const network = borealNetwork(env);
  const named = env.NEAR_NETWORK || network;
  if (named !== network) throw new Error(`NEAR_NETWORK=${named} doesn't match BOREAL_NETWORK=${network}: testnet never takes real money`);
  return network;
}

function railOn(env: Env): boolean {
  return (env.PAYMENT_RAILS ?? "").split(",").map((r) => r.trim()).includes("near");
}

function need(env: Env, name: string): string {
  const value = env[name];
  if (!value) throw new Error(`the NEAR rail needs ${name}`);
  return value;
}

/** The NEAR rail from the environment (`PAYMENT_RAILS` includes `near`), or null when it's off. */
export function loadNear(env: Env, options: { journal: TransferJournal; chain?: NearChain }): NearPayments | null {
  if (!railOn(env)) return null;
  const network = nearNetwork(env);
  const chain = options.chain ?? createNearRpc(env.NEAR_RPC_URL || RPC[network]);
  return createNearPayments({
    chain,
    network,
    token: need(env, "NEAR_TOKEN_CONTRACT"),
    decimals: Number(env.NEAR_TOKEN_DECIMALS ?? 6),
    escrow: nearSigner(need(env, "NEAR_ESCROW_ACCOUNT"), need(env, "NEAR_ESCROW_KEY")),
    journal: options.journal,
  });
}

/**
 * The Agent Market bridge, on when the NEAR rail is and `NEAR_MARKET_TOKEN` is set. Market
 * tasks are posted by `NEAR_MARKET_AGENT_ID` and funded from `NEAR_MARKET_TREASURY_ACCOUNT`.
 */
export function loadMarketBridge(
  db: Database,
  desk: Desk,
  env: Env,
  options: { near: NearPayments | null; chain?: NearChain },
): MarketBridge | null {
  if (!options.near || !env.NEAR_MARKET_TOKEN) return null;
  const network = nearNetwork(env);
  const chain = options.chain ?? createNearRpc(env.NEAR_RPC_URL || RPC[network]);
  const store = dbMarketJobStore(db);
  const treasury = createTokenSender({
    chain,
    signer: nearSigner(need(env, "NEAR_MARKET_TREASURY_ACCOUNT"), need(env, "NEAR_MARKET_TREASURY_KEY")),
    token: need(env, "NEAR_TOKEN_CONTRACT"),
    journal: treasuryJournal(store),
  });
  return createMarketBridge({
    desk,
    market: createAgentMarket({ token: env.NEAR_MARKET_TOKEN, baseUrl: env.NEAR_MARKET_URL || undefined }),
    store,
    agentId: need(env, "NEAR_MARKET_AGENT_ID"),
    near: options.near,
    treasury,
    budget: Number(env.NEAR_MARKET_BUDGET ?? 300),
    fileLink: marketFileLinks(env),
  });
}

/** How long a deliverable's file links stay open for the market buyer. */
const FILE_LINK_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Signed links to submission files under `/api/market/files/`, when `NEAR_MARKET_LINK_SECRET`
 * and `PUBLIC_URL` are set; otherwise deliverables say the files are kept private.
 */
export function marketFileLinks(env: Env, now: () => Date = () => new Date()): ((path: string) => string | null) | undefined {
  const secret = env.NEAR_MARKET_LINK_SECRET;
  const site = env.PUBLIC_URL;
  if (!secret || !site) return undefined;
  if (secret.length < 32) throw new Error("NEAR_MARKET_LINK_SECRET must be at least 32 characters");
  return (path) => {
    const { expires, sig } = signFileLink(secret, path, new Date(now().getTime() + FILE_LINK_TTL_MS));
    const encoded = path.split("/").map(encodeURIComponent).join("/");
    return `${site.replace(/\/$/, "")}/api/market/files/${encoded}?expires=${expires}&sig=${sig}`;
  };
}
