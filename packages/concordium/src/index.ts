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

/** x402 funding in, sponsored token transfers out of escrow. */
export interface Payments {
  createPaymentRequest(taskId: string, amount: number): Promise<{ paymentRequest: unknown }>;
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
