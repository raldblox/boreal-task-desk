// The EVM rail: tasks funded and paid in an ERC-20 dollar token (USDC) on an EVM chain.
//
// - Funding is x402 `exact` on EVM: the agent signs an EIP-3009 `transferWithAuthorization`
//   (an EIP-712 message, no gas, nothing sent by the agent) for the exact amount to escrow.
//   boreal.work is its own facilitator: inside the desk's funding checks it verifies the
//   signature, the amount, the recipient and the validity window, then submits it and waits
//   for it to be mined. So a task its checks refuse never takes money, unlike a rail where
//   the agent pays first.
// - The authorization's nonce is derived from the task id, so one authorization can fund only
//   its own task, and the token refuses to run it twice.
// - Payouts and refunds are `transfer` calls from escrow, journaled before they are sent. An
//   EVM transaction never expires, so "can it still land?" is answered by its account nonce:
//   a retry re-sends at the SAME nonce (at most one transaction per nonce can ever be mined),
//   and sends afresh only once that nonce was used by something else or the transfer reverted.

import type { ConfirmedPayment, EvmPaymentRequirement, Payments, SentTransfer, TransferJournal } from "@boreal/concordium";

export type { EvmPaymentRequirement };
import {
  decodeFunctionResult,
  encodeFunctionData,
  getAddress,
  isAddress,
  keccak256,
  parseAbi,
  parseSignature,
  recoverTypedDataAddress,
  stringToHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import type { EvmChain, Hex } from "./chain";

export class EvmPaymentError extends Error {}

export const TOKEN_ABI = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function transfer(address to, uint256 value) returns (bool)",
  "function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s)",
  "function authorizationState(address authorizer, bytes32 nonce) view returns (bool)",
]);

const AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

/** The EIP-3009 nonce for a task's funding: one authorization, one task. */
export const fundingNonce = (taskId: string): Hex => keccak256(stringToHex(`boreal:${taskId}`));

/** What an agent signs and sends back: the x402 EVM `exact` payload (`payload.authorization` + `payload.signature`). */
export interface EvmAuthorization {
  from: string;
  to: string;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: string;
}

export interface EvmPaymentsOptions {
  chain: EvmChain;
  chainId: number;
  /** The ERC-20 token contract (USDC), which must support EIP-3009. */
  token: string;
  /** The token's decimals; boreal.work's minor units are cents, so at least 2. */
  decimals: number;
  /** The token's EIP-712 domain name and version (USDC: "USD Coin" / "2"; check the contract). */
  tokenName: string;
  tokenVersion: string;
  /** Escrow's private key: receives funding, pays out, refunds, and pays the gas for all three. */
  escrowKey: Hex;
  journal: TransferJournal;
  now?: () => Date;
  requestTtlSeconds?: number;
  /** How long to wait for a sent transaction to be mined before leaving it to the next retry. */
  waitMs?: number;
  pollMs?: number;
}

export type EvmPayments = Payments<EvmPaymentRequirement> & {
  /** Token units per boreal.work minor unit (cent). */
  scale: bigint;
  escrowAddress: Hex;
};

/** A journaled transfer on this rail: every hash ever broadcast for it, all at one nonce. */
type Journaled = SentTransfer & { nonce: number };

function readAuthorization(payment: unknown): { authorization: EvmAuthorization; signature: Hex } {
  const p = payment as { payload?: { authorization?: unknown; signature?: unknown }; authorization?: unknown; signature?: unknown } | null;
  const a = (p?.payload?.authorization ?? p?.authorization) as Partial<EvmAuthorization> | undefined;
  const signature = p?.payload?.signature ?? p?.signature;
  const ok =
    a &&
    typeof signature === "string" &&
    /^0x[0-9a-fA-F]{130}$/.test(signature) &&
    typeof a.from === "string" &&
    isAddress(a.from) &&
    typeof a.to === "string" &&
    isAddress(a.to) &&
    [a.value, a.validAfter, a.validBefore].every((n) => typeof n === "string" && /^\d{1,78}$/.test(n)) &&
    typeof a.nonce === "string" &&
    /^0x[0-9a-fA-F]{64}$/.test(a.nonce);
  if (!ok) throw new EvmPaymentError("send the x402 payload: { payload: { authorization: { from, to, value, validAfter, validBefore, nonce }, signature } }");
  return { authorization: a as EvmAuthorization, signature: signature as Hex };
}

export function createEvmPayments(options: EvmPaymentsOptions): EvmPayments {
  const { chain, chainId, decimals, journal, now = () => new Date(), requestTtlSeconds = 30 * 60, waitMs = 45_000, pollMs = 2_000 } = options;
  if (!Number.isInteger(decimals) || decimals < 2) throw new EvmPaymentError("the token needs at least 2 decimals");
  if (!isAddress(options.token)) throw new EvmPaymentError("the token contract isn't an address");
  const token = getAddress(options.token);
  const scale = BigInt(10) ** BigInt(decimals - 2);
  const escrow = privateKeyToAccount(options.escrowKey);
  const domain = { name: options.tokenName, version: options.tokenVersion, chainId, verifyingContract: token } as const;

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  /** Waits for one of these hashes to be mined; null if none is within the wait. */
  async function mined(hashes: string[]): Promise<{ hash: string; status: "success" | "reverted" } | null> {
    const until = Date.now() + waitMs;
    for (;;) {
      for (const hash of hashes) {
        const receipt = await chain.receipt(hash as Hex);
        if (receipt) return { hash, status: receipt.status };
      }
      if (Date.now() >= until) return null;
      await sleep(pollMs);
    }
  }

  /** Signs a call to the token from escrow at this nonce. `bump` raises the fee, to replace a stuck one. */
  async function signCall(data: Hex, nonce: number, bump = false): Promise<Hex> {
    const [fees, gas] = await Promise.all([chain.fees(), chain.estimateGas({ from: escrow.address, to: token, data })]);
    const raise = (fee: bigint) => (bump ? (fee * BigInt(13)) / BigInt(10) + BigInt(1) : fee);
    return escrow.signTransaction({
      chainId,
      type: "eip1559",
      nonce,
      to: token,
      data,
      value: BigInt(0),
      // Headroom over the estimate: token transfers cost more when the recipient's balance is new.
      gas: (gas * BigInt(13)) / BigInt(10),
      maxFeePerGas: raise(fees.maxFeePerGas),
      maxPriorityFeePerGas: raise(fees.maxPriorityFeePerGas),
    });
  }

  return {
    scale,
    escrowAddress: escrow.address,

    async createPaymentRequest(taskId, amount) {
      if (!Number.isSafeInteger(amount) || amount <= 0) throw new EvmPaymentError("amount must be a positive integer in minor units");
      return {
        scheme: "exact",
        network: `eip155:${chainId}` as const,
        asset: token,
        payTo: escrow.address,
        amount: (BigInt(amount) * scale).toString(),
        maxTimeoutSeconds: requestTtlSeconds,
        extra: {
          rail: "evm",
          resource: taskId,
          minorUnits: amount,
          decimals,
          name: options.tokenName,
          version: options.tokenVersion,
          nonce: fundingNonce(taskId),
          expiresAt: new Date(now().getTime() + requestTtlSeconds * 1000).toISOString(),
        },
      };
    },

    /**
     * Verifies the agent's signed authorization and runs it. Called inside the desk's funding
     * checks, so nothing is submitted for a task they refuse. Moves nothing if any check fails.
     */
    async confirmPayment(taskId, payment): Promise<ConfirmedPayment> {
      const { authorization: a, signature } = readAuthorization(payment);
      const from = getAddress(a.from);
      if (getAddress(a.to) !== escrow.address) throw new EvmPaymentError(`the authorization must pay ${escrow.address}`);
      if (a.nonce.toLowerCase() !== fundingNonce(taskId)) throw new EvmPaymentError("the authorization is for another task: use the nonce in the payment requirement");
      const value = BigInt(a.value);
      if (value <= BigInt(0) || value % scale !== BigInt(0)) throw new EvmPaymentError("the amount isn't a whole number of cents");
      const seconds = BigInt(Math.floor(now().getTime() / 1000));
      if (BigInt(a.validAfter) > seconds) throw new EvmPaymentError("the authorization isn't valid yet");
      // It has to stay valid while it is mined.
      if (BigInt(a.validBefore) < seconds + BigInt(120)) throw new EvmPaymentError("the authorization has expired or is about to; sign a new one");

      const message = { from, to: escrow.address, value, validAfter: BigInt(a.validAfter), validBefore: BigInt(a.validBefore), nonce: a.nonce as Hex };
      let signer: string;
      try {
        signer = await recoverTypedDataAddress({ domain, types: AUTHORIZATION_TYPES, primaryType: "TransferWithAuthorization", message, signature });
      } catch {
        throw new EvmPaymentError("the authorization's signature isn't valid");
      }
      // Wallets that sign as a contract (ERC-1271) aren't supported: the payer must be the signing key's own account.
      if (getAddress(signer) !== from) throw new EvmPaymentError("the authorization wasn't signed by the account it pays from");

      const state = await chain.call(token, encodeFunctionData({ abi: TOKEN_ABI, functionName: "authorizationState", args: [from, a.nonce as Hex] }));
      if (decodeFunctionResult({ abi: TOKEN_ABI, functionName: "authorizationState", data: state })) {
        throw new EvmPaymentError("this authorization was already used");
      }
      const balance = await chain.call(token, encodeFunctionData({ abi: TOKEN_ABI, functionName: "balanceOf", args: [from] }));
      if (decodeFunctionResult({ abi: TOKEN_ABI, functionName: "balanceOf", data: balance }) < value) {
        throw new EvmPaymentError("the paying account doesn't hold enough of the token");
      }

      const { r, s, yParity } = parseSignature(signature);
      const data = encodeFunctionData({
        abi: TOKEN_ABI,
        functionName: "transferWithAuthorization",
        args: [from, escrow.address, value, message.validAfter, message.validBefore, a.nonce as Hex, 27 + (yParity ?? 0), r, s],
      });
      const hash = await chain.send(await signCall(data, await chain.nonce(escrow.address, "pending")));
      const result = await mined([hash]);
      if (!result) {
        // Submitted but not mined in time: it may still land, so this needs an operator, loudly.
        console.error(`[evm] funding for task ${taskId} was submitted as ${hash} and isn't mined yet`);
        throw new EvmPaymentError("the payment was submitted but isn't confirmed yet; try again in a minute");
      }
      if (result.status !== "success") throw new EvmPaymentError("the token refused the transfer");
      return { txHash: hash, amount: Number(value / scale), payer: from };
    },

    /** One transfer out of escrow per idempotency key, whatever is retried. */
    async sponsoredTransfer(transfer) {
      if (!Number.isSafeInteger(transfer.amount) || transfer.amount <= 0) throw new EvmPaymentError("amount must be a positive integer in minor units");
      if (!isAddress(transfer.to)) throw new EvmPaymentError(`${transfer.to} is not an EVM address`);
      const data = encodeFunctionData({ abi: TOKEN_ABI, functionName: "transfer", args: [getAddress(transfer.to), BigInt(transfer.amount) * scale] });
      const key = transfer.idempotencyKey;
      const prior = (await journal.find(key)) as Journaled | null;

      let nonce: number;
      let hashes: string[] = [];
      let bump = false;
      if (prior) {
        hashes = [prior.txHash, ...(prior.also ?? [])];
        // The nonce first, the receipts after: if one of ours is mined in between, its receipt
        // is seen. The other order could read "nonce used, no receipt" and pay twice.
        const used = (await chain.nonce(escrow.address, "latest")) > prior.nonce;
        const receipts = await Promise.all(hashes.map((h) => chain.receipt(h as Hex)));
        const done = hashes.find((_, i) => receipts[i]?.status === "success");
        if (done) return { txHash: done };
        const reverted = receipts.some((r) => r?.status === "reverted");
        if (used || reverted) {
          // Its nonce is spent and none of its transactions succeeded: it can never move money now.
          nonce = await chain.nonce(escrow.address, "pending");
          hashes = [];
        } else {
          // Still possible: replace it at the same nonce, so at most one of them is ever mined.
          nonce = prior.nonce;
          bump = true;
        }
      } else {
        nonce = await chain.nonce(escrow.address, "pending");
      }

      const raw = await signCall(data, nonce, bump);
      const hash = keccak256(raw);
      // Journaled before it is sent: a crash from here on finds this hash and nonce again.
      await journal.save(key, { txHash: hash, expiry: Math.floor(now().getTime() / 1000) + Math.ceil(waitMs / 1000), nonce, ...(hashes.length ? { also: hashes } : {}) } as Journaled);
      try {
        await chain.send(raw);
      } catch (error) {
        // A replacement the node won't take (fee too low) leaves the earlier one in place: wait for that.
        if (!bump) throw error;
      }
      const result = await mined([hash, ...hashes]);
      if (!result) throw new EvmPaymentError(`transfer ${hash} isn't mined yet; checking again on the next pass`);
      if (result.status !== "success") throw new EvmPaymentError(`transfer ${result.hash} reverted`);
      return { txHash: result.hash };
    },

    /** Whole minor units; sub-cent dust is ignored. */
    async escrowBalance() {
      const data = await chain.call(token, encodeFunctionData({ abi: TOKEN_ABI, functionName: "balanceOf", args: [escrow.address] }));
      return Number(decodeFunctionResult({ abi: TOKEN_ABI, functionName: "balanceOf", data }) / scale);
    },
  };
}
