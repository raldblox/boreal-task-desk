import { decodeFunctionData, encodeFunctionResult, getAddress, keccak256, parseTransaction, recoverTransactionAddress, recoverTypedDataAddress, serializeSignature } from "viem";

import type { EvmChain, EvmReceipt, Hex } from "./chain";
import { TOKEN_ABI } from "./payments";

// An in-memory EVM chain with one EIP-3009 token on it, for tests. It checks what a real chain
// checks: transaction signatures and nonces, token balances, authorization signatures, validity
// windows and used nonces. Mining is manual when `autoMine` is off, to test what the rail does
// while a transaction is still pending, dropped or replaced.

export interface FakeEvmOptions {
  chainId: number;
  token: Hex;
  tokenName: string;
  tokenVersion: string;
  now: () => Date;
}

export function createFakeEvm(options: FakeEvmOptions) {
  const balances = new Map<string, bigint>();
  const usedAuthorizations = new Set<string>();
  const nonces = new Map<string, number>();
  const receipts = new Map<string, EvmReceipt>();
  /** Broadcast and not yet mined, by sender and nonce: a later one at the same nonce replaces it. */
  const pool = new Map<string, { raw: Hex; hash: Hex; from: Hex; nonce: number }>();
  const sent: Hex[] = [];
  let block = BigInt(100);
  const slot = (from: string, nonce: number) => `${from}:${nonce}`;
  const balanceOf = (address: string) => balances.get(getAddress(address)) ?? BigInt(0);
  const move = (from: string, to: string, value: bigint) => {
    if (balanceOf(from) < value) return false;
    balances.set(getAddress(from), balanceOf(from) - value);
    balances.set(getAddress(to), balanceOf(to) + value);
    return true;
  };

  /** Runs a token call as the chain would; false means it reverts. */
  async function execute(from: Hex, data: Hex): Promise<boolean> {
    const call = decodeFunctionData({ abi: TOKEN_ABI, data });
    if (call.functionName === "transfer") {
      const [to, value] = call.args;
      return move(from, to, value);
    }
    if (call.functionName === "transferWithAuthorization") {
      const [payer, to, value, validAfter, validBefore, nonce, v, r, s] = call.args;
      const seconds = BigInt(Math.floor(options.now().getTime() / 1000));
      if (seconds <= validAfter || seconds >= validBefore) return false;
      const id = `${getAddress(payer)}:${nonce}`;
      if (usedAuthorizations.has(id)) return false;
      const signer = await recoverTypedDataAddress({
        domain: { name: options.tokenName, version: options.tokenVersion, chainId: options.chainId, verifyingContract: options.token },
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
        message: { from: payer, to, value, validAfter, validBefore, nonce },
        signature: serializeSignature({ r, s, yParity: v - 27 }),
      });
      if (getAddress(signer) !== getAddress(payer)) return false;
      if (!move(payer, to, value)) return false;
      usedAuthorizations.add(id);
      return true;
    }
    return false;
  }

  const fake = {
    sent,
    /** Mine every transaction as it arrives. Turn off to hold them in the pool. */
    autoMine: true,
    balanceOf: (address: string) => balanceOf(address),
    mint(address: string, value: bigint) {
      balances.set(getAddress(address), balanceOf(address) + value);
    },
    pending: () => [...pool.values()].map((p) => p.hash),
    /** Mines what is in the pool, in nonce order per sender. */
    async mine() {
      for (const tx of [...pool.values()].sort((a, b) => a.nonce - b.nonce)) {
        if ((nonces.get(tx.from) ?? 0) !== tx.nonce) continue;
        const parsed = parseTransaction(tx.raw);
        const ok = getAddress(parsed.to!) === getAddress(options.token) ? await execute(tx.from, parsed.data!) : false;
        nonces.set(tx.from, tx.nonce + 1);
        receipts.set(tx.hash, { status: ok ? "success" : "reverted", blockNumber: ++block });
        pool.delete(slot(tx.from, tx.nonce));
      }
    },
    /** The node forgets a pending transaction, as mempools do. */
    drop(hash: string) {
      for (const [key, tx] of pool) if (tx.hash === hash) pool.delete(key);
    },
    /** Uses up the sender's next nonce with some other transaction. */
    burnNonce(address: string) {
      const from = getAddress(address);
      nonces.set(from, (nonces.get(from) ?? 0) + 1);
    },

    async call(to: Hex, data: Hex): Promise<Hex> {
      if (getAddress(to) !== getAddress(options.token)) return "0x";
      const call = decodeFunctionData({ abi: TOKEN_ABI, data });
      if (call.functionName === "balanceOf") return encodeFunctionResult({ abi: TOKEN_ABI, functionName: "balanceOf", result: balanceOf(call.args[0]) });
      if (call.functionName === "authorizationState") {
        return encodeFunctionResult({ abi: TOKEN_ABI, functionName: "authorizationState", result: usedAuthorizations.has(`${getAddress(call.args[0])}:${call.args[1]}`) });
      }
      return "0x";
    },
    async nonce(address: Hex, at: "latest" | "pending") {
      const from = getAddress(address);
      const mined = nonces.get(from) ?? 0;
      if (at === "latest") return mined;
      let next = mined;
      while (pool.has(slot(from, next))) next++;
      return next;
    },
    async fees() {
      return { maxFeePerGas: BigInt(2_000_000_000), maxPriorityFeePerGas: BigInt(1_000_000) };
    },
    async estimateGas() {
      return BigInt(60_000);
    },
    async send(raw: Hex): Promise<Hex> {
      const parsed = parseTransaction(raw);
      if (parsed.chainId !== options.chainId) throw new Error("wrong chain");
      const from = getAddress(await recoverTransactionAddress({ serializedTransaction: raw as never }));
      const nonce = parsed.nonce ?? 0;
      if (nonce < (nonces.get(from) ?? 0)) throw new Error("nonce too low");
      const waiting = pool.get(slot(from, nonce));
      if (waiting) {
        const before = parseTransaction(waiting.raw);
        if ((parsed.maxFeePerGas ?? BigInt(0)) <= (before.maxFeePerGas ?? BigInt(0))) throw new Error("replacement transaction underpriced");
      }
      const hash = keccak256(raw);
      pool.set(slot(from, nonce), { raw, hash, from, nonce });
      sent.push(hash);
      if (fake.autoMine) await fake.mine();
      return hash;
    },
    async receipt(hash: Hex) {
      return receipts.get(hash) ?? null;
    },
  };
  return fake satisfies EvmChain & Record<string, unknown>;
}
