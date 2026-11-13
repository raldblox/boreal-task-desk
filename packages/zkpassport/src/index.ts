import { createHmac, randomBytes } from "node:crypto";
import { createRequire } from "node:module";

import { personRef } from "@boreal/concordium";

import { passportQuery, ZKPASSPORT_SCOPE } from "./query";

export { passportQuery, type PassportRequestStart, ZKPASSPORT_SCOPE } from "./query";

// ZKPassport (https://docs.zkpassport.id), self-served: no account, no dashboard. The worker's
// phone reads the chip in their passport or ID card and proves, with zero-knowledge proofs, that
// they are 18 or older, their nationality, and a unique identifier for that document on
// boreal.work. boreal.work's server checks the proofs itself. The identifier is the salted kind,
// so not even the issuing government can recompute it; it is stored only as a keyed hash.

/** The identity a verified proof gives the desk (see `PassportIdentity` in @boreal/desk). */
export interface PassportIdentity {
  ref: string;
  provenAttributes: Record<string, string>;
  personRef?: string;
}

export interface ZkPassportConfig {
  /** The site's host name, e.g. boreal.work; the identifier is tied to it. */
  domain: string;
  /** Accept mock passports (ZKPassport's dev mode). Never on mainnet. */
  devMode: boolean;
  /** "local" checks proofs on this server; "api" sends them to ZKPassport's verifier. */
  verifierMode: "local" | "api";
  /** Ethereum RPC for the certificate registry reads; ZKPassport's default when unset. */
  rpcUrl?: string;
  /** Keys the identity hashes. Must never change. */
  pseudonymSecret: string;
}

export class ZkPassportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ZkPassportError";
  }
}

/** Reads the config from the (add-on gated) environment; null when the secret is missing. */
export function zkPassportConfigFromEnv(env: Record<string, string | undefined>): ZkPassportConfig | null {
  const secret = (env.BOREAL_PSEUDONYM_SECRET || env.CONCORDIUM_PSEUDONYM_SECRET || "").trim();
  if (secret.length < 32) return null;
  const site = env.PUBLIC_URL || "https://boreal.work";
  let domain: string;
  try {
    domain = env.ZKPASSPORT_DOMAIN?.trim() || new URL(site).hostname;
  } catch {
    return null;
  }
  const mainnet = (env.BOREAL_NETWORK || env.CONCORDIUM_NETWORK) === "mainnet";
  return {
    domain,
    // Mock passports prove anything: refused on mainnet whatever the setting says.
    devMode: env.ZKPASSPORT_DEV_MODE === "1" && !mainnet,
    verifierMode: env.ZKPASSPORT_VERIFIER === "api" ? "api" : "local",
    rpcUrl: env.ZKPASSPORT_RPC_URL?.trim() || undefined,
    pseudonymSecret: secret,
  };
}

/** A fresh one-time value the proofs are bound to. */
export function newNonce(): string {
  return randomBytes(16).toString("hex");
}

/** `YYYYMMDD` from a disclosed birth date (a Date, or its JSON string after the trip to the browser). */
function compactDate(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

type Disclosed = { disclose?: { result?: unknown } } | undefined;
const disclosed = (field: unknown) => (field as Disclosed)?.disclose?.result;

/** The query result fields boreal.work reads, as they come back from the phone. */
export interface PassportQueryResult {
  age?: { gte?: { result?: boolean; expected?: unknown } };
  facematch?: { passed?: boolean };
  nationality?: Disclosed;
  firstname?: Disclosed;
  lastname?: Disclosed;
  birthdate?: Disclosed;
  [key: string]: unknown;
}

/**
 * The worker's identity from proofs ZKPassport verified: the keyed identifier, what the proof
 * showed, and the person code (the same one Concordium ID gives) from name and birth date, which
 * are read here and never kept.
 */
export function readPassportResult(
  verified: { verified: boolean; uniqueIdentifier: string | undefined },
  queryResult: PassportQueryResult,
  pseudonymSecret: string,
): PassportIdentity {
  if (!verified.verified) throw new ZkPassportError("the passport proof didn't verify");
  if (!verified.uniqueIdentifier) throw new ZkPassportError("the proof has no unique identifier");
  if (queryResult.age?.gte?.result !== true || Number(queryResult.age.gte.expected) !== 18) {
    throw new ZkPassportError("the proof doesn't show you are 18 or older");
  }
  if (queryResult.facematch?.passed !== true) throw new ZkPassportError("the face check on your phone didn't pass");

  const ref = `zkp:${createHmac("sha256", pseudonymSecret).update(`zkpassport|${verified.uniqueIdentifier}`).digest("hex")}`;
  const attributes: Record<string, string> = { age_over_18: "true" };
  const nationality = disclosed(queryResult.nationality);
  if (typeof nationality === "string" && /^[A-Z]{3}$/.test(nationality)) attributes.nationality = nationality;

  const first = disclosed(queryResult.firstname);
  const last = disclosed(queryResult.lastname);
  const dob = compactDate(disclosed(queryResult.birthdate));
  const person =
    typeof first === "string" && typeof last === "string" && dob
      ? personRef({ firstName: first, lastName: last, dob }, pseudonymSecret)
      : undefined;
  return { ref, provenAttributes: attributes, ...(person ? { personRef: person } : {}) };
}

export interface ZkPassportVerifier {
  readonly config: ZkPassportConfig;
  /** Checks the phone's proofs against the question bound to `nonce`. Throws ZkPassportError when they don't hold. */
  verify(nonce: string, proofs: unknown, queryResult: unknown): Promise<PassportIdentity>;
}

let sdk: typeof import("@zkpassport/sdk") | undefined;

/**
 * The SDK's CommonJS build, loaded on first use (it and its prover are large, and only the
 * verification route needs them). Its ESM build imports `buffer/`, which Node's ESM loader refuses.
 */
function loadSdk(): typeof import("@zkpassport/sdk") {
  sdk ??= createRequire(import.meta.url)("@zkpassport/sdk") as typeof import("@zkpassport/sdk");
  return sdk;
}

export function createZkPassportVerifier(config: ZkPassportConfig): ZkPassportVerifier {
  return {
    config,
    async verify(nonce, proofs, queryResult) {
      if (!Array.isArray(proofs) || proofs.length === 0 || proofs.length > 20 || !queryResult || typeof queryResult !== "object") {
        throw new ZkPassportError("the proof couldn't be read");
      }
      const { ZKPassport, NullifierType } = loadSdk();
      const zk = new ZKPassport(config.domain);
      const { query } = passportQuery(zk.createQuery(), nonce).done();
      const result = await zk.verify({
        proofs: proofs as Parameters<typeof zk.verify>[0]["proofs"],
        originalQuery: query,
        queryResult: queryResult as Parameters<typeof zk.verify>[0]["queryResult"],
        scope: ZKPASSPORT_SCOPE,
        devMode: config.devMode,
        uniqueIdentifierType: NullifierType.SALTED,
        verifierMode: config.verifierMode,
        ...(config.rpcUrl ? { config: { rpcUrl: config.rpcUrl } } : {}),
      });
      if (!result.verified) {
        // Logged by field name only, so a refusal can be diagnosed without personal data.
        console.warn(`[zkpassport] proofs refused: ${Object.keys(result.queryResultErrors ?? {}).join(", ") || "no reason given"}`);
        throw new ZkPassportError("the passport proof didn't verify. Try again from the start");
      }
      const salted = result.uniqueIdentifierType === NullifierType.SALTED || (config.devMode && result.uniqueIdentifierType === NullifierType.SALTED_MOCK);
      if (!salted) throw new ZkPassportError("the proof has the wrong kind of identifier");
      return readPassportResult(result, queryResult as PassportQueryResult, config.pseudonymSecret);
    },
  };
}
