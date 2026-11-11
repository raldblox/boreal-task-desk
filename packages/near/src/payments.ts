// The NEAR rail: agents fund a task with an NEP-141 token transfer (USDC) to boreal's escrow
// account, memo `boreal:<taskId>`; payouts and refunds are token transfers out of escrow.
//
// - Funding is checked on the chain: the transfer must be final, to escrow, for the exact
//   amount, with this task's memo, so one transfer can never fund two tasks.
// - Payouts are journaled before they are sent, like the Concordium rail: a retry asks the
//   chain about the journaled transaction and sends again only once it can never execute.
// - A recipient not yet registered with the token gets its storage deposit in the same
//   transaction, so the transfer can't fail on registration alone.

import type { ConfirmedPayment, NearPaymentRequirement, Payments, SentTransfer, TransferJournal } from "@boreal/concordium";

import type { NearChain, TxOutcome } from "./chain";
import { type FunctionCall, type NearSigner, signTransaction } from "./tx";

export class NearPaymentError extends Error {}

const TGAS = BigInt("1000000000000");
/** What NEP-145 token contracts ask to register an account (0.00125 NEAR). */
const STORAGE_DEPOSIT = BigInt("1250000000000000000000");
/**
 * NEAR drops a transaction whose block hash is older than 86,400 blocks (about a day at one
 * block a second). Two days is safely past that whatever the block time.
 */
const TX_LIFETIME_S = 2 * 24 * 60 * 60;

const ACCOUNT_ID = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;

export function isNearAccountId(value: string): boolean {
  return value.length >= 2 && value.length <= 64 && ACCOUNT_ID.test(value);
}

export const fundingMemo = (taskId: string) => `boreal:${taskId}`;

/** Sends one token's transfers from one account, journaled by key. */
export interface TokenSender {
  accountId: string;
  /** Idempotent by `key`: a repeated key never sends twice. Returns the final transaction hash. */
  transfer(to: string, units: bigint, key: string, memo?: string): Promise<string>;
  balance(): Promise<bigint>;
}

export function createTokenSender(options: {
  chain: NearChain;
  signer: NearSigner;
  token: string;
  journal: TransferJournal;
  now?: () => Date;
}): TokenSender {
  const { chain, signer, token, journal, now = () => new Date() } = options;

  async function registered(accountId: string): Promise<boolean> {
    const balance = await chain.view(token, "storage_balance_of", { account_id: accountId });
    return balance !== null;
  }

  return {
    accountId: signer.accountId,
    async transfer(to, units, key, memo = key) {
      if (!isNearAccountId(to)) throw new NearPaymentError(`${to} is not a NEAR account id`);
      if (units <= BigInt("0")) throw new NearPaymentError("amount must be positive");
      const prior = await journal.find(key);
      if (prior) {
        const outcome = await chain.status(prior.txHash, signer.accountId);
        if (outcome?.status === "success") return prior.txHash;
        if (!outcome && prior.expiry * 1000 > now().getTime()) {
          throw new NearPaymentError(`transfer ${prior.txHash} may still land; retrying after it expires`);
        }
        // Failed, or never seen and now expired: it can never move money, so send afresh.
      }
      const calls: FunctionCall[] = [];
      if (!(await registered(to))) {
        calls.push({
          methodName: "storage_deposit",
          args: { account_id: to, registration_only: true },
          gas: BigInt("30") * TGAS,
          deposit: STORAGE_DEPOSIT,
        });
      }
      calls.push({ methodName: "ft_transfer", args: { receiver_id: to, amount: units.toString(), memo }, gas: BigInt("30") * TGAS, deposit: BigInt("1") });
      const { nonce, blockHash } = await chain.accessKey(signer.accountId, signer.publicKey);
      const tx = signTransaction(signer, { receiverId: token, nonce: nonce + BigInt("1"), blockHash, calls });
      await journal.save(key, { txHash: tx.hash, expiry: Math.floor(now().getTime() / 1000) + TX_LIFETIME_S } satisfies SentTransfer);
      const outcome = await chain.send(tx.base64);
      if (outcome.status !== "success") throw new NearPaymentError(`transfer ${tx.hash} failed: ${outcome.error ?? "unknown"}`);
      return tx.hash;
    },
    async balance() {
      return BigInt((await chain.view(token, "ft_balance_of", { account_id: signer.accountId })) as string);
    },
  };
}

export interface NearPaymentsOptions {
  chain: NearChain;
  network: "testnet" | "mainnet";
  /** The NEP-141 token contract (USDC). */
  token: string;
  /** The token's decimals; boreal's minor units are cents, so at least 2. */
  decimals: number;
  /** Escrow: receives funding, sends payouts and refunds. */
  escrow: NearSigner;
  journal: TransferJournal;
  now?: () => Date;
  /** How long a payment request stays open. */
  requestTtlSeconds?: number;
}

/** What an agent hands back after paying: the transaction hash and the account that signed it. */
export interface NearFundingProof {
  txHash: string;
  signerId: string;
}

export type NearPayments = Payments<NearPaymentRequirement> & {
  /** Token units per boreal minor unit (cent). */
  scale: bigint;
};

function readProof(payment: unknown): NearFundingProof {
  const p = payment as Partial<NearFundingProof> | null;
  if (!p || typeof p.txHash !== "string" || typeof p.signerId !== "string" || !isNearAccountId(p.signerId)) {
    throw new NearPaymentError("send { txHash, signerId } for the token transfer to escrow");
  }
  return { txHash: p.txHash, signerId: p.signerId };
}

/** Checks a final transaction is the funding transfer this requirement asks for; returns its token units. */
export function fundingUnits(outcome: TxOutcome, token: string, escrow: string, memo: string): bigint {
  if (outcome.status !== "success") throw new NearPaymentError(`the transfer failed: ${outcome.error ?? "unknown"}`);
  if (outcome.receiverId !== token) throw new NearPaymentError("the transaction isn't a transfer of the requested token");
  const transfer = outcome.calls.find((c) => {
    const args = c.args as { receiver_id?: unknown; memo?: unknown } | null;
    return c.methodName === "ft_transfer" && args?.receiver_id === escrow && args.memo === memo;
  });
  if (!transfer) throw new NearPaymentError(`no ft_transfer to ${escrow} with memo ${memo} in that transaction`);
  const amount = (transfer.args as { amount?: unknown }).amount;
  if (typeof amount !== "string" || !/^\d+$/.test(amount)) throw new NearPaymentError("the transfer has no amount");
  return BigInt(amount);
}

export function createNearPayments(options: NearPaymentsOptions): NearPayments {
  const { chain, network, token, decimals, escrow, journal, now = () => new Date(), requestTtlSeconds = 30 * 60 } = options;
  if (!Number.isInteger(decimals) || decimals < 2) throw new NearPaymentError("the token needs at least 2 decimals");
  const scale = BigInt("10") ** BigInt(decimals - 2);
  const sender = createTokenSender({ chain, signer: escrow, token, journal, now });

  return {
    scale,
    async createPaymentRequest(taskId, amount) {
      const memo = fundingMemo(taskId);
      return {
        scheme: "exact",
        network: `near:${network}`,
        asset: token,
        payTo: escrow.accountId,
        amount: (BigInt(amount) * scale).toString(),
        maxTimeoutSeconds: requestTtlSeconds,
        extra: {
          rail: "near",
          resource: taskId,
          minorUnits: amount,
          decimals,
          memo,
          nonce: memo,
          expiresAt: new Date(now().getTime() + requestTtlSeconds * 1000).toISOString(),
        },
      };
    },

    async confirmPayment(taskId, payment): Promise<ConfirmedPayment> {
      const proof = readProof(payment);
      const outcome = await chain.status(proof.txHash, proof.signerId);
      if (!outcome) throw new NearPaymentError("that transaction isn't final on NEAR yet; try again in a few seconds");
      const units = fundingUnits(outcome, token, escrow.accountId, fundingMemo(taskId));
      if (units % scale !== BigInt("0")) throw new NearPaymentError("the amount isn't a whole number of cents");
      // The chain's own record of who signed it, not what the caller says: refunds go back there.
      return { txHash: proof.txHash, amount: Number(units / scale), payer: outcome.signerId };
    },

    async sponsoredTransfer(transfer) {
      if (!Number.isSafeInteger(transfer.amount) || transfer.amount <= 0) {
        throw new NearPaymentError("amount must be a positive integer in minor units");
      }
      const txHash = await sender.transfer(transfer.to, BigInt(transfer.amount) * scale, transfer.idempotencyKey);
      return { txHash };
    },

    /** Whole minor units; sub-cent dust is ignored. */
    async escrowBalance() {
      return Number((await sender.balance()) / scale);
    },
  };
}
