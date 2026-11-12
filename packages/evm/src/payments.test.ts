import type { SentTransfer, TransferJournal } from "@boreal/concordium";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { beforeEach, describe, expect, it } from "vitest";

import { createFakeEvm } from "./fake-evm";
import { evmChainId, evmConnectMessage, loadEvm, verifyEvmConnect } from "./index";
import { createEvmPayments, type EvmPaymentRequirement, type EvmPayments, fundingNonce } from "./payments";

const CHAIN_ID = 84532;
const TOKEN = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;
const DOMAIN = { name: "USDC", version: "2" };
const USDC = (dollars: number) => BigInt(Math.round(dollars * 1_000_000));

let clock: Date;
let chain: ReturnType<typeof createFakeEvm>;
let payments: EvmPayments;
let journaled: Map<string, SentTransfer>;
const agent = privateKeyToAccount(generatePrivateKey());
const worker = privateKeyToAccount(generatePrivateKey());
const escrowKey = generatePrivateKey();

const journal: TransferJournal = {
  find: async (key) => journaled.get(key) ?? null,
  save: async (key, sent) => void journaled.set(key, sent),
};

/** The x402 payload an agent sends back: the requirement's authorization, signed. */
async function signed(requirement: EvmPaymentRequirement, overrides: Partial<{ value: bigint; to: string; nonce: string; validBefore: bigint }> = {}, signer = agent) {
  const seconds = BigInt(Math.floor(clock.getTime() / 1000));
  const message = {
    from: signer.address,
    to: (overrides.to ?? requirement.payTo) as `0x${string}`,
    value: overrides.value ?? BigInt(requirement.amount),
    validAfter: BigInt(0),
    validBefore: overrides.validBefore ?? seconds + BigInt(requirement.maxTimeoutSeconds),
    nonce: (overrides.nonce ?? requirement.extra.nonce) as `0x${string}`,
  };
  const signature = await signer.signTypedData({
    domain: { ...DOMAIN, chainId: CHAIN_ID, verifyingContract: TOKEN },
    types: {
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    },
    primaryType: "TransferWithAuthorization",
    message,
  });
  return {
    x402Version: 2,
    payload: {
      signature,
      authorization: { from: message.from, to: message.to, value: message.value.toString(), validAfter: "0", validBefore: message.validBefore.toString(), nonce: message.nonce },
    },
  };
}

beforeEach(() => {
  clock = new Date("2026-11-12T00:00:00Z");
  journaled = new Map();
  chain = createFakeEvm({ chainId: CHAIN_ID, token: TOKEN, tokenName: DOMAIN.name, tokenVersion: DOMAIN.version, now: () => clock });
  payments = createEvmPayments({ chain, chainId: CHAIN_ID, token: TOKEN, decimals: 6, tokenName: DOMAIN.name, tokenVersion: DOMAIN.version, escrowKey, journal, now: () => clock, waitMs: 20, pollMs: 5 });
  chain.mint(agent.address, USDC(100));
});

describe("funding over x402", () => {
  it("asks for the exact amount to escrow, with a nonce only this task can use", async () => {
    const r = await payments.createPaymentRequest("task-1", 1_155);
    expect(r).toMatchObject({ scheme: "exact", network: "eip155:84532", asset: TOKEN, payTo: payments.escrowAddress, amount: "11550000" });
    expect(r.extra).toMatchObject({ rail: "evm", minorUnits: 1_155, name: "USDC", version: "2", nonce: fundingNonce("task-1") });
    expect(fundingNonce("task-2")).not.toBe(fundingNonce("task-1"));
  });

  it("runs a signed authorization and reports the payer, in cents", async () => {
    const r = await payments.createPaymentRequest("task-1", 1_155);
    const confirmed = await payments.confirmPayment("task-1", await signed(r));
    expect(confirmed).toMatchObject({ amount: 1_155, payer: agent.address });
    expect(chain.balanceOf(payments.escrowAddress)).toBe(USDC(11.55));
    expect(chain.balanceOf(agent.address)).toBe(USDC(100) - USDC(11.55));
    expect(await payments.escrowBalance()).toBe(1_155);
  });

  it("moves nothing for another task, another recipient, a stale or a forged authorization", async () => {
    const r = await payments.createPaymentRequest("task-1", 1_155);
    const stranger = privateKeyToAccount(generatePrivateKey());
    await expect(payments.confirmPayment("task-2", await signed(r))).rejects.toThrow(/another task/);
    await expect(payments.confirmPayment("task-1", await signed(r, { to: stranger.address }))).rejects.toThrow(/must pay/);
    await expect(payments.confirmPayment("task-1", await signed(r, { validBefore: BigInt(Math.floor(clock.getTime() / 1000)) + BigInt(30) }))).rejects.toThrow(/expired/);
    await expect(payments.confirmPayment("task-1", await signed(r, { value: BigInt(11_550_001) }))).rejects.toThrow(/whole number of cents/);
    // Signed by someone else for the agent's account.
    const forged = await signed(r, {}, stranger);
    forged.payload.authorization.from = agent.address;
    await expect(payments.confirmPayment("task-1", forged)).rejects.toThrow(/wasn't signed by the account/);
    await expect(payments.confirmPayment("task-1", { orderId: "x" })).rejects.toThrow(/x402 payload/);
    // More than the payer holds.
    const big = await payments.createPaymentRequest("task-3", 50_000);
    await expect(payments.confirmPayment("task-3", await signed(big))).rejects.toThrow(/doesn't hold enough/);
    expect(chain.sent).toEqual([]);
    expect(chain.balanceOf(payments.escrowAddress)).toBe(BigInt(0));
  });

  it("never runs one authorization twice", async () => {
    const r = await payments.createPaymentRequest("task-1", 1_155);
    const payload = await signed(r);
    await payments.confirmPayment("task-1", payload);
    await expect(payments.confirmPayment("task-1", payload)).rejects.toThrow(/already used/);
    expect(chain.balanceOf(payments.escrowAddress)).toBe(USDC(11.55));
  });
});

describe("payouts out of escrow", () => {
  const pay = (key = "task-1:pay-worker", amount = 1_000) => payments.sponsoredTransfer({ to: worker.address, amount, idempotencyKey: key });

  beforeEach(() => chain.mint(payments.escrowAddress, USDC(50)));

  it("pays once per key, however often it is retried", async () => {
    const first = await pay();
    expect(await pay()).toEqual(first);
    expect(chain.balanceOf(worker.address)).toBe(USDC(10));
    expect(chain.sent).toHaveLength(1);
    await pay("task-2:pay-worker", 500);
    expect(chain.balanceOf(worker.address)).toBe(USDC(15));
  });

  it("journals before sending, so a lost reply doesn't send twice", async () => {
    chain.autoMine = false;
    await expect(pay()).rejects.toThrow(/isn't mined yet/);
    expect(journaled.get("task-1:pay-worker")).toMatchObject({ nonce: 0 });
    // The first one lands after all; the retry finds it instead of paying again.
    await chain.mine();
    const settled = await pay();
    expect(settled.txHash).toBe(chain.sent[0]);
    expect(chain.balanceOf(worker.address)).toBe(USDC(10));
  });

  it("replaces a stuck transfer at the same nonce, so at most one can ever land", async () => {
    chain.autoMine = false;
    await expect(pay()).rejects.toThrow(/isn't mined yet/);
    await expect(pay()).rejects.toThrow(/isn't mined yet/);
    // Two transactions were broadcast for this payout, and only one of them is in the pool.
    expect(chain.sent).toHaveLength(2);
    expect(chain.pending()).toEqual([chain.sent[1]]);
    expect(journaled.get("task-1:pay-worker")).toMatchObject({ nonce: 0, txHash: chain.sent[1], also: [chain.sent[0]] });
    await chain.mine();
    expect((await pay()).txHash).toBe(chain.sent[1]);
    expect(chain.balanceOf(worker.address)).toBe(USDC(10));
  });

  it("sends afresh only once the first can never land: its nonce went to something else", async () => {
    chain.autoMine = false;
    await expect(pay()).rejects.toThrow(/isn't mined yet/);
    chain.drop(chain.sent[0]!);
    chain.burnNonce(payments.escrowAddress);
    chain.autoMine = true;
    const settled = await pay();
    expect(settled.txHash).toBe(chain.sent[1]);
    expect(journaled.get("task-1:pay-worker")).toMatchObject({ nonce: 1 });
    expect(chain.balanceOf(worker.address)).toBe(USDC(10));
  });

  it("refuses an address that isn't one, and amounts that aren't whole cents", async () => {
    await expect(payments.sponsoredTransfer({ to: "worker.near", amount: 100, idempotencyKey: "k" })).rejects.toThrow(/not an EVM address/);
    await expect(payments.sponsoredTransfer({ to: worker.address, amount: 1.5, idempotencyKey: "k" })).rejects.toThrow(/positive integer/);
    expect(chain.sent).toEqual([]);
  });
});

describe("configuration", () => {
  const base = { PAYMENT_RAILS: "paypal,evm", EVM_RPC_URL: "http://rpc.test", EVM_TOKEN_CONTRACT: TOKEN, EVM_TOKEN_NAME: "USDC", EVM_TOKEN_VERSION: "2", EVM_ESCROW_KEY: escrowKey };

  it("matches the chain to the network, in both directions", () => {
    expect(evmChainId({ BOREAL_NETWORK: "testnet", EVM_CHAIN_ID: "84532" })).toBe(84532);
    expect(evmChainId({ BOREAL_NETWORK: "mainnet", EVM_CHAIN_ID: "8453" })).toBe(8453);
    expect(() => evmChainId({ BOREAL_NETWORK: "mainnet", EVM_CHAIN_ID: "84532" })).toThrow(/refused on mainnet/);
    expect(() => evmChainId({ BOREAL_NETWORK: "testnet", EVM_CHAIN_ID: "8453" })).toThrow(/refused on testnet/);
  });

  it("is off unless listed, and names what is missing rather than guessing a token", () => {
    expect(loadEvm({ ...base, PAYMENT_RAILS: "paypal" }, { journal })).toBeNull();
    expect(loadEvm({ ...base, BOREAL_NETWORK: "testnet", EVM_CHAIN_ID: "84532" }, { journal, chain })?.escrowAddress).toBe(privateKeyToAccount(escrowKey).address);
    expect(() => loadEvm({ ...base, BOREAL_NETWORK: "testnet", EVM_CHAIN_ID: "84532", EVM_TOKEN_CONTRACT: undefined }, { journal, chain })).toThrow(/EVM_TOKEN_CONTRACT is not set/);
    expect(() => loadEvm({ ...base, BOREAL_NETWORK: "testnet", EVM_CHAIN_ID: "84532", EVM_ESCROW_KEY: "abc" }, { journal, chain })).toThrow(/private key/);
  });
});

describe("connecting a wallet for payouts", () => {
  it("accepts a fresh signature from the address itself, and nothing else", async () => {
    const issuedAt = clock.toISOString();
    const signature = await worker.signMessage({ message: evmConnectMessage("boreal.work", issuedAt) });
    const options = { site: "boreal.work", now: clock };
    expect(await verifyEvmConnect({ address: worker.address.toLowerCase(), issuedAt, signature }, options)).toBe(worker.address);
    await expect(verifyEvmConnect({ address: agent.address, issuedAt, signature }, options)).rejects.toThrow(/doesn't match/);
    await expect(verifyEvmConnect({ address: worker.address, issuedAt, signature }, { ...options, site: "evil.example" })).rejects.toThrow(/doesn't match/);
    await expect(verifyEvmConnect({ address: worker.address, issuedAt, signature }, { ...options, now: new Date(clock.getTime() + 3_600_000) })).rejects.toThrow(/too old/);
  });
});
