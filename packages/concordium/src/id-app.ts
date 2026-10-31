import { randomBytes } from "node:crypto";

import { AccountAddress, buildBasicAccountSigner, type ConcordiumGRPCClient, IdentityProviderDID } from "@concordium/web-sdk";
import { ConcordiumGRPCNodeClient, credentials } from "@concordium/web-sdk/nodejs";
import { VerifiablePresentationV1, VerificationAuditRecordV1, VerificationRequestV1 } from "@concordium/web-sdk/wasm";

import type { VerifiedWorker } from "./index";

// Concordium ID App sign-in (Verify & Access), with boreal's backend as the verifier:
// 1. start: build an account-based proof request (18+, reveal country of residence),
//    anchor it on-chain, and hand it to the browser to send to the ID App.
// 2. finish: check the returned presentation against the chain and the anchored request.
// The account credential's DID becomes the worker's pseudonym: stable per account, no
// personal data.

export interface IdAppConfig {
  network: "Testnet" | "Mainnet";
  grpcHost: string;
  grpcPort: number;
  /** Account that pays for the on-chain request anchors. */
  anchorAccount: string;
  /** That account's private signing key (hex). */
  anchorKey: string;
}

export class IdAppError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IdAppError";
  }
}

export interface IdAppVerifier {
  /** Builds and anchors a proof request for a WalletConnect session; returns it as JSON for the wallet. */
  start(connectionId: string): Promise<{ request: unknown }>;
  /** Verifies a presentation against the request it answers. Throws IdAppError when it doesn't hold. */
  finish(request: unknown, presentation: unknown, auditId: string): Promise<VerifiedWorker>;
}

const RESOURCE = "boreal.work/signin";
const CONTEXT = "Sign in to boreal.work as a worker";

/** Reads the config from the environment; null when Concordium ID sign-in isn't configured. */
export function idAppConfigFromEnv(env: Record<string, string | undefined> = process.env): IdAppConfig | null {
  const { CONCORDIUM_ANCHOR_ACCOUNT: anchorAccount, CONCORDIUM_ANCHOR_KEY: anchorKey } = env;
  if (!anchorAccount || !anchorKey) return null;
  return {
    network: env.CONCORDIUM_NETWORK === "mainnet" ? "Mainnet" : "Testnet",
    grpcHost: env.CONCORDIUM_GRPC_HOST || (env.CONCORDIUM_NETWORK === "mainnet" ? "grpc.mainnet.concordium.software" : "grpc.testnet.concordium.com"),
    grpcPort: Number(env.CONCORDIUM_GRPC_PORT || 20000),
    anchorAccount,
    anchorKey,
  };
}

/** The account credential DID and the revealed country, read from a verified presentation. */
export function readPresentation(presentation: VerifiablePresentationV1.Type): VerifiedWorker {
  const credential = presentation.verifiableCredential[0];
  if (!credential || !(credential.type as readonly string[]).includes("ConcordiumAccountBasedCredential")) {
    throw new IdAppError("sign in with an account credential from your Concordium ID App");
  }
  const attributes: Record<string, string> = {};
  for (const statement of credential.credentialSubject.statement) {
    if (statement.type === "AttributeValue" && statement.attributeTag === "countryOfResidence") {
      attributes.residency = String(statement.attributeValue);
    }
    if (statement.type === "AttributeInRange" && statement.attributeTag === "dob") attributes.age_over_18 = "true";
  }
  if (attributes.age_over_18 !== "true") throw new IdAppError("the proof doesn't show you are 18 or older");
  return { pseudonym: String(credential.credentialSubject.id), provenAttributes: attributes };
}

export function createIdAppVerifier(config: IdAppConfig, grpc?: ConcordiumGRPCClient): IdAppVerifier {
  const client = grpc ?? new ConcordiumGRPCNodeClient(config.grpcHost, config.grpcPort, credentials.createSsl(), { timeout: 20_000 });
  const sender = AccountAddress.fromBase58(config.anchorAccount);
  const signer = buildBasicAccountSigner(config.anchorKey);

  /** Every identity provider the chain currently lists is accepted. */
  async function issuers(): Promise<IdentityProviderDID[]> {
    const dids: IdentityProviderDID[] = [];
    for await (const ip of client.getIdentityProviders()) dids.push(new IdentityProviderDID(config.network, ip.ipIdentity));
    return dids;
  }

  return {
    async start(connectionId) {
      const claims = VerificationRequestV1.claimsBuilder()
        .addAccountClaims(await issuers(), (b) => b.addMinimumAge(18).revealAttribute("countryOfResidence"))
        .getClaims();
      const context = VerificationRequestV1.createSimpleContext(randomBytes(32), connectionId, RESOURCE, CONTEXT);
      const request = await VerificationRequestV1.createAndAnchor(client, { sender, signer }, context, claims, {
        app: "boreal.work",
      });
      return { request: request.toJSON() };
    },

    async finish(requestJson, presentationJson, auditId) {
      let request: VerificationRequestV1.Type;
      let presentation: VerifiablePresentationV1.Type;
      try {
        request = VerificationRequestV1.fromJSON(requestJson as VerificationRequestV1.JSON);
        // The ID App may wrap the presentation as a JSON string.
        const raw = (presentationJson as { verifiablePresentationJson?: unknown })?.verifiablePresentationJson ?? presentationJson;
        presentation = VerifiablePresentationV1.fromJSON((typeof raw === "string" ? JSON.parse(raw) : raw) as VerifiablePresentationV1.JSON);
      } catch {
        throw new IdAppError("the proof couldn't be read");
      }
      const checked = await VerificationAuditRecordV1.createChecked(auditId, request, presentation, client, config.network);
      if (checked.type === "failed") throw new IdAppError(`the proof didn't verify: ${checked.error.message}`);
      return readPresentation(presentation);
    },
  };
}
