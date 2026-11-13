import { createHash, createHmac, randomBytes } from "node:crypto";

import {
  AccountAddress,
  BlockHash,
  buildBasicAccountSigner,
  CIS4,
  type ConcordiumGRPCClient,
  type CredentialStatements,
  getPublicData,
  IdentityProviderDID,
  VerifiablePresentation,
  Web3StatementBuilder,
} from "@concordium/web-sdk";
import { ConcordiumGRPCNodeClient, credentials } from "@concordium/web-sdk/nodejs";
import { verifyPresentation, VerifiablePresentationV1, VerificationAuditRecordV1, VerificationRequestV1 } from "@concordium/web-sdk/wasm";

import type { VerifiedWorker } from "./index";

// Concordium ID App sign-in (Verify & Access), with boreal's backend as the verifier:
// 1. start: build an identity proof request (18+, reveal country of residence, ID document
//    number and issuer), anchor it on-chain, and hand it to the browser for the ID App.
// 2. finish: check the returned presentation against the chain and the anchored request.
// Concordium Wallet for Web answers the older Web3 ID request instead (startWallet/finishWallet):
// the challenge is a hash of a recent finalized block and a one-time nonce, checked by reading
// the chain, so nothing is anchored and nobody pays a fee. The ID App needs the anchored V1.
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
  /** A fee-free Web3 ID request for Concordium Wallet for Web: nothing is anchored. */
  startWallet(): Promise<WalletRequest>;
  /** Verifies the wallet's presentation against that request by reading the chain. */
  finishWallet(request: unknown, presentation: unknown): Promise<VerifiedWorker>;
}

/**
 * A Web3 ID request: what the wallet proves (`statements`), and the challenge it proves it for,
 * a hash of a recent finalized block and a one-time nonce (both kept to check the answer).
 */
export interface WalletRequest {
  kind: "web3id";
  blockHash: string;
  nonce: string;
  challenge: string;
  statements: CredentialStatements;
}

/** How old the challenge's block may be when the proof comes back. */
const WALLET_REQUEST_MAX_AGE_MS = 20 * 60_000;

/** The challenge for a block and nonce: SHA-256 of both, hex. */
export function walletChallenge(blockHash: string, nonce: string): string {
  return createHash("sha256").update(Buffer.from(blockHash, "hex")).update(Buffer.from(nonce, "hex")).digest("hex");
}

function isWalletRequest(value: unknown): value is WalletRequest {
  const r = value as Partial<WalletRequest> | null;
  return (
    r?.kind === "web3id" &&
    typeof r.blockHash === "string" &&
    /^[0-9a-f]{64}$/.test(r.blockHash) &&
    typeof r.nonce === "string" &&
    /^[0-9a-f]{64}$/.test(r.nonce) &&
    r.challenge === walletChallenge(r.blockHash, r.nonce) &&
    Array.isArray(r.statements)
  );
}

/** JSON with object keys sorted, so the same statements compare equal whatever order a wallet writes them in. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  );
}

/**
 * The worker from a Web3 ID presentation the SDK has verified: the same pseudonym and person code
 * as the ID App's, since both read the same identity attributes and name the issuer the same way
 * (`did:ccd:<network>:idp:<index>`). The statements must be exactly the ones boreal.work asked for.
 */
export function readWalletPresentation(
  presentation: VerifiablePresentation,
  asked: CredentialStatements,
  pseudonymSecret: string,
): VerifiedWorker {
  const credential = presentation.verifiableCredential[0];
  const wanted = asked[0];
  if (presentation.verifiableCredential.length !== 1 || !credential || !wanted) throw new IdAppError("the proof doesn't answer this request");
  const issuer = /^did:ccd:(mainnet|testnet):idp:(\d+)$/.exec(credential.issuer);
  if (!issuer || !("idQualifier" in wanted) || !(wanted.idQualifier.issuers as readonly unknown[]).includes(Number(issuer[2]))) {
    throw new IdAppError("sign in with an identity from an identity provider Concordium lists");
  }
  const proven = credential.credentialSubject.statement;
  if (canonical(proven) !== canonical(wanted.statement)) throw new IdAppError("the proof doesn't answer this request");
  const values = credential.credentialSubject.proof.proofValue;
  const revealed: Record<string, string> = {};
  let adult = false;
  proven.forEach((statement, i) => {
    if (statement.type === "RevealAttribute") {
      const value = (values[i] as { attribute?: unknown } | undefined)?.attribute;
      if (value !== undefined) revealed[String(statement.attributeTag)] = String(value);
    }
    if (statement.type === "AttributeInRange" && statement.attributeTag === "dob") adult = true;
  });
  return identityFrom(credential.issuer, revealed, adult, pseudonymSecret);
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
  return identityFrom(credential.issuer, revealed, adult, pseudonymSecret);
}

/** Pseudonym, attributes and person code from an identity's revealed attributes, whichever request proved them. */
function identityFrom(issuer: string, revealed: Record<string, string>, adult: boolean, pseudonymSecret: string): VerifiedWorker {
  if (!adult) throw new IdAppError("the proof doesn't show you are 18 or older");
  if (!revealed.idDocNo || !revealed.idDocIssuer) throw new IdAppError("the proof is missing the ID document details");

  // Stable per document and identity provider, and meaningless without the secret.
  const pseudonym = `ccdid:${createHmac("sha256", pseudonymSecret)
    .update(`${issuer}|${revealed.idDocIssuer}|${revealed.idDocNo}`)
    .digest("hex")}`;
  const attributes: Record<string, string> = { age_over_18: "true" };
  if (revealed.countryOfResidence) attributes.residency = revealed.countryOfResidence;
  return { pseudonym, provenAttributes: attributes, personRef: personRef(revealed, pseudonymSecret) };
}

/** Letters only, lower case, accents dropped: "José  Dela-Cruz" and "jose delacruz" match. */
const normalizeName = (name: string) =>
  name
    .normalize("NFKD")
    .toLowerCase()
    // Accents become separate marks under NFKD; keeping letters a-z drops them with everything else.
    .replace(/[^a-z]/g, "");

/**
 * One person across documents and identity providers: a keyed hash of name and date of birth.
 * The values are read here and never stored; without the secret the hash means nothing.
 */
export function personRef(revealed: Record<string, string>, pseudonymSecret: string): string | undefined {
  const first = normalizeName(revealed.firstName ?? "");
  const last = normalizeName(revealed.lastName ?? "");
  const dob = (revealed.dob ?? "").replace(/\D/g, "");
  if (!first || !last || dob.length !== 8) return undefined;
  return `ccdp:${createHmac("sha256", pseudonymSecret).update(`person|${first}|${last}|${dob}`).digest("hex")}`;
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
          // Name and birth date only become a one-way person code (personRef), never stored.
          b
            .addMinimumAge(18)
            .revealAttribute("countryOfResidence")
            .revealAttribute("idDocNo")
            .revealAttribute("idDocIssuer")
            .revealAttribute("firstName")
            .revealAttribute("lastName")
            .revealAttribute("dob"),
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

    async startWallet() {
      const providers: number[] = [];
      for await (const ip of client.getIdentityProviders()) providers.push(ip.ipIdentity);
      // The same attributes as the ID App's request, so the pseudonym and person code match.
      const statements = new Web3StatementBuilder()
        .addForIdentityCredentials(providers, (b) =>
          b
            .addMinimumAge(18)
            .revealAttribute("countryOfResidence")
            .revealAttribute("idDocNo")
            .revealAttribute("idDocIssuer")
            .revealAttribute("firstName")
            .revealAttribute("lastName")
            .revealAttribute("dob"),
        )
        .getStatements();
      const { lastFinalizedBlock } = await client.getConsensusStatus();
      const blockHash = BlockHash.toHexString(lastFinalizedBlock);
      const nonce = randomBytes(32).toString("hex");
      return { kind: "web3id", blockHash, nonce, challenge: walletChallenge(blockHash, nonce), statements };
    },

    async finishWallet(requestJson, presentationJson) {
      if (!isWalletRequest(requestJson)) throw new IdAppError("this request isn't a wallet request; start again");
      let presentation: VerifiablePresentation;
      try {
        presentation = VerifiablePresentation.fromString(typeof presentationJson === "string" ? presentationJson : JSON.stringify(presentationJson));
      } catch {
        throw new IdAppError("the proof couldn't be read");
      }
      if (presentation.presentationContext !== requestJson.challenge) throw new IdAppError("the proof answers a different request");
      // The challenge's block must be on chain and recent: a proof can't be made ahead of time.
      const block = await client.getBlockInfo(BlockHash.fromHexString(requestJson.blockHash)).catch(() => null);
      if (!block || !block.finalized || Date.now() - block.blockSlotTime.getTime() > WALLET_REQUEST_MAX_AGE_MS) {
        throw new IdAppError("this request has expired; start again");
      }
      let publicData: Awaited<ReturnType<typeof getPublicData>>;
      try {
        publicData = await getPublicData(client, config.network, presentation);
      } catch (error) {
        throw new IdAppError(`the proof's credential couldn't be checked: ${error instanceof Error ? error.message : String(error)}`);
      }
      if (publicData.some((d) => d.status !== CIS4.CredentialStatus.Active)) throw new IdAppError("the credential behind this proof isn't active");
      try {
        const proven = verifyPresentation(presentation, await client.getCryptographicParameters(), publicData.map((d) => d.inputs));
        if (proven.challenge !== requestJson.challenge) throw new IdAppError("the proof answers a different request");
      } catch (error) {
        if (error instanceof IdAppError) throw error;
        throw new IdAppError(`the proof didn't verify: ${error instanceof Error ? error.message : String(error)}`);
      }
      return readWalletPresentation(presentation, requestJson.statements, config.pseudonymSecret);
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
