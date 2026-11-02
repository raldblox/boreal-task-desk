// Agent workers prove they control a NEAR account with a NEP-413 signed message: the payload
// below, Borsh-encoded behind the NEP-413 tag, SHA-256'd and signed with a full-access key of
// the account. The nonce starts with the signing time, so a signature is good for minutes only.

import { createHash, createPublicKey, verify } from "node:crypto";

import type { NearChain } from "./chain";
import { isNearAccountId } from "./payments";
import { base58Decode } from "./tx";

export const SIGN_IN_MESSAGE = "Sign in to boreal as an agent worker";
/** 2^31 + 413: NEP-413's tag, so a signed message can never be a valid transaction. */
const NEP413_TAG = 2147484061;
const MAX_AGE_MS = 10 * 60 * 1000;

export class NearSignInError extends Error {}

export interface NearSignIn {
  accountId: string;
  /** `ed25519:<base58>`. */
  publicKey: string;
  /** Base64 ed25519 signature. */
  signature: string;
  /** Base64, 32 bytes: the signing time in milliseconds (big-endian, 8 bytes), then anything. */
  nonce: string;
  message: string;
  recipient: string;
}

function borshString(value: string): Buffer {
  const bytes = Buffer.from(value, "utf8");
  const length = Buffer.alloc(4);
  length.writeUInt32LE(bytes.length);
  return Buffer.concat([length, bytes]);
}

/** The bytes an agent signs (after SHA-256) for a NEP-413 message with no callback URL. */
export function nep413Digest(message: string, nonce: Uint8Array, recipient: string): Buffer {
  const tag = Buffer.alloc(4);
  tag.writeUInt32LE(NEP413_TAG);
  const body = Buffer.concat([tag, borshString(message), Buffer.from(nonce), borshString(recipient), Buffer.from([0])]);
  return createHash("sha256").update(body).digest();
}

/** A fresh nonce for a sign-in signed now. */
export function signInNonce(at: Date, random: Uint8Array): Uint8Array {
  const nonce = Buffer.alloc(32);
  nonce.writeBigUInt64BE(BigInt(at.getTime()));
  Buffer.from(random).copy(nonce, 8, 0, 24);
  return nonce;
}

/**
 * Checks a sign-in: the boreal message for this recipient, signed recently, by a full-access
 * key of the account. Returns the account and when it was signed.
 */
export async function verifyNearSignIn(
  input: NearSignIn,
  options: { chain: NearChain; recipient: string; now?: () => Date },
): Promise<{ accountId: string; signedAt: Date }> {
  const now = options.now?.() ?? new Date();
  if (!isNearAccountId(input.accountId)) throw new NearSignInError("accountId isn't a NEAR account id");
  if (input.message !== SIGN_IN_MESSAGE) throw new NearSignInError(`sign the message "${SIGN_IN_MESSAGE}"`);
  if (input.recipient !== options.recipient) throw new NearSignInError(`sign with recipient "${options.recipient}"`);
  const nonce = Buffer.from(input.nonce, "base64");
  if (nonce.length !== 32) throw new NearSignInError("nonce must be 32 bytes, base64");
  const signedAt = new Date(Number(nonce.readBigUInt64BE(0)));
  if (Math.abs(now.getTime() - signedAt.getTime()) > MAX_AGE_MS) {
    throw new NearSignInError("the nonce must start with the signing time in milliseconds, within 10 minutes of now");
  }
  const [curve, encoded] = input.publicKey.split(":");
  if (curve !== "ed25519" || !encoded) throw new NearSignInError("publicKey must look like ed25519:<base58>");
  const raw = Buffer.from(base58Decode(encoded));
  if (raw.length !== 32) throw new NearSignInError("publicKey must be a 32-byte ed25519 key");
  const key = createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: raw.toString("base64url") }, format: "jwk" });
  const signature = Buffer.from(input.signature, "base64");
  if (signature.length !== 64 || !verify(null, nep413Digest(input.message, nonce, input.recipient), key, signature)) {
    throw new NearSignInError("the signature doesn't match");
  }
  if ((await options.chain.keyPermission(input.accountId, input.publicKey)) !== "FullAccess") {
    throw new NearSignInError("sign with a full-access key of that account");
  }
  return { accountId: input.accountId, signedAt };
}
