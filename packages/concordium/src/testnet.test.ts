import { generateKeyPairSync, randomBytes } from "node:crypto";

import {
  AccountAddress,
  buildBasicAccountSigner,
  Cbor,
  CborAccountAddress,
  type ConcordiumGRPCClient,
  SequenceNumber,
  TokenAmount,
  TokenId,
  TransactionExpiry,
} from "@concordium/web-sdk";
import { Transaction } from "@concordium/web-sdk/transactions";
import { CONCORDIUM_TESTNET_CAIP2, type FacilitatorConcordiumSigner } from "@x402/concordium";
import { ExactConcordiumScheme } from "@x402/concordium/exact/facilitator";
import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Concordium, X402PaymentRequirement, SentTransfer, TransferJournal } from "./index";
import { loadConcordium } from "./index";
import {
  type Chain,
  createTestnetConcordium,
  type Facilitator,
  grpcChain,
  type PreparedTransaction,
  type TestnetConfig,
  testnetConfigFromEnv,
} from "./testnet";

const address = () => AccountAddress.fromBuffer(Uint8Array.from(randomBytes(32)).buffer).address;

/** A fresh ed25519 key: the hex seed Concordium signers take, and its public key. */
function keyPair() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const seed = privateKey.export({ format: "der", type: "pkcs8" }).subarray(-32).toString("hex");
  const pub = publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("hex");
  return { seed, pub };
}

const key = () => keyPair().seed;

function config(overrides: Partial<TestnetConfig> = {}): TestnetConfig {
  return {
    network: CONCORDIUM_TESTNET_CAIP2,
    grpcHost: "localhost",
    grpcPort: 20000,
    escrowAccount: address(),
    escrowKey: key(),
    sponsorAccount: address(),
    sponsorKey: key(),
    anchorAccount: address(),
    anchorKey: key(),
    tokenId: "USDR",
    paymentSecret: "p".repeat(32),
    ...overrides,
  };
}

function memoryJournal(): TransferJournal & { entries: Map<string, SentTransfer> } {
  const entries = new Map<string, SentTransfer>();
  return {
    entries,
    async find(k) {
      return entries.get(k) ?? null;
    },
    async save(k, sent) {
      entries.set(k, sent);
    },
  };
}

/** An in-memory chain: transactions land (or are rejected) when sent, and the log records the order of events. */
function fakeChain(clock: () => Date) {
  const log: string[] = [];
  const outcomes = new Map<string, "success" | "rejected" | "pending">();
  let n = 0;
  let rejectNext = false;
  const prepare = (kind: string, detail: string): PreparedTransaction => {
    const txHash = `${kind}-${++n}`.padEnd(64, "0");
    const tx = {
      txHash,
      expiry: Math.floor(clock().getTime() / 1000) + 300,
      async send() {
        log.push(`send ${txHash} ${detail}`);
        outcomes.set(txHash, rejectNext ? "rejected" : "success");
        rejectNext = false;
      },
    };
    return tx;
  };
  const chain: Chain = {
    async tokenDecimals() {
      return 6;
    },
    async tokenBalance() {
      return 12_345_678n;
    },
    async prepareTransfer({ to, amount, memo }) {
      return prepare("transfer", `${to} ${amount} ${memo}`);
    },
    async prepareAnchor(data) {
      return prepare("anchor", Buffer.from(data).toString("hex"));
    },
    async status(txHash) {
      const o = outcomes.get(txHash);
      if (!o) return { status: "unknown" };
      return o === "rejected" ? { status: "rejected", reason: "InsufficientFunds" } : { status: o };
    },
    async waitFor(txHash) {
      const o = outcomes.get(txHash);
      return o === "rejected" ? { status: "rejected", reason: "InsufficientFunds" } : { status: "success" };
    },
  };
  return { chain, log, outcomes, rejectNext: () => (rejectNext = true) };
}

/** What an agent's x402 client sends back: the requirement it accepted plus its signed transfer. */
function paymentFor(requirement: X402PaymentRequirement, signedTransaction: unknown = { version: 1 }): PaymentPayload {
  return {
    x402Version: 2,
    accepted: requirement as unknown as PaymentRequirements,
    payload: { signedTransaction } as unknown as PaymentPayload["payload"],
  } as PaymentPayload;
}

let clock: Date;
let cfg: TestnetConfig;
let fake: ReturnType<typeof fakeChain>;
let journal: ReturnType<typeof memoryJournal>;
let facilitator: Facilitator & { settle: ReturnType<typeof vi.fn> };
let c: Concordium;

beforeEach(() => {
  clock = new Date("2026-11-02T00:00:00Z");
  cfg = config();
  fake = fakeChain(() => clock);
  journal = memoryJournal();
  facilitator = {
    settle: vi.fn(async (_p: PaymentPayload, r: PaymentRequirements) => ({
      success: true,
      transaction: "f".repeat(64),
      network: r.network as `${string}:${string}`,
      payer: "payer",
    })),
  };
  c = createTestnetConcordium(cfg, { journal, chain: fake.chain, facilitator, registry: { lookup: async () => null }, now: () => clock });
});

describe("testnet funding over x402", () => {
  it("asks for the exact token amount into escrow, sponsored by boreal", async () => {
    const r = await c.payments.createPaymentRequest("task-1", 1_170);
    expect(r).toMatchObject({
      scheme: "exact",
      network: "ccd:4221332d34e1694168c2a0c0b3fd0f27",
      asset: "USDR",
      payTo: cfg.escrowAccount,
      amount: "11700000", // 11.70 USD with 6 token decimals
      extra: { feePayer: cfg.sponsorAccount, resource: "task-1", minorUnits: 1_170 },
    });
    expect(r.extra.seal).toBeTruthy();
  });

  it("settles a payment for the requirement it issued and reports minor units", async () => {
    const r = await c.payments.createPaymentRequest("task-1", 1_170);
    const settled = await c.payments.confirmPayment("task-1", paymentFor(r));
    expect(settled).toEqual({ txHash: "f".repeat(64), amount: 1_170 });
    expect(facilitator.settle).toHaveBeenCalledOnce();
    expect(facilitator.settle.mock.calls[0]![1]).toMatchObject({ amount: "11700000", payTo: cfg.escrowAccount });
  });

  it("refuses changed requirements, other tasks and expired requests before anything moves", async () => {
    const r = await c.payments.createPaymentRequest("task-1", 1_170);
    await expect(c.payments.confirmPayment("task-1", paymentFor({ ...r, amount: "1" }))).rejects.toThrow(/changed/);
    await expect(
      c.payments.confirmPayment("task-1", paymentFor({ ...r, extra: { ...r.extra, minorUnits: 1 } })),
    ).rejects.toThrow(/changed/);
    await expect(c.payments.confirmPayment("task-1", paymentFor({ ...r, payTo: address() }))).rejects.toThrow(/changed/);
    await expect(c.payments.confirmPayment("task-2", paymentFor(r))).rejects.toThrow(/another task/);
    await expect(c.payments.confirmPayment("task-1", { requirement: r, signature: "x" })).rejects.toThrow(/x402 v2/);
    clock = new Date(clock.getTime() + 16 * 60 * 1000);
    await expect(c.payments.confirmPayment("task-1", paymentFor(r))).rejects.toThrow(/expired/);
    expect(facilitator.settle).not.toHaveBeenCalled();
  });

  it("throws when the facilitator can't settle", async () => {
    facilitator.settle.mockResolvedValueOnce({ success: false, transaction: "", network: CONCORDIUM_TESTNET_CAIP2, errorReason: "preflight_insufficient_token_funds" });
    const r = await c.payments.createPaymentRequest("task-1", 1_170);
    await expect(c.payments.confirmPayment("task-1", paymentFor(r))).rejects.toThrow(/insufficient_token_funds/);
  });
});

describe("testnet payouts and refunds", () => {
  const transfer = { to: "worker-acct", amount: 1_000, idempotencyKey: "task-1:pay-worker" };

  it("journals the transfer before sending it, with the amount in token units", async () => {
    const save = vi.spyOn(journal, "save").mockImplementation(async (k, sent) => {
      fake.log.push(`journal ${sent.txHash}`);
      journal.entries.set(k, sent);
    });
    const { txHash } = await c.payments.sponsoredTransfer(transfer);
    expect(save).toHaveBeenCalledOnce();
    expect(fake.log[0]).toBe(`journal ${txHash}`);
    expect(fake.log[1]).toMatch(new RegExp(`^send ${txHash} worker-acct 10000000 boreal:[0-9a-f]{32}$`));
    // The memo is a hash of the ledger key, never the key or anything personal.
    expect(fake.log[1]).not.toContain("task-1");
  });

  it("never sends twice for the same ledger key", async () => {
    const first = await c.payments.sponsoredTransfer(transfer);
    const again = await c.payments.sponsoredTransfer(transfer);
    expect(again.txHash).toBe(first.txHash);
    expect(fake.log.filter((l) => l.startsWith("send"))).toHaveLength(1);
  });

  it("waits out a journaled transfer the chain hasn't seen, then sends afresh once it has expired", async () => {
    // A crash between journaling and sending: the chain never saw the transaction.
    const tx = await fake.chain.prepareTransfer({ to: "worker-acct", amount: 1n, memo: "m" });
    await journal.save(transfer.idempotencyKey, { txHash: tx.txHash, expiry: tx.expiry });

    await expect(c.payments.sponsoredTransfer(transfer)).rejects.toThrow(/may still land/);
    expect(fake.log).toHaveLength(0);

    clock = new Date(clock.getTime() + 301 * 1000);
    const { txHash } = await c.payments.sponsoredTransfer(transfer);
    expect(txHash).not.toBe(tx.txHash);
    expect(journal.entries.get(transfer.idempotencyKey)?.txHash).toBe(txHash);
    expect(fake.log.filter((l) => l.startsWith("send"))).toHaveLength(1);
  });

  it("waits for a pending journaled transfer instead of sending another", async () => {
    const tx = await fake.chain.prepareTransfer({ to: "worker-acct", amount: 1n, memo: "m" });
    await journal.save(transfer.idempotencyKey, { txHash: tx.txHash, expiry: tx.expiry });
    fake.outcomes.set(tx.txHash, "pending");
    expect((await c.payments.sponsoredTransfer(transfer)).txHash).toBe(tx.txHash);
    expect(fake.log).toHaveLength(0);
  });

  it("reports an on-chain rejection, and sends again on retry since nothing moved", async () => {
    fake.rejectNext();
    await expect(c.payments.sponsoredTransfer(transfer)).rejects.toThrow(/rejected on-chain: InsufficientFunds/);
    const { txHash } = await c.payments.sponsoredTransfer(transfer);
    expect(fake.log.filter((l) => l.startsWith("send"))).toHaveLength(2);
    expect(journal.entries.get(transfer.idempotencyKey)?.txHash).toBe(txHash);
  });

  it("reads the escrow balance in whole minor units", async () => {
    expect(await c.payments.escrowBalance()).toBe(1_234); // 12.345678 USDR, dust ignored
  });
});

describe("testnet anchors", () => {
  it("registers the event hash as CBOR text", async () => {
    const hash = "a".repeat(64);
    const { txHash } = await c.anchor.anchor(hash);
    const text = `boreal:${hash}`;
    expect(fake.log).toEqual([`send ${txHash} 7847${Buffer.from(text).toString("hex")}`]);
    await expect(c.anchor.anchor("not a hash")).rejects.toThrow(/SHA-256/);
  });
});

describe("testnet config", () => {
  const env = () => ({
    CONCORDIUM_MODE: "testnet",
    CONCORDIUM_ESCROW_ACCOUNT: address(),
    CONCORDIUM_ESCROW_KEY: key(),
    CONCORDIUM_ANCHOR_ACCOUNT: address(),
    CONCORDIUM_ANCHOR_KEY: key(),
    CONCORDIUM_PAYMENT_SECRET: "p".repeat(32),
  });

  it("defaults the sponsor to the anchor account and the token to USDR", () => {
    const e = env();
    const parsed = testnetConfigFromEnv(e);
    expect(parsed).toMatchObject({ sponsorAccount: e.CONCORDIUM_ANCHOR_ACCOUNT, tokenId: "USDR", grpcHost: "grpc.testnet.concordium.com" });
  });

  it("refuses mainnet, missing keys and an escrow that doubles as the sponsor", () => {
    expect(() => testnetConfigFromEnv({ ...env(), CONCORDIUM_NETWORK: "mainnet" })).toThrow(/testnet only/);
    expect(() => testnetConfigFromEnv({ ...env(), CONCORDIUM_ESCROW_KEY: undefined })).toThrow(/CONCORDIUM_ESCROW_KEY/);
    expect(() => testnetConfigFromEnv({ ...env(), CONCORDIUM_PAYMENT_SECRET: "short" })).toThrow(/PAYMENT_SECRET/);
    const e = env();
    expect(() => testnetConfigFromEnv({ ...e, CONCORDIUM_ESCROW_ACCOUNT: e.CONCORDIUM_ANCHOR_ACCOUNT })).toThrow(/its own account/);
  });

  it("needs a durable journal to load", () => {
    expect(() => loadConcordium(env())).toThrow(/journal/);
    expect(loadConcordium(env(), { journal: memoryJournal() })).not.toBeNull();
  });
});

describe("x402 facilitator on a signed agent transfer", () => {
  // The real `@x402/concordium` facilitator checks, against a fake chain behind its signer.
  const payer = keyPair();
  const payerAccount = address();

  async function signedTransfer(r: X402PaymentRequirement, amount = BigInt(r.amount), payTo = r.payTo) {
    const signable = Transaction.tokenUpdate({
      tokenId: TokenId.fromString(r.asset),
      operations: Cbor.encode([
        { transfer: { amount: TokenAmount.create(amount, 6), recipient: CborAccountAddress.fromAccountAddress(AccountAddress.fromBase58(payTo)) } },
      ]),
    })
      .addMetadata({
        sender: AccountAddress.fromBase58(payerAccount),
        nonce: SequenceNumber.create(7),
        expiry: TransactionExpiry.fromEpochSeconds(Math.floor(Date.now() / 1000) + 200),
      })
      .addSponsor(AccountAddress.fromBase58(r.extra.feePayer!))
      .build();
    const signed = await Transaction.sign(signable, buildBasicAccountSigner(payer.seed));
    return JSON.parse(JSON.stringify(Transaction.toJSON(signed), (_k, v) => (typeof v === "bigint" ? Number(v) : v)));
  }

  function facilitatorWith(submitted: string[]) {
    const signer: FacilitatorConcordiumSigner = {
      getAddress: () => cfg.sponsorAccount,
      getNetwork: () => CONCORDIUM_TESTNET_CAIP2,
      async getAccountInfo() {
        return {
          accountAddress: AccountAddress.fromBase58(payerAccount),
          accountNonce: 7n,
          accountThreshold: 1,
          accountCredentials: { 0: { value: { contents: { credentialPublicKeys: { threshold: 1, keys: { 0: { schemeId: "Ed25519", verifyKey: payer.pub } } } } } } },
        } as never;
      },
      async addSponsorSignature(tx) {
        return tx as never;
      },
      async submitTransaction() {
        submitted.push("tx");
        return "e".repeat(64);
      },
      async waitForFinalization(txHash) {
        return { txHash, status: "finalized", sender: payerAccount, recipient: cfg.escrowAccount };
      },
      async getTokenBalance() {
        return 10n ** 12n;
      },
      async getTokenDecimals() {
        return 6;
      },
    };
    return new ExactConcordiumScheme({ signer });
  }

  it("settles the exact transfer and refuses a short one", async () => {
    const submitted: string[] = [];
    const real = createTestnetConcordium(cfg, { journal, chain: fake.chain, facilitator: facilitatorWith(submitted), registry: { lookup: async () => null } });
    const r = await real.payments.createPaymentRequest("task-1", 1_170);

    await expect(real.payments.confirmPayment("task-1", paymentFor(r, await signedTransfer(r, 1n)))).rejects.toThrow(/amount_mismatch/);
    await expect(real.payments.confirmPayment("task-1", paymentFor(r, await signedTransfer(r, undefined, address())))).rejects.toThrow(/recipient_mismatch/);
    expect(submitted).toHaveLength(0);

    expect(await real.payments.confirmPayment("task-1", paymentFor(r, await signedTransfer(r)))).toEqual({ txHash: "e".repeat(64), amount: 1_170 });
    expect(submitted).toHaveLength(1);
  });
});

describe("grpc chain", () => {
  function fakeGrpc() {
    const sent: Transaction.Finalized[] = [];
    const client = {
      async getNextAccountNonce() {
        return { nonce: SequenceNumber.create(3), allFinal: true };
      },
      async getTokenInfo() {
        return { state: { decimals: 6 } };
      },
      async sendTransaction(tx: Transaction.Finalized) {
        sent.push(tx);
      },
      async getAccountInfo() {
        return { accountTokens: [{ id: TokenId.fromString("USDR"), state: { balance: TokenAmount.create(5_000_000n, 6) } }] };
      },
      async getBlockItemStatus(hash: { toString(): string }) {
        if (hash.toString().startsWith("00")) throw Object.assign(new Error("not found"), { code: 5 });
        return { status: "finalized", outcome: { summary: { transactionType: "failed", rejectReason: { tag: "TokenUpdateTransactionFailed" } } } };
      },
    };
    return { client: client as unknown as ConcordiumGRPCClient, sent };
  }

  it("builds a sponsored escrow transfer whose hash is known before it is sent", async () => {
    const { client, sent } = fakeGrpc();
    const chain = grpcChain(client, cfg, { now: () => clock });
    const tx = await chain.prepareTransfer({ to: address(), amount: 10_000_000n, memo: "boreal:abc" });
    expect(tx.txHash).toMatch(/^[0-9a-f]{64}$/);
    expect(tx.expiry).toBe(Math.floor(clock.getTime() / 1000) + 300);
    expect(sent).toHaveLength(0);
    await tx.send();
    expect(sent).toHaveLength(1);
    const finalized = sent[0]!;
    expect(Buffer.from(Transaction.getAccountTransactionHash(finalized)).toString("hex")).toBe(tx.txHash);
    const json = JSON.stringify(finalized, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
    // Sent by escrow, with the sponsor's signature alongside the sender's.
    expect(json).toContain(cfg.sponsorAccount);
    expect((finalized as { signatures?: { sponsor?: object } }).signatures?.sponsor).toBeTruthy();
    expect(await chain.tokenBalance(cfg.escrowAccount)).toBe(5_000_000n);
  });

  it("maps unknown and rejected transactions", async () => {
    const { client } = fakeGrpc();
    const chain = grpcChain(client, cfg);
    expect(await chain.status("00".repeat(32))).toEqual({ status: "unknown" });
    expect(await chain.status("ab".repeat(32))).toEqual({ status: "rejected", reason: "TokenUpdateTransactionFailed" });
  });
});
