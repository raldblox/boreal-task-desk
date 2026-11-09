import { createHash } from "node:crypto";

import { secp256k1 } from "@noble/curves/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";

// Proof that an answer came from a model running in a TEE on NEAR AI Cloud, and from no one
// else. Three checks, all on data recorded with the verdict, so anyone can repeat them:
//
// 1. The signed text is "<model>:<sha256 of the exact request>:<sha256 of the exact response>",
//    so the signature covers what boreal.work sent and what came back, byte for byte.
// 2. The ECDSA signature (Ethereum personal_sign, EIP-191) recovers to the signing address.
// 3. The model's Intel TDX quote, fetched with a fresh nonce, carries that address and the
//    nonce in its report_data: the signing key lives inside that TEE, attested at that time.
//
// What this does not do: check Intel's and NVIDIA's certificate chains on the quote itself.
// The quote is kept in the proof so NEAR's verifier (github.com/nearai/nearai-cloud-verifier)
// can check it end to end.

export interface PrivateInferenceProof {
  provider: "near-ai-cloud";
  model: string;
  /** The chat completion's id at NEAR AI Cloud. */
  completionId: string;
  requestSha256: string;
  responseSha256: string;
  /** "<model>:<requestSha256>:<responseSha256>", as NEAR AI signed it. */
  signedText: string;
  /** 0x-prefixed 65-byte ECDSA signature. */
  signature: string;
  /** 0x-prefixed Ethereum-style address of the TEE's signing key. */
  signingAddress: string;
  attestation: {
    /** The fresh nonce boreal.work asked the attestation for, hex. */
    nonce: string;
    checkedAt: string;
    /** The model's Intel TDX quote, hex. */
    intelQuote: string;
  };
}

export const sha256Hex = (data: string | Uint8Array) => createHash("sha256").update(data).digest("hex");

/** The address an EIP-191 (personal_sign) signature over `text` recovers to, lower-case 0x hex. */
export function recoverSigner(text: string, signature: string): string {
  const message = Buffer.from(text, "utf8");
  const digest = keccak_256(Buffer.concat([Buffer.from(`\x19Ethereum Signed Message:\n${message.length}`), message]));
  const sig = Buffer.from(signature.replace(/^0x/, ""), "hex");
  if (sig.length !== 65) throw new Error("signature must be 65 bytes");
  let v = sig[64]!;
  if (v >= 27) v -= 27;
  const publicKey = secp256k1.Signature.fromCompact(sig.subarray(0, 64)).addRecoveryBit(v).recoverPublicKey(digest).toRawBytes(false);
  return `0x${Buffer.from(keccak_256(publicKey.subarray(1)).subarray(12)).toString("hex")}`;
}

/** report_data from an Intel TDX v4 quote: the last 64 bytes of the TD report, after the 48-byte header. */
export function quoteReportData(intelQuote: string): string {
  const quote = Buffer.from(intelQuote, "hex");
  if (quote.length < 632 || quote.readUInt16LE(0) !== 4) throw new Error("not a TDX v4 quote");
  return quote.subarray(48 + 520, 48 + 584).toString("hex");
}

/** Every problem with a proof; empty when all three checks pass. */
export function checkProof(proof: PrivateInferenceProof): string[] {
  const problems: string[] = [];
  if (proof.signedText !== `${proof.model}:${proof.requestSha256}:${proof.responseSha256}`) {
    problems.push("the signed text doesn't cover this request and response");
  }
  try {
    if (recoverSigner(proof.signedText, proof.signature) !== proof.signingAddress.toLowerCase()) {
      problems.push("the signature doesn't recover to the signing address");
    }
  } catch (error) {
    problems.push(`the signature can't be read: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    const reportData = quoteReportData(proof.attestation.intelQuote);
    const address = proof.signingAddress.replace(/^0x/, "").toLowerCase();
    // The address, zero-padded to 32 bytes, then the 32-byte nonce.
    if (reportData !== `${address.padEnd(64, "0")}${proof.attestation.nonce.toLowerCase()}`) {
      problems.push("the TEE quote doesn't bind this signing address and nonce");
    }
  } catch (error) {
    problems.push(`the TEE quote can't be read: ${error instanceof Error ? error.message : String(error)}`);
  }
  return problems;
}
