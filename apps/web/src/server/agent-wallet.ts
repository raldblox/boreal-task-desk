import "server-only";

import { loadNearChain } from "@boreal/near";

import { gatedEnv } from "@/server/addons";
import { paymentRails } from "@/server/desk";

/** What the Fund button needs to send USDC to an agent's own NEAR account, and what it holds now. */
export interface AgentWalletView {
  account: string;
  network: "testnet" | "mainnet";
  token: string;
  decimals: number;
  /** The account's USDC in US cents, or null when it can't be read (not registered yet, RPC down). */
  usdcCents: number | null;
}

/** The agent's NEAR wallet, or null when the NEAR rail is off here or the agent has no account. */
export async function agentWallet(account: string | null): Promise<AgentWalletView | null> {
  const env = gatedEnv();
  if (!account || !paymentRails().includes("near") || !env.NEAR_TOKEN_CONTRACT) return null;
  const decimals = Number(env.NEAR_TOKEN_DECIMALS || "6");
  const network = env.NEAR_NETWORK === "mainnet" ? "mainnet" : "testnet";
  let usdcCents: number | null = null;
  try {
    const units = await loadNearChain(env).view(env.NEAR_TOKEN_CONTRACT, "ft_balance_of", { account_id: account });
    if (typeof units === "string") usdcCents = Number(BigInt(units) / BigInt(10) ** BigInt(decimals - 2));
  } catch {
    // An unregistered or brand-new account can't be read yet; the page just doesn't show a balance.
  }
  return { account, network, token: env.NEAR_TOKEN_CONTRACT, decimals, usdcCents };
}
