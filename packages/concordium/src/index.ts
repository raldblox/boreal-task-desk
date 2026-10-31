// Ports for every Concordium component boreal uses. The task engine depends only on
// these interfaces; testnet and mainnet adapters implement them.

export interface RegistryEntry {
  registryId: string;
  verified: boolean;
  /** Concordium ID pseudonym or LEI of the accountable owner. */
  ownerRef: string | null;
}

/** Agent Registry + Verified by Concordium badge, looked up through the registry's MCP server. */
export interface AgentRegistry {
  lookup(registryId: string): Promise<RegistryEntry | null>;
}

export interface ProofRequest {
  challenge: string;
  attributes: { attribute: string; value?: string }[];
}

export interface VerifiedWorker {
  /** Stable per-service pseudonym, used to enforce one account per person. */
  pseudonym: string;
  provenAttributes: Record<string, string>;
}

/** Concordium ID + Verify and Access: workers prove attributes without sharing personal data. */
export interface IdentityVerifier {
  createProofRequest(attributes: ProofRequest["attributes"]): Promise<ProofRequest>;
  verifyPresentation(request: ProofRequest, presentation: unknown): Promise<VerifiedWorker>;
}

export interface Transfer {
  to: string;
  amount: number;
  /** Ledger idempotency key; a repeated key must never send twice. */
  idempotencyKey: string;
}

/**
 * What a 402 response asks the payer for. Follows the generic x402 shape; the Concordium
 * specifics (network id, asset, signature scheme) are settled at Workshop 3.
 */
export interface PaymentRequirement {
  scheme: "exact";
  network: string;
  asset: string;
  payTo: string;
  /** Minor units. */
  amount: number;
  /** The task being funded. */
  resource: string;
  nonce: string;
  expiresAt: string;
}

/** x402 funding in, sponsored token transfers out of escrow. */
export interface Payments {
  createPaymentRequest(taskId: string, amount: number): Promise<PaymentRequirement>;
  /** Verifies the payer's x402 payment and settles it on-chain; throws if it is invalid. */
  confirmPayment(taskId: string, payment: unknown): Promise<{ txHash: string; amount: number }>;
  sponsoredTransfer(transfer: Transfer): Promise<{ txHash: string }>;
  escrowBalance(): Promise<number>;
}

/** Writes a task event hash on-chain so the trail can be checked on CCDExplorer. */
export interface Anchor {
  anchor(hash: string): Promise<{ txHash: string }>;
}

export interface Concordium {
  registry: AgentRegistry;
  identity: IdentityVerifier;
  payments: Payments;
  anchor: Anchor;
}

export { createDevConcordium, DevConcordiumError, type DevConcordiumOptions, signDevPayment } from "./dev";

import { createDevConcordium, type DevConcordiumOptions } from "./dev";

/**
 * Picks the adapters from `CONCORDIUM_MODE`: `dev` for the stand-ins, unset for none
 * (payments and sign-in stay off). Testnet adapters land after the workshops.
 */
export function loadConcordium(
  env: Record<string, string | undefined> = process.env,
  dev: Omit<DevConcordiumOptions, "secret"> = {},
): Concordium | null {
  const mode = env.CONCORDIUM_MODE;
  if (!mode) return null;
  if (mode === "dev") {
    if (env.VERCEL_ENV === "production") {
      throw new Error("CONCORDIUM_MODE=dev is refused on production: it accepts fake payments");
    }
    // The stand-ins accept fake payments, so they only ever run against a local database.
    const host = env.DATABASE_URL ? new URL(env.DATABASE_URL).hostname : "";
    if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(host)) {
      throw new Error("CONCORDIUM_MODE=dev needs a local DATABASE_URL; run `pnpm dev:local`");
    }
    const secret = env.DEV_CONCORDIUM_SECRET;
    if (!secret || secret.length < 32) throw new Error("DEV_CONCORDIUM_SECRET must be at least 32 characters");
    return createDevConcordium({ ...dev, secret });
  }
  throw new Error(`CONCORDIUM_MODE=${mode} is not supported yet`);
}
export { createIdAppVerifier, type IdAppConfig, idAppConfigFromEnv, IdAppError, type IdAppVerifier, readPresentation } from "./id-app";
export {
  type BadgeCheck,
  BadgeError,
  badgeProofMessage,
  checkRegistryBadge,
  REGISTRY_MCP_URL,
  type RegistryNetwork,
  verifyAccountSignature,
} from "./registry";
