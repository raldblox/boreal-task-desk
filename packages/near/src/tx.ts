// NEAR transactions without an SDK: Borsh-encode the transaction, sign its SHA-256 with the
// account's ed25519 key (Node's own crypto), and send it base64-encoded over JSON-RPC.
// Only what boreal sends is covered: function calls to one token contract.

import { createHash, createPrivateKey, createPublicKey, type KeyObject, sign } from "node:crypto";

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function base58Encode(bytes: Uint8Array): string {
  let n = BigInt("0");
  for (const b of bytes) n = n * BigInt("256") + BigInt(b);
  let out = "";
  while (n > BigInt("0")) {
    out = ALPHABET[Number(n % BigInt("58"))] + out;
    n /= BigInt("58");
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = "1" + out;
  }
  return out;
}

export function base58Decode(text: string): Uint8Array {
  let n = BigInt("0");
  for (const c of text) {
    const i = ALPHABET.indexOf(c);
    if (i < 0) throw new Error("invalid base58");
    n = n * BigInt("58") + BigInt(i);
  }
  const bytes: number[] = [];
  while (n > BigInt("0")) {
    bytes.unshift(Number(n % BigInt("256")));
    n /= BigInt("256");
  }
  for (const c of text) {
    if (c !== "1") break;
    bytes.unshift(0);
  }
  return Uint8Array.from(bytes);
}

/** An account's full-access key, read from NEAR's `ed25519:<base58>` secret key format. */
export interface NearSigner {
  accountId: string;
  /** `ed25519:<base58 public key>`, as NEAR names keys. */
  publicKey: string;
  publicKeyBytes: Uint8Array;
  sign(message: Uint8Array): Uint8Array;
}

const b64url = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");

export function nearSigner(accountId: string, secretKey: string): NearSigner {
  const [curve, encoded] = secretKey.split(":");
  if (curve !== "ed25519" || !encoded) throw new Error("NEAR keys must look like ed25519:<base58>");
  const raw = base58Decode(encoded);
  // NEAR stores the 32-byte seed followed by the 32-byte public key; a bare seed also works.
  if (raw.length !== 64 && raw.length !== 32) throw new Error("NEAR ed25519 secret key has the wrong length");
  const seed = raw.subarray(0, 32);
  let key: KeyObject;
  let pub: Uint8Array;
  if (raw.length === 64) {
    pub = raw.subarray(32);
    key = createPrivateKey({ key: { kty: "OKP", crv: "Ed25519", d: b64url(seed), x: b64url(pub) }, format: "jwk" });
  } else {
    // PKCS#8 wrapper for a raw ed25519 seed, then derive the public half.
    const der = Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), seed]);
    key = createPrivateKey({ key: der, format: "der", type: "pkcs8" });
    pub = Buffer.from(createPublicKey(key).export({ format: "jwk" }).x!, "base64url");
  }
  return {
    accountId,
    publicKey: `ed25519:${base58Encode(pub)}`,
    publicKeyBytes: pub,
    sign: (message) => new Uint8Array(sign(null, message, key)),
  };
}

class Writer {
  private chunks: Buffer[] = [];
  u8(v: number) {
    this.chunks.push(Buffer.from([v]));
  }
  u32(v: number) {
    const b = Buffer.alloc(4);
    b.writeUInt32LE(v);
    this.chunks.push(b);
  }
  u64(v: bigint) {
    const b = Buffer.alloc(8);
    b.writeBigUInt64LE(v);
    this.chunks.push(b);
  }
  u128(v: bigint) {
    this.u64(v & BigInt("0xffffffffffffffff"));
    this.u64(v >> BigInt("64"));
  }
  bytes(v: Uint8Array) {
    this.chunks.push(Buffer.from(v));
  }
  string(v: string) {
    const b = Buffer.from(v, "utf8");
    this.u32(b.length);
    this.chunks.push(b);
  }
  done(): Uint8Array {
    return new Uint8Array(Buffer.concat(this.chunks));
  }
}

export interface FunctionCall {
  methodName: string;
  args: unknown;
  /** Gas units. */
  gas: bigint;
  /** Attached deposit in yoctoNEAR. */
  deposit: bigint;
}

export interface SignedTx {
  /** Base58 SHA-256 of the transaction: its id on the explorer. */
  hash: string;
  /** Base64 Borsh-encoded signed transaction, for `send_tx`. */
  base64: string;
}

/** Builds and signs a transaction of function calls from `signer` to `receiverId`. */
export function signTransaction(
  signer: NearSigner,
  tx: { receiverId: string; nonce: bigint; blockHash: string; calls: FunctionCall[] },
): SignedTx {
  const w = new Writer();
  w.string(signer.accountId);
  w.u8(0); // ed25519
  w.bytes(signer.publicKeyBytes);
  w.u64(tx.nonce);
  w.string(tx.receiverId);
  const blockHash = base58Decode(tx.blockHash);
  if (blockHash.length !== 32) throw new Error("block hash must be 32 bytes");
  w.bytes(blockHash);
  w.u32(tx.calls.length);
  for (const call of tx.calls) {
    w.u8(2); // Action::FunctionCall
    w.string(call.methodName);
    const args = Buffer.from(JSON.stringify(call.args), "utf8");
    w.u32(args.length);
    w.bytes(args);
    w.u64(call.gas);
    w.u128(call.deposit);
  }
  const body = w.done();
  const digest = createHash("sha256").update(body).digest();
  const signature = signer.sign(digest);
  const signed = Buffer.concat([Buffer.from(body), Buffer.from([0]), Buffer.from(signature)]);
  return { hash: base58Encode(digest), base64: signed.toString("base64") };
}
