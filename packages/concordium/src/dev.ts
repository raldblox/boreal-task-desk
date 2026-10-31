import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import type { Concordium, PaymentRequirement, ProofRequest, VerifiedWorker } from "./index";

// Stand-in adapters so the whole flow runs with no chain. Stateless: challenges and payment
// requests are HMAC-signed, so they verify on any server instance. Never for production.

export interface DevConcordiumOptions {
  /** Signs challenges and payment requests. */
  secret: string;
  /** Registry ids that count as carrying the Verified by Concordium badge. */
  verifiedAgents?: (registryId: string) => boolean;
  /** The dev chain has no balance of its own, so escrow is read from the ledger. */
  escrowBalance?: () => Promise<number>;
  now?: () => Date;
}

const ESCROW_ADDRESS = "dev-escrow";
const TTL_MS = 15 * 60 * 1000;

export class DevConcordiumError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DevConcordiumError";
  }
}

function devTxHash(...parts: string[]): string {
  return `dev-${createHash("sha256").update(parts.join(":")).digest("hex").slice(0, 40)}`;
}

function equalStrings(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function createDevConcordium(options: DevConcordiumOptions): Concordium {
  const { secret, now = () => new Date() } = options;
  const verifiedAgents = options.verifiedAgents ?? ((id) => id.startsWith("dev-"));
  const sign = (body: string) => createHmac("sha256", secret).update(body).digest("base64url");

  /** A signed token: base64url(json).signature, checked for tampering and expiry. */
  function seal(payload: object): string {
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return `${body}.${sign(body)}`;
  }

  function unseal<T extends { expiresAt: string }>(token: string, what: string): T {
    const [body, signature] = token.split(".");
    if (!body || !signature || !equalStrings(sign(body), signature)) {
      throw new DevConcordiumError(`${what} signature is invalid`);
    }
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as T;
    if (new Date(payload.expiresAt) <= now()) throw new DevConcordiumError(`${what} has expired`);
    return payload;
  }

  const expiry = () => new Date(now().getTime() + TTL_MS).toISOString();

  return {
    registry: {
      async lookup(registryId) {
        return { registryId, verified: verifiedAgents(registryId), ownerRef: `dev-owner:${registryId}` };
      },
    },

    identity: {
      async createProofRequest(attributes) {
        return { challenge: seal({ attributes, expiresAt: expiry() }), attributes };
      },

      /**
       * The dev wallet's presentation is `{ pseudonym, attributes }`, taken at its word.
       * The real adapter verifies a Concordium zero-knowledge proof here instead.
       */
      async verifyPresentation(request: ProofRequest, presentation: unknown): Promise<VerifiedWorker> {
        const sealed = unseal<{ attributes: ProofRequest["attributes"]; expiresAt: string }>(
          request.challenge,
          "proof challenge",
        );
        const p = presentation as { pseudonym?: unknown; attributes?: unknown } | null;
        if (typeof p?.pseudonym !== "string" || !p.pseudonym || typeof p.attributes !== "object" || !p.attributes) {
          throw new DevConcordiumError("presentation must carry a pseudonym and attributes");
        }
        const proven = p.attributes as Record<string, string>;
        for (const { attribute, value } of sealed.attributes) {
          if (!(attribute in proven) || (value !== undefined && proven[attribute] !== value)) {
            throw new DevConcordiumError(`presentation does not prove ${attribute}`);
          }
        }
        return { pseudonym: p.pseudonym, provenAttributes: proven };
      },
    },

    payments: {
      async createPaymentRequest(taskId, amount): Promise<PaymentRequirement> {
        // dev-usd has two decimals, so its smallest unit is boreal's minor unit.
        return {
          scheme: "exact",
          network: "concordium-dev",
          asset: "dev-usd",
          payTo: ESCROW_ADDRESS,
          amount: String(amount),
          maxTimeoutSeconds: TTL_MS / 1000,
          extra: { resource: taskId, minorUnits: amount, nonce: randomBytes(12).toString("base64url"), expiresAt: expiry() },
        };
      },

      /**
       * The dev payment is `{ requirement, signature }`, where the signature is what
       * `signDevPayment` gives the payer. Real x402 settles a signed transfer instead.
       */
      async confirmPayment(taskId, payment) {
        const p = payment as { requirement?: PaymentRequirement; signature?: unknown } | null;
        const requirement = p?.requirement;
        if (!requirement || typeof p?.signature !== "string") {
          throw new DevConcordiumError("payment must carry the requirement and a signature");
        }
        if (requirement.extra?.resource !== taskId) throw new DevConcordiumError("payment is for another task");
        if (new Date(requirement.extra.expiresAt) <= now()) throw new DevConcordiumError("payment request has expired");
        if (!equalStrings(signDevPayment(secret, requirement), p.signature)) {
          throw new DevConcordiumError("payment signature is invalid");
        }
        return { txHash: devTxHash("fund", taskId, requirement.extra.nonce), amount: requirement.extra.minorUnits };
      },

      async sponsoredTransfer(transfer) {
        // Deterministic by idempotency key, so a retried transfer reports the same transaction.
        return { txHash: devTxHash("transfer", transfer.idempotencyKey) };
      },

      async escrowBalance() {
        if (!options.escrowBalance) throw new DevConcordiumError("no escrow balance source configured");
        return options.escrowBalance();
      },
    },

    anchor: {
      async anchor(hash) {
        return { txHash: devTxHash("anchor", hash) };
      },
    },
  };
}

/** What a dev wallet does to pay a 402: sign the exact requirement it was given. */
export function signDevPayment(secret: string, requirement: PaymentRequirement): string {
  const { resource, minorUnits, nonce, expiresAt } = requirement.extra;
  const fields = [resource, requirement.amount, minorUnits, nonce, expiresAt, requirement.payTo];
  return createHmac("sha256", secret).update(`pay:${fields.join("|")}`).digest("base64url");
}
