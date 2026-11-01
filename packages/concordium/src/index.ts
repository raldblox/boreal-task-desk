// Ports for every Concordium component boreal uses. The task engine depends only on
// these interfaces; the stand-ins (`dev.ts`) and testnet (`testnet.ts`) adapters implement them.

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
 * What a 402 response asks the payer for on the Concordium rail: x402 v2 `PaymentRequirements`
 * for the `exact` scheme, as Concordium's x402 mechanism (`@x402/concordium`) defines it.
 * boreal's own fields ride in `extra`, which x402 clients echo back unchanged as `accepted`.
 */
export interface X402PaymentRequirement {
  scheme: "exact";
  /** CAIP-2 network id: `ccd:4221332d34e1694168c2a0c0b3fd0f27` is testnet. */
  network: string;
  /** Protocol-level token id (its registered symbol, such as USDR). */
  asset: string;
  payTo: string;
  /** In the asset's smallest units, as a decimal string. */
  amount: string;
  /** How long the payer's signed transfer may live. */
  maxTimeoutSeconds: number;
  extra: {
    /** Sponsors the payer's transfer, so the payer needs no CCD. */
    feePayer?: string;
    /** The task being funded. */
    resource: string;
    /** `amount` in boreal's minor units (US cents). */
    minorUnits: number;
    nonce: string;
    expiresAt: string;
    /** Server seal over every field above, so a payer can't change them. */
    seal?: string;
  };
}

/** What the PayPal rail asks for: an order the payer approves at `extra.approveUrl`. */
export interface PayPalPaymentRequirement {
  scheme: "exact";
  network: "paypal";
  /** Currency code, such as USD. */
  asset: string;
  payTo: string;
  /** Minor units. */
  amount: number;
  /** The task being funded. */
  resource: string;
  /** The PayPal order id. */
  nonce: string;
  expiresAt: string;
  extra: { rail: "paypal"; orderId: string; approveUrl: string };
}

export type PaymentRequirement = X402PaymentRequirement | PayPalPaymentRequirement;

export function isPayPalRequirement(r: PaymentRequirement): r is PayPalPaymentRequirement {
  return r.network === "paypal";
}

/** A confirmed payment. With `hold`, the money is authorized on the payer's side but not taken yet. */
export interface ConfirmedPayment {
  txHash: string;
  amount: number;
  hold?: string;
  /** A payment method the payer saved with this payment, to fund later tasks without approval. */
  vaultId?: string;
}

/**
 * Rails that hold funds at confirmation (PayPal authorizations) instead of settling them.
 * The desk takes the money only once the task is final.
 */
export interface PaymentHolds {
  /** Takes `amount` of the hold and releases the rest. A repeated key never captures twice. */
  capture(hold: string, amount: number, idempotencyKey: string): Promise<{ txHash: string }>;
  /** Releases the whole hold to the payer. */
  release(hold: string, idempotencyKey: string): Promise<void>;
}

/**
 * Rails that can save the payer's approval (PayPal vaulting) and pay again with it, with no
 * payer present. The desk calls it only inside a task's funding checks.
 */
export interface PaymentVault {
  /** Pays (or holds) `amount` for the task from the saved method; throws if it is refused. */
  pay(taskId: string, amount: number, vaultId: string): Promise<ConfirmedPayment>;
}

/** The money rails boreal can run, side by side; each task settles on the one it was funded on. */
export type PaymentRail = "concordium" | "paypal";
export const PAYMENT_RAILS: readonly PaymentRail[] = ["concordium", "paypal"];

/** The rails configured on this deployment. */
export type PaymentRails = Partial<Record<PaymentRail, Payments>>;

/** x402 funding in, sponsored token transfers out of escrow. */
export interface Payments<R extends PaymentRequirement = PaymentRequirement> {
  createPaymentRequest(taskId: string, amount: number): Promise<R>;
  /** Verifies the payer's x402 payment and settles (or holds) it; throws if it is invalid. */
  confirmPayment(taskId: string, payment: unknown): Promise<ConfirmedPayment>;
  sponsoredTransfer(transfer: Transfer): Promise<{ txHash: string }>;
  escrowBalance(): Promise<number>;
  /** Present on rails whose confirmed payments are holds. */
  holds?: PaymentHolds;
  /** Present on rails that can pay again from a saved payment method. */
  vault?: PaymentVault;
}

/** A payout or refund as sent: enough to tell later whether it can still land. */
export interface SentTransfer {
  txHash: string;
  /** Epoch seconds after which the chain will never execute it. */
  expiry: number;
}

/** Durable record of sent transfers by ledger idempotency key, written before each send. */
export interface TransferJournal {
  find(idempotencyKey: string): Promise<SentTransfer | null>;
  save(idempotencyKey: string, sent: SentTransfer): Promise<void>;
}

/** Writes a task event hash on-chain so the trail can be checked on CCDExplorer. */
export interface Anchor {
  anchor(hash: string): Promise<{ txHash: string }>;
}

export interface Concordium {
  registry: AgentRegistry;
  identity: IdentityVerifier;
  payments: Payments<X402PaymentRequirement>;
  anchor: Anchor;
}

export { createDevConcordium, DevConcordiumError, type DevConcordiumOptions, signDevPayment } from "./dev";
export {
  type Chain,
  createTestnetConcordium,
  type Facilitator,
  grpcChain,
  type PreparedTransaction,
  TestnetConcordiumError,
  type TestnetConfig,
  testnetConfigFromEnv,
  type TransactionOutcome,
} from "./testnet";

import { createDevConcordium, type DevConcordiumOptions } from "./dev";
import { createTestnetConcordium, testnetConfigFromEnv } from "./testnet";

export interface LoadOptions extends Omit<DevConcordiumOptions, "secret"> {
  /** Where testnet payouts and refunds are journaled before they are sent. */
  journal?: TransferJournal;
}

/**
 * Picks the adapters from `CONCORDIUM_MODE`: `dev` for the stand-ins, `testnet` for real
 * money on Concordium testnet, unset for none (payments and sign-in stay off).
 */
export function loadConcordium(
  env: Record<string, string | undefined> = process.env,
  options: LoadOptions = {},
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
    const { journal: _journal, ...dev } = options;
    return createDevConcordium({ ...dev, secret });
  }
  if (mode === "testnet") {
    // Without a durable journal a retried payout could be sent twice.
    if (!options.journal) throw new Error("CONCORDIUM_MODE=testnet needs a transfer journal");
    return createTestnetConcordium(testnetConfigFromEnv(env), { journal: options.journal, now: options.now });
  }
  throw new Error(`CONCORDIUM_MODE=${mode} is not supported`);
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
