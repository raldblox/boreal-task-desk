// An in-memory NEAR with one NEP-141 token, for tests and local runs. It decodes the Borsh
// transactions boreal signs and checks their ed25519 signatures, so the real encoder is tested.

import { createHash, createPublicKey, verify } from "node:crypto";

import type { MarketAssignment, AgentMarket } from "./market";
import type { NearChain, TxOutcome } from "./chain";
import { base58Encode } from "./tx";

class Reader {
  private at = 0;
  constructor(private readonly buf: Buffer) {}
  u8() {
    return this.buf[this.at++]!;
  }
  u32() {
    const v = this.buf.readUInt32LE(this.at);
    this.at += 4;
    return v;
  }
  u64() {
    const v = this.buf.readBigUInt64LE(this.at);
    this.at += 8;
    return v;
  }
  u128() {
    const lo = this.u64();
    return (this.u64() << BigInt("64")) | lo;
  }
  bytes(n: number) {
    const v = this.buf.subarray(this.at, this.at + n);
    this.at += n;
    return v;
  }
  string() {
    return this.bytes(this.u32()).toString("utf8");
  }
  get offset() {
    return this.at;
  }
}

export interface DecodedTx {
  hash: string;
  signerId: string;
  publicKey: Buffer;
  nonce: bigint;
  receiverId: string;
  calls: { methodName: string; args: unknown; gas: bigint; deposit: bigint }[];
  signatureValid: boolean;
}

export function decodeSignedTransaction(base64: string): DecodedTx {
  const buf = Buffer.from(base64, "base64");
  const r = new Reader(buf);
  const signerId = r.string();
  if (r.u8() !== 0) throw new Error("only ed25519 keys");
  const publicKey = Buffer.from(r.bytes(32));
  const nonce = r.u64();
  const receiverId = r.string();
  r.bytes(32);
  const calls: DecodedTx["calls"] = [];
  for (let i = r.u32(); i > 0; i--) {
    if (r.u8() !== 2) throw new Error("only function calls");
    const methodName = r.string();
    const args = JSON.parse(r.bytes(r.u32()).toString("utf8"));
    calls.push({ methodName, args, gas: r.u64(), deposit: r.u128() });
  }
  const body = buf.subarray(0, r.offset);
  if (r.u8() !== 0) throw new Error("only ed25519 signatures");
  const signature = r.bytes(64);
  const digest = createHash("sha256").update(body).digest();
  const key = createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: publicKey.toString("base64url") }, format: "jwk" });
  return { hash: base58Encode(digest), signerId, publicKey, nonce, receiverId, calls, signatureValid: verify(null, digest, key, signature) };
}

export interface FakeNear extends NearChain {
  balances: Map<string, bigint>;
  registered: Set<string>;
  sent: DecodedTx[];
  /** Records an outside transfer (an agent paying escrow) and returns its hash. */
  externalTransfer(from: string, to: string, amount: bigint, memo: string): string;
  /** Makes the next `send` fail at the network after the chain accepted it (a lost reply). */
  dropNextReply(): void;
}

export function createFakeNear(token: string): FakeNear {
  const balances = new Map<string, bigint>();
  const registered = new Set<string>();
  const outcomes = new Map<string, TxOutcome>();
  const nonces = new Map<string, bigint>();
  const sent: DecodedTx[] = [];
  let dropReply = false;
  let n = 0;

  function apply(signerId: string, calls: { methodName: string; args: unknown; deposit: bigint }[]): string | undefined {
    for (const call of calls) {
      const args = call.args as Record<string, string>;
      if (call.methodName === "storage_deposit") {
        registered.add(args.account_id!);
      } else if (call.methodName === "ft_transfer") {
        if (call.deposit !== BigInt("1")) return "ft_transfer needs exactly 1 yoctoNEAR";
        if (!registered.has(args.receiver_id!)) return `${args.receiver_id} is not registered`;
        const amount = BigInt(args.amount!);
        const from = balances.get(signerId) ?? BigInt("0");
        if (from < amount) return "not enough balance";
        balances.set(signerId, from - amount);
        balances.set(args.receiver_id!, (balances.get(args.receiver_id!) ?? BigInt("0")) + amount);
      }
    }
    return undefined;
  }

  return {
    balances,
    registered,
    sent,
    dropNextReply() {
      dropReply = true;
    },
    externalTransfer(from, to, amount, memo) {
      const hash = base58Encode(createHash("sha256").update(`external-${n++}`).digest());
      const calls = [{ methodName: "ft_transfer", args: { receiver_id: to, amount: amount.toString(), memo }, deposit: BigInt("1") }];
      const error = apply(from, calls);
      outcomes.set(hash, {
        hash,
        status: error ? "failed" : "success",
        signerId: from,
        receiverId: token,
        calls: calls.map(({ methodName, args }) => ({ methodName, args })),
        ...(error ? { error } : {}),
      });
      return hash;
    },
    async view(contractId, methodName, args) {
      if (contractId !== token) throw new Error(`unknown contract ${contractId}`);
      const { account_id } = args as { account_id: string };
      if (methodName === "storage_balance_of") return registered.has(account_id) ? { total: "1250000000000000000000", available: "0" } : null;
      if (methodName === "ft_balance_of") return (balances.get(account_id) ?? BigInt("0")).toString();
      throw new Error(`unknown view ${methodName}`);
    },
    async accessKey(accountId) {
      return { nonce: nonces.get(accountId) ?? BigInt("100"), blockHash: base58Encode(Buffer.alloc(32, 7)) };
    },
    async send(base64) {
      const tx = decodeSignedTransaction(base64);
      if (!tx.signatureValid) throw new Error("invalid signature");
      if (tx.nonce <= (nonces.get(tx.signerId) ?? BigInt("100"))) throw new Error("InvalidNonce");
      nonces.set(tx.signerId, tx.nonce);
      sent.push(tx);
      const error = tx.receiverId === token ? apply(tx.signerId, tx.calls) : "unknown contract";
      const outcome: TxOutcome = {
        hash: tx.hash,
        status: error ? "failed" : "success",
        signerId: tx.signerId,
        receiverId: tx.receiverId,
        calls: tx.calls.map(({ methodName, args }) => ({ methodName, args })),
        ...(error ? { error } : {}),
      };
      outcomes.set(tx.hash, outcome);
      if (dropReply) {
        dropReply = false;
        throw new Error("socket hang up");
      }
      return outcome;
    },
    async status(hash) {
      return outcomes.get(hash) ?? null;
    },
  };
}

export interface FakeMarket extends AgentMarket {
  rows: MarketAssignment[];
  messages: { assignmentId: string; body: string }[];
  submitted: { assignmentId: string; markdown: string }[];
  hire(id: string, brief: string, slaDeadlineAt: Date): void;
}

export function createFakeMarket(): FakeMarket {
  const rows: MarketAssignment[] = [];
  const messages: FakeMarket["messages"] = [];
  const submitted: FakeMarket["submitted"] = [];
  const find = (id: string) => {
    const row = rows.find((r) => r.assignment.assignmentId === id);
    if (!row) throw new Error(`no assignment ${id}`);
    return row;
  };
  return {
    rows,
    messages,
    submitted,
    hire(id, brief, slaDeadlineAt) {
      rows.push({ assignment: { assignmentId: id, startedAt: null, slaDeadlineAt: slaDeadlineAt.toISOString() }, job: { description: brief } });
    },
    async assignments() {
      return rows.filter((r) => !submitted.some((s) => s.assignmentId === r.assignment.assignmentId));
    },
    async start(id) {
      find(id).assignment.startedAt ??= new Date().toISOString();
    },
    async message(id, body) {
      find(id);
      messages.push({ assignmentId: id, body });
    },
    async submit(id, markdown) {
      if (!find(id).assignment.startedAt) throw new Error("submit before start");
      submitted.push({ assignmentId: id, markdown });
    },
  };
}
