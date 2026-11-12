import type { TransferJournal } from "@boreal/concordium";
import { borealNetwork } from "@boreal/core";
import { getAddress, isAddress, verifyMessage } from "viem";

import { createEvmRpc, type EvmChain, type Hex } from "./chain";
import { createEvmPayments, type EvmPayments } from "./payments";

export { createEvmRpc, type EvmChain, type EvmReceipt, EvmRpcError, type Hex } from "./chain";
export { createEvmPayments, type EvmAuthorization, EvmPaymentError, type EvmPaymentRequirement, type EvmPayments, type EvmPaymentsOptions, fundingNonce, TOKEN_ABI } from "./payments";

type Env = Record<string, string | undefined>;

/** Chains that carry test money. A deployment's chain must match its network, in both directions. */
export const EVM_TESTNETS: ReadonlySet<number> = new Set([84532, 11155111, 421614, 11155420, 80002, 43113, 97]);

/** The chains the rail has been thought through for, by name, for people. */
export const EVM_CHAIN_NAMES: Record<number, string> = { 8453: "Base", 84532: "Base Sepolia", 1: "Ethereum", 11155111: "Sepolia", 10: "OP Mainnet", 42161: "Arbitrum One", 137: "Polygon" };

export class EvmConfigError extends Error {}

function need(env: Env, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new EvmConfigError(`${name} is not set`);
  return value;
}

/**
 * The chain id, checked against the deployment's network: mainnet never runs on a test chain
 * (workers would be paid in test tokens) and testnet never on a real one (testnet never takes
 * real money).
 */
export function evmChainId(env: Env): number {
  const id = Number(need(env, "EVM_CHAIN_ID"));
  if (!Number.isSafeInteger(id) || id <= 0) throw new EvmConfigError("EVM_CHAIN_ID must be a chain id, like 8453 for Base");
  const network = borealNetwork(env);
  const test = EVM_TESTNETS.has(id);
  if (network === "mainnet" && test) throw new EvmConfigError(`chain ${id} is a test chain and is refused on mainnet`);
  if (network === "testnet" && !test) throw new EvmConfigError(`chain ${id} isn't a known test chain and is refused on testnet: testnet never takes real money`);
  return id;
}

const railOn = (env: Env) => (env.PAYMENT_RAILS ?? "").split(",").map((r) => r.trim()).includes("evm");

/**
 * The EVM rail from the environment (`PAYMENT_RAILS` includes `evm`, which `addonEnv` only
 * allows once the EVM add-on is on and ready), or null when it's off. Nothing has a default:
 * the chain, the RPC endpoint, the token contract and its EIP-712 domain are all named, so
 * money can't go to a token nobody chose.
 */
export function loadEvm(env: Env, options: { journal: TransferJournal; chain?: EvmChain }): EvmPayments | null {
  if (!railOn(env)) return null;
  const chainId = evmChainId(env);
  const token = need(env, "EVM_TOKEN_CONTRACT");
  if (!isAddress(token)) throw new EvmConfigError("EVM_TOKEN_CONTRACT must be the token's contract address");
  const key = need(env, "EVM_ESCROW_KEY");
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) throw new EvmConfigError("EVM_ESCROW_KEY must be a 32-byte private key in hex (0x…)");
  return createEvmPayments({
    chain: options.chain ?? createEvmRpc(need(env, "EVM_RPC_URL"), chainId),
    chainId,
    token,
    decimals: Number(env.EVM_TOKEN_DECIMALS ?? 6),
    tokenName: need(env, "EVM_TOKEN_NAME"),
    tokenVersion: need(env, "EVM_TOKEN_VERSION"),
    escrowKey: key as Hex,
    journal: options.journal,
  });
}

/** What a worker signs with their wallet to connect it for payouts: free, and it moves nothing. */
export const evmConnectMessage = (site: string, issuedAt: string) =>
  `Connect this wallet to ${site} to be paid for tasks.\n\nThis signature is free and moves no money.\nIssued: ${issuedAt}`;

export class EvmConnectError extends Error {}

/**
 * Checks a wallet's `personal_sign` of the connect message: recent, and signed by the address
 * it claims. Returns the checksummed address. Nobody types an address: the wallet proves it.
 */
export async function verifyEvmConnect(
  input: { address: string; issuedAt: string; signature: string },
  options: { site: string; now?: Date; maxAgeMs?: number },
): Promise<string> {
  if (!isAddress(input.address)) throw new EvmConnectError("that isn't an EVM address");
  const issued = Date.parse(input.issuedAt);
  const now = (options.now ?? new Date()).getTime();
  if (!Number.isFinite(issued) || Math.abs(now - issued) > (options.maxAgeMs ?? 10 * 60 * 1000)) throw new EvmConnectError("that signature is too old; connect again");
  if (!/^0x[0-9a-fA-F]{130}$/.test(input.signature)) throw new EvmConnectError("that signature isn't well formed");
  const valid = await verifyMessage({ address: getAddress(input.address), message: evmConnectMessage(options.site, input.issuedAt), signature: input.signature as Hex }).catch(() => false);
  if (!valid) throw new EvmConnectError("the signature doesn't match that address");
  return getAddress(input.address);
}
