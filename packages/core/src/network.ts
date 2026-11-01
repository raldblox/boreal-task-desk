// Which network a deployment runs on. testnet.boreal.work runs on testnet (PayPal sandbox,
// Concordium testnet: never real money); boreal.work runs on mainnet (live PayPal,
// Concordium mainnet). One switch, BOREAL_NETWORK, so the two can't be mixed by accident.

export type BorealNetwork = "testnet" | "mainnet";

/**
 * The deployment's network: `BOREAL_NETWORK`, else `CONCORDIUM_NETWORK`, else testnet.
 * Throws when they disagree, so a mainnet site never runs with testnet settings or the reverse.
 */
export function borealNetwork(env: Record<string, string | undefined> = process.env): BorealNetwork {
  const named = env.BOREAL_NETWORK || env.CONCORDIUM_NETWORK || "testnet";
  if (named !== "testnet" && named !== "mainnet") throw new Error(`BOREAL_NETWORK must be testnet or mainnet, not ${named}`);
  if (env.BOREAL_NETWORK && env.CONCORDIUM_NETWORK && env.CONCORDIUM_NETWORK !== env.BOREAL_NETWORK) {
    throw new Error(`CONCORDIUM_NETWORK=${env.CONCORDIUM_NETWORK} doesn't match BOREAL_NETWORK=${env.BOREAL_NETWORK}`);
  }
  return named;
}
