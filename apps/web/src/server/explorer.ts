import { gatedEnv } from "@/server/addons";

type Rail = "paypal" | "near" | "concordium";

/**
 * Where a rail's transaction can be seen by anyone: nearblocks for NEAR, CCDScan for Concordium.
 * Null for PayPal (no public explorer), test money, and the ledger's own markers (a released hold).
 */
export function txUrl(rail: Rail | null | undefined, hash: string | null | undefined): string | null {
  if (!rail || !hash || /^[a-z]+:/.test(hash)) return null;
  const env = gatedEnv();
  if (rail === "near") return `https://${env.NEAR_NETWORK === "mainnet" ? "" : "testnet."}nearblocks.io/txns/${hash}`;
  if (rail === "concordium") {
    return `https://${env.CONCORDIUM_NETWORK === "mainnet" ? "" : "testnet."}ccdscan.io/?dcount=1&dentity=transaction&dhash=${hash}`;
  }
  return null;
}

/** The explorer's name, for link text. */
export const EXPLORER: Record<Exclude<Rail, "paypal">, string> = { near: "nearblocks", concordium: "CCDScan" };
