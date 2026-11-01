import { createHmac, randomBytes } from "node:crypto";

import { AccountAddress, buildBasicAccountSigner, type ConcordiumGRPCClient, IdentityProviderDID } from "@concordium/web-sdk";
import { ConcordiumGRPCNodeClient, credentials } from "@concordium/web-sdk/nodejs";
import { VerifiablePresentationV1, VerificationAuditRecordV1, VerificationRequestV1 } from "@concordium/web-sdk/wasm";

import type { VerifiedWorker } from "./index";

// Concordium ID App sign-in (Verify & Access), with boreal's backend as the verifier:
// 1. start: build an identity proof request (18+, reveal country of residence, ID document
//    number and issuer), anchor it on-chain, and hand it to the browser for the ID App.
// 2. finish: check the returned presentation against the chain and the anchored request.
// Identity proofs carry no stable ID, so the worker's pseudonym is a keyed hash of the
// identity provider, document issuer and document number: one worker per person. The
// document number is never stored or logged.

export interface IdAppConfig {
  network: "Testnet" | "Mainnet";
  grpcHost: string;
  grpcPort: number;
  /** Account that pays for the on-chain request anchors. */
  anchorAccount: string;
  /** That account's private signing key (hex). */
  anchorKey: string;
  /** Keys the pseudonym hash. Must never change, or every worker becomes a new one. */
  pseudonymSecret: string;
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
  const {
    CONCORDIUM_ANCHOR_ACCOUNT: anchorAccount,
    CONCORDIUM_ANCHOR_KEY: anchorKey,
    CONCORDIUM_PSEUDONYM_SECRET: pseudonymSecret,
  } = env;
  if (!anchorAccount || !anchorKey) return null;
  if (!pseudonymSecret || pseudonymSecret.length < 32) {
    console.error("[id-app] CONCORDIUM_PSEUDONYM_SECRET (32+ characters) is required; sign-in stays off");
    return null;
  }
  // Concordium addresses are base58 (50 characters) and signing keys 32-byte hex; an Ethereum-style
  // 0x address or key here would fail on every sign-in, so refuse it up front.
  if (!/^[1-9A-HJ-NP-Za-km-z]{50}$/.test(anchorAccount) || !/^[0-9a-fA-F]{64}$/.test(anchorKey)) {
    console.error("[id-app] CONCORDIUM_ANCHOR_ACCOUNT must be a Concordium base58 address and CONCORDIUM_ANCHOR_KEY a 64-character hex key; sign-in stays off");
    return null;
  }
  return {
    network: env.CONCORDIUM_NETWORK === "mainnet" ? "Mainnet" : "Testnet",
    grpcHost: env.CONCORDIUM_GRPC_HOST || (env.CONCORDIUM_NETWORK === "mainnet" ? "grpc.mainnet.concordium.software" : "grpc.testnet.concordium.com"),
    grpcPort: Number(env.CONCORDIUM_GRPC_PORT || 20000),
    anchorAccount,
    anchorKey,
    pseudonymSecret,
  };
}

/** The worker's pseudonym and proven attributes, read from a verified identity presentation. */
export function readPresentation(presentation: VerifiablePresentationV1.Type, pseudonymSecret: string): VerifiedWorker {
  const credential = presentation.verifiableCredential[0];
  if (!credential || !(credential.type as readonly string[]).includes("ConcordiumIdBasedCredential")) {
    throw new IdAppError("sign in with your identity in the Concordium ID App");
  }
  const revealed: Record<string, string> = {};
  let adult = false;
  for (const statement of credential.credentialSubject.statement) {
    if (statement.type === "AttributeValue") revealed[String(statement.attributeTag)] = String(statement.attributeValue);
    if (statement.type === "AttributeInRange" && statement.attributeTag === "dob") adult = true;
  }
  if (!adult) throw new IdAppError("the proof doesn't show you are 18 or older");
  if (!revealed.idDocNo || !revealed.idDocIssuer) throw new IdAppError("the proof is missing the ID document details");

  // Stable per person and identity provider, and meaningless without the secret.
  const pseudonym = `ccdid:${createHmac("sha256", pseudonymSecret)
    .update(`${credential.issuer}|${revealed.idDocIssuer}|${revealed.idDocNo}`)
    .digest("hex")}`;
  const attributes: Record<string, string> = { age_over_18: "true" };
  if (revealed.countryOfResidence) attributes.residency = revealed.countryOfResidence;
  return { pseudonym, provenAttributes: attributes };
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
        .addIdentityClaims(await issuers(), (b) =>
          b.addMinimumAge(18).revealAttribute("countryOfResidence").revealAttribute("idDocNo").revealAttribute("idDocIssuer"),
        )
        .getClaims();
      const context = VerificationRequestV1.createSimpleContext(randomBytes(32), connectionId, RESOURCE, CONTEXT);
      const request = await VerificationRequestV1.createAndAnchor(client, { sender, signer }, context, claims, {
        app: "boreal.work",
      });
      // Wallets check the anchor before building a proof and refuse one that isn't finalized
      // yet, so hand the request out only once it is (a few seconds on either network).
      await client.waitForTransactionFinalization(request.transactionRef, 45_000);
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
      // Logged without attribute values, so a rejected sign-in can be diagnosed.
      console.info(
        `[id-app] presentation with ${presentation.verifiableCredential.length} credential(s): ${presentation.verifiableCredential
          .map((c) => `${(c.type as readonly string[]).at(-1)} [${c.credentialSubject.statement.map((st) => `${st.type}:${String(st.attributeTag)}`).join(", ")}]`)
          .join("; ")}`,
      );
      const checked = await VerificationAuditRecordV1.createChecked(auditId, request, presentation, client, config.network);
      if (checked.type === "failed") throw new IdAppError(`the proof didn't verify: ${checked.error.message}`);
      return readPresentation(presentation, config.pseudonymSecret);
    },
  };
}
