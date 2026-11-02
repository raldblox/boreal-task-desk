import { beforeEach, describe, expect, it } from "vitest";

import { createFakeNear, decodeSignedTransaction, type FakeNear } from "./fake-near";
import { createNearPayments, fundingMemo, type NearPayments } from "./payments";
import { memoryJournal, newNearKey } from "./testing";
import { base58Decode, base58Encode, nearSigner, signTransaction } from "./tx";

const USDC = "usdc.fakes.testnet";

describe("NEAR transactions", () => {
  it("round-trips base58, keeping leading zero bytes", () => {
    for (const bytes of [Buffer.from([0, 0, 1, 2, 255]), Buffer.alloc(32, 9), Buffer.from([])]) {
      expect(Buffer.from(base58Decode(base58Encode(bytes)))).toEqual(bytes);
    }
  });

  it("signs a Borsh transaction the chain can decode and verify", () => {
    const signer = nearSigner("escrow.boreal.testnet", newNearKey());
    const tx = signTransaction(signer, {
      receiverId: USDC,
      nonce: BigInt("101"),
      blockHash: base58Encode(Buffer.alloc(32, 7)),
      calls: [{ methodName: "ft_transfer", args: { receiver_id: "maria.testnet", amount: "1000", memo: "k" }, gas: BigInt("30000000000000"), deposit: BigInt("1") }],
    });
    const decoded = decodeSignedTransaction(tx.base64);
    expect(decoded).toMatchObject({ hash: tx.hash, signerId: "escrow.boreal.testnet", nonce: BigInt("101"), receiverId: USDC, signatureValid: true });
    expect(decoded.calls).toEqual([
      { methodName: "ft_transfer", args: { receiver_id: "maria.testnet", amount: "1000", memo: "k" }, gas: BigInt("30000000000000"), deposit: BigInt("1") },
    ]);
    expect(`ed25519:${base58Encode(decoded.publicKey)}`).toBe(signer.publicKey);
  });
});

describe("NEAR rail", () => {
  let chain: FakeNear;
  let journal: ReturnType<typeof memoryJournal>;
  let payments: NearPayments;
  let clock: Date;

  beforeEach(() => {
    clock = new Date("2026-11-02T00:00:00Z");
    chain = createFakeNear(USDC);
    journal = memoryJournal();
    payments = createNearPayments({
      chain,
      network: "testnet",
      token: USDC,
      decimals: 6,
      escrow: nearSigner("escrow.boreal.testnet", newNearKey()),
      journal,
      now: () => clock,
    });
    chain.registered.add("escrow.boreal.testnet");
    chain.registered.add("agent.testnet");
    chain.balances.set("agent.testnet", BigInt("100000000"));
  });

  it("asks for an ft_transfer of the task total in token units, memo tied to the task", async () => {
    const req = await payments.createPaymentRequest("task-1", 1_155);
    expect(req).toMatchObject({
      network: "near:testnet",
      asset: USDC,
      payTo: "escrow.boreal.testnet",
      amount: "11550000",
      extra: { rail: "near", resource: "task-1", minorUnits: 1_155, decimals: 6, memo: "boreal:task-1" },
    });
  });

  it("confirms a final transfer to escrow with the task's memo, and refuses anything else", async () => {
    const good = chain.externalTransfer("agent.testnet", "escrow.boreal.testnet", BigInt("11550000"), fundingMemo("task-1"));
    expect(await payments.confirmPayment("task-1", { txHash: good, signerId: "agent.testnet" })).toEqual({ txHash: good, amount: 1_155 });

    // The same transfer can't fund another task: its memo names task-1.
    await expect(payments.confirmPayment("task-2", { txHash: good, signerId: "agent.testnet" })).rejects.toThrow(/memo boreal:task-2/);
    const elsewhere = chain.externalTransfer("agent.testnet", "agent.testnet", BigInt("100"), fundingMemo("task-3"));
    await expect(payments.confirmPayment("task-3", { txHash: elsewhere, signerId: "agent.testnet" })).rejects.toThrow(/no ft_transfer to escrow/);
    const broke = chain.externalTransfer("agent.testnet", "escrow.boreal.testnet", BigInt("10") ** BigInt("12"), fundingMemo("task-4"));
    await expect(payments.confirmPayment("task-4", { txHash: broke, signerId: "agent.testnet" })).rejects.toThrow(/failed/);
    await expect(payments.confirmPayment("task-5", { txHash: "nope", signerId: "agent.testnet" })).rejects.toThrow(/isn't final/);
    await expect(payments.confirmPayment("task-5", { orderId: "x" })).rejects.toThrow(/txHash, signerId/);
  });

  it("pays out once per key, registering a new recipient in the same transaction", async () => {
    chain.balances.set("escrow.boreal.testnet", BigInt("20000000"));
    const first = await payments.sponsoredTransfer({ to: "maria.testnet", amount: 1_000, idempotencyKey: "t1:pay-worker" });
    expect(chain.balances.get("maria.testnet")).toBe(BigInt("10000000"));
    expect(chain.sent[0]!.calls.map((c) => c.methodName)).toEqual(["storage_deposit", "ft_transfer"]);
    expect(journal.entries.get("t1:pay-worker")?.txHash).toBe(first.txHash);

    // A retry with the same key asks the chain and sends nothing.
    expect(await payments.sponsoredTransfer({ to: "maria.testnet", amount: 1_000, idempotencyKey: "t1:pay-worker" })).toEqual(first);
    expect(chain.sent).toHaveLength(1);

    // A registered recipient gets the transfer alone.
    await payments.sponsoredTransfer({ to: "maria.testnet", amount: 500, idempotencyKey: "t2:pay-worker" });
    expect(chain.sent[1]!.calls.map((c) => c.methodName)).toEqual(["ft_transfer"]);
    expect(await payments.escrowBalance()).toBe(500);
  });

  it("never sends twice when the reply is lost after the chain took the transfer", async () => {
    chain.balances.set("escrow.boreal.testnet", BigInt("20000000"));
    chain.dropNextReply();
    await expect(payments.sponsoredTransfer({ to: "maria.testnet", amount: 1_000, idempotencyKey: "t1:pay-worker" })).rejects.toThrow(/hang up/);
    const again = await payments.sponsoredTransfer({ to: "maria.testnet", amount: 1_000, idempotencyKey: "t1:pay-worker" });
    expect(again.txHash).toBe(chain.sent[0]!.hash);
    expect(chain.sent).toHaveLength(1);
    expect(chain.balances.get("maria.testnet")).toBe(BigInt("10000000"));
  });

  it("waits out a journaled transfer the chain hasn't seen, then sends afresh once it can't land", async () => {
    chain.balances.set("escrow.boreal.testnet", BigInt("20000000"));
    journal.entries.set("t1:pay-worker", { txHash: "lost", expiry: clock.getTime() / 1000 + 60 });
    await expect(payments.sponsoredTransfer({ to: "maria.testnet", amount: 1_000, idempotencyKey: "t1:pay-worker" })).rejects.toThrow(/may still land/);
    clock = new Date(clock.getTime() + 120_000);
    await payments.sponsoredTransfer({ to: "maria.testnet", amount: 1_000, idempotencyKey: "t1:pay-worker" });
    expect(chain.balances.get("maria.testnet")).toBe(BigInt("10000000"));
  });

  it("refuses accounts that aren't NEAR account ids", async () => {
    await expect(payments.sponsoredTransfer({ to: "Maria@Example.com", amount: 1, idempotencyKey: "k" })).rejects.toThrow(/not a NEAR account/);
  });
});
