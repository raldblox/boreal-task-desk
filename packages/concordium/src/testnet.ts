import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import {
  AccountAddress,
  type AccountSigner,
  buildBasicAccountSigner,
  Cbor,
  CborAccountAddress,
  CborMemo,
  type ConcordiumGRPCClient,
  DataBlob,
  TokenAmount,
  TokenId,
  TransactionExpiry,
  TransactionHash,
} from "@concordium/web-sdk";
import { ConcordiumGRPCNodeClient, credentials } from "@concordium/web-sdk/nodejs";
import { Transaction } from "@concordium/web-sdk/transactions";
import { CONCORDIUM_TESTNET_CAIP2, toConcordiumFacilitatorSigner, USDR_TOKEN_ID } from "@x402/concordium";
import { ExactConcordiumScheme } from "@x402/concordium/exact/facilitator";
import type { PaymentPayload, PaymentRequirements, SettleResponse } from "@x402/core/types";

import { checkRegistryBadge, BadgeError } from "./registry";
import type { Concordium, X402PaymentRequirement, SentTransfer, TransferJournal } from "./index";

// boreal's real money path on Concordium testnet:
// - Funding is x402 `exact` as Concordium's mechanism (`@x402/concordium`) defines it: the agent
//   signs a sponsored PLT transfer to the escrow account, and boreal acts as its own facilitator,
//   adding the sponsor's signature and paying the fee. Agents need no CCD.
// - Payouts and refunds are sponsored PLT transfers out of escrow, journaled before they are sent,
//   so a retry can tell whether the first attempt can still land and never sends twice.
// - Anchors register the event hash as data from the anchor account.
// The escrow account holds only open tasks' money and never pays fees; the sponsor pays them.

export interface TestnetConfig {
  /** CAIP-2 network id the requirements name. */
  network: string;
  grpcHost: string;
  grpcPort: number;
  /** The dedicated escrow account: every open task's money, nothing else. Empty runs anchor-only. */
  escrowAccount: string;
  escrowKey: string;
  /** Pays the CCD fees for funding, payouts and refunds (the x402 fee payer). */
  sponsorAccount: string;
  sponsorKey: string;
  /** Pays for anchors. */
  anchorAccount: string;
  anchorKey: string;
  /** The task currency: a protocol-level token id, such as USDR. */
  tokenId: string;
  /** Seals payment requirements, so a payer can't change the amount or task. */
  paymentSecret: string;
}

export class TestnetConcordiumError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TestnetConcordiumError";
  }
}

/** A transaction built and signed, with its hash known before it is sent. */
export interface PreparedTransaction {
  txHash: string;
  /** Epoch seconds after which the chain will never execute it. */
  expiry: number;
  send(): Promise<void>;
}

export type TransactionOutcome = { status: "success" } | { status: "rejected"; reason: string };

/** The chain operations the adapter needs; `grpcChain` is the real one, tests use a fake. */
export interface Chain {
  tokenDecimals(): Promise<number>;
  /** The account's balance of the task token, in its smallest units. */
  tokenBalance(account: string): Promise<bigint>;
  /** A sponsored token transfer out of escrow. */
  prepareTransfer(input: { to: string; amount: bigint; memo: string }): Promise<PreparedTransaction>;
  prepareAnchor(data: Uint8Array): Promise<PreparedTransaction>;
  /** Where a transaction stands: unknown to the node, waiting, or finalized with an outcome. */
  status(txHash: string): Promise<{ status: "unknown" | "pending" } | TransactionOutcome>;
  /** Waits for finalization; throws on timeout. */
  waitFor(txHash: string): Promise<TransactionOutcome>;
}

/** The x402 facilitator role: verify the payer's signed transfer, sponsor it and settle it. */
export interface Facilitator {
  settle(payload: PaymentPayload, requirements: PaymentRequirements): Promise<SettleResponse>;
}

export interface TestnetOptions {
  /** Durable record of sent payouts and refunds, keyed by ledger idempotency key. */
  journal: TransferJournal;
  chain?: Chain;
  facilitator?: Facilitator;
  registry?: Concordium["registry"];
  now?: () => Date;
}

/** How long an agent has to pay a 402 requirement. */
const REQUEST_TTL_MS = 15 * 60 * 1000;
/** The signed transfer's own lifetime; the facilitator refuses longer ones. */
const MAX_TIMEOUT_SECONDS = 300;
/** boreal's minor units are cents. */
const MINOR_DECIMALS = 2;

const ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{50}$/;
const KEY = /^[0-9a-fA-F]{64}$/;

/**
 * Reads the testnet config, or throws naming what's missing. Refuses mainnet, and refuses an
 * escrow account that doubles as the sponsor or anchor account: escrow never mixes with boreal's funds.
 */
export function testnetConfigFromEnv(env: Record<string, string | undefined> = process.env): TestnetConfig {
  if ((env.CONCORDIUM_NETWORK && env.CONCORDIUM_NETWORK !== "testnet") || env.BOREAL_NETWORK === "mainnet") {
    throw new TestnetConcordiumError("CONCORDIUM_MODE=testnet runs on testnet only; unset CONCORDIUM_NETWORK or set it to testnet");
  }
  const anchorAccount = env.CONCORDIUM_ANCHOR_ACCOUNT ?? "";
  const anchorKey = env.CONCORDIUM_ANCHOR_KEY ?? "";
  const config: TestnetConfig = {
    network: CONCORDIUM_TESTNET_CAIP2,
    grpcHost: env.CONCORDIUM_GRPC_HOST || "grpc.testnet.concordium.com",
    grpcPort: Number(env.CONCORDIUM_GRPC_PORT || 20000),
    escrowAccount: env.CONCORDIUM_ESCROW_ACCOUNT ?? "",
    escrowKey: env.CONCORDIUM_ESCROW_KEY ?? "",
    sponsorAccount: env.CONCORDIUM_SPONSOR_ACCOUNT || anchorAccount,
    sponsorKey: env.CONCORDIUM_SPONSOR_KEY || anchorKey,
    anchorAccount,
    anchorKey,
    tokenId: env.CONCORDIUM_TOKEN_ID || USDR_TOKEN_ID,
    paymentSecret: env.CONCORDIUM_PAYMENT_SECRET ?? "",
  };
  const problems: string[] = [];
  // With no escrow settings at all, testnet mode runs anchor-only: anchors, the registry and
  // sign-in work, and Concordium stays off as a payment rail.
  const paying = Boolean(env.CONCORDIUM_ESCROW_ACCOUNT || env.CONCORDIUM_ESCROW_KEY || env.CONCORDIUM_PAYMENT_SECRET);
  for (const [name, account, key] of [
    ...(paying ? [["CONCORDIUM_ESCROW", config.escrowAccount, config.escrowKey] as const] : []),
    ["CONCORDIUM_SPONSOR", config.sponsorAccount, config.sponsorKey],
    ["CONCORDIUM_ANCHOR", config.anchorAccount, config.anchorKey],
  ] as const) {
    if (!ADDRESS.test(account)) problems.push(`${name}_ACCOUNT must be a Concordium base58 address`);
    if (!KEY.test(key)) problems.push(`${name}_KEY must be a 64-character hex signing key`);
  }
  if (config.escrowAccount && [config.sponsorAccount, config.anchorAccount].includes(config.escrowAccount)) {
    problems.push("CONCORDIUM_ESCROW_ACCOUNT must be its own account, not the sponsor or anchor account");
  }
  if (paying && config.paymentSecret.length < 32) problems.push("CONCORDIUM_PAYMENT_SECRET must be at least 32 characters");
  if (problems.length) throw new TestnetConcordiumError(`CONCORDIUM_MODE=testnet: ${problems.join("; ")}`);
  return config;
}

function equalStrings(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Every requirement field a payer could tamper with, in a fixed order. */
function sealedFields(r: X402PaymentRequirement): string {
  const { feePayer, resource, minorUnits, nonce, expiresAt } = r.extra;
  return [r.scheme, r.network, r.asset, r.payTo, r.amount, r.maxTimeoutSeconds, feePayer, resource, minorUnits, nonce, expiresAt].join("|");
}

/** CBOR text string, so CCDExplorer shows the registered data as readable text. */
function cborText(text: string): Uint8Array {
  const bytes = Buffer.from(text, "utf8");
  const head =
    bytes.length < 24 ? [0x60 + bytes.length] : bytes.length < 256 ? [0x78, bytes.length] : [0x79, bytes.length >> 8, bytes.length & 0xff];
  return Buffer.concat([Buffer.from(head), bytes]);
}

/** Not personal and not reversible to a task without boreal's data: a short hash of the ledger key. */
function transferMemo(idempotencyKey: string): string {
  return `boreal:${createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 32)}`;
}

export function createTestnetConcordium(config: TestnetConfig, options: TestnetOptions): Concordium {
  const { journal, now = () => new Date() } = options;
  let client: ConcordiumGRPCClient | undefined;
  const grpc = () =>
    (client ??= new ConcordiumGRPCNodeClient(config.grpcHost, config.grpcPort, credentials.createSsl(), { timeout: 20_000 }));
  const chain = options.chain ?? grpcChain(grpc(), config);
  const facilitator =
    options.facilitator ??
    new ExactConcordiumScheme({
      signer: toConcordiumFacilitatorSigner(config.sponsorAccount, config.sponsorKey, {
        host: config.grpcHost,
        port: config.grpcPort,
        network: config.network as `${string}:${string}`,
      }),
    });

  const seal = (r: X402PaymentRequirement) => createHmac("sha256", config.paymentSecret).update(sealedFields(r)).digest("base64url");

  /** Token units per minor unit, from the token's on-chain decimals. */
  async function scale(): Promise<bigint> {
    const decimals = await chain.tokenDecimals();
    if (decimals < MINOR_DECIMALS) throw new TestnetConcordiumError(`${config.tokenId} has ${decimals} decimals; cents need at least 2`);
    return BigInt(10) ** BigInt(decimals - MINOR_DECIMALS);
  }

  async function sendAndWait(tx: PreparedTransaction, what: string): Promise<string> {
    await tx.send();
    const outcome = await chain.waitFor(tx.txHash);
    if (outcome.status === "rejected") throw new TestnetConcordiumError(`${what} ${tx.txHash} was rejected on-chain: ${outcome.reason}`);
    return tx.txHash;
  }

  return {
    registry: options.registry ?? registryLookup(),

    identity: {
      // Workers sign in with the Concordium ID App (`id-app.ts`), not through this port.
      async createProofRequest() {
        throw new TestnetConcordiumError("sign in with the Concordium ID App");
      },
      async verifyPresentation() {
        throw new TestnetConcordiumError("sign in with the Concordium ID App");
      },
    },

    // Without an escrow account (anchor-only), there is no Concordium payment rail.
    payments: config.escrowAccount ? {
      async createPaymentRequest(taskId, amount) {
        if (!Number.isSafeInteger(amount) || amount <= 0) throw new TestnetConcordiumError("amount must be a positive integer in minor units");
        const requirement: X402PaymentRequirement = {
          scheme: "exact",
          network: config.network,
          asset: config.tokenId,
          payTo: config.escrowAccount,
          amount: (BigInt(amount) * (await scale())).toString(),
          maxTimeoutSeconds: MAX_TIMEOUT_SECONDS,
          extra: {
            feePayer: config.sponsorAccount,
            resource: taskId,
            minorUnits: amount,
            nonce: randomBytes(12).toString("base64url"),
            expiresAt: new Date(now().getTime() + REQUEST_TTL_MS).toISOString(),
          },
        };
        requirement.extra.seal = seal(requirement);
        return requirement;
      },

      /**
       * The payment is an x402 v2 `PaymentPayload`: `accepted` is the sealed requirement we
       * issued, `payload.signedTransaction` the agent's signed, unsponsored transfer. Settles
       * on-chain (finalized) or throws, and moves nothing if any check fails.
       */
      async confirmPayment(taskId, payment) {
        const p = payment as Partial<PaymentPayload> | null;
        if (p?.x402Version !== 2 || !p.accepted || !p.payload) {
          throw new TestnetConcordiumError("payment must be an x402 v2 payment payload with `accepted` and `payload`");
        }
        const accepted = p.accepted as unknown as X402PaymentRequirement;
        const sealed = typeof accepted.extra?.seal === "string" ? accepted.extra.seal : "";
        if (!sealed || !equalStrings(seal(accepted), sealed)) throw new TestnetConcordiumError("payment requirement was not issued by boreal.work or was changed");
        if (accepted.extra.resource !== taskId) throw new TestnetConcordiumError("payment is for another task");
        if (new Date(accepted.extra.expiresAt) <= now()) throw new TestnetConcordiumError("payment request has expired; ask for a new one");

        const settled = await facilitator.settle(p as PaymentPayload, accepted as unknown as PaymentRequirements);
        if (!settled.success) {
          // A transaction that reached the chain but didn't finalize as expected needs an operator.
          if (settled.transaction) console.error(`[testnet] funding for task ${taskId} failed after submission`, settled);
          throw new TestnetConcordiumError(`payment was not settled: ${settled.errorReason ?? "unknown reason"}`);
        }
        return { txHash: settled.transaction, amount: accepted.extra.minorUnits };
      },

      /**
       * Idempotent by ledger key. A transfer is journaled before it is sent; a retry first asks
       * the chain about the journaled one and sends again only once it can never execute.
       */
      async sponsoredTransfer(transfer) {
        if (!Number.isSafeInteger(transfer.amount) || transfer.amount <= 0) {
          throw new TestnetConcordiumError("amount must be a positive integer in minor units");
        }
        const prior = await journal.find(transfer.idempotencyKey);
        if (prior) {
          const state = await chain.status(prior.txHash);
          if (state.status === "success") return { txHash: prior.txHash };
          if (state.status === "pending") {
            const outcome = await chain.waitFor(prior.txHash);
            if (outcome.status === "success") return { txHash: prior.txHash };
          } else if (state.status === "unknown" && prior.expiry * 1000 > now().getTime()) {
            throw new TestnetConcordiumError(`transfer ${prior.txHash} may still land; retrying after it expires`);
          }
          // Rejected, or never seen and now expired: it can never move money, so send afresh.
        }
        const tx = await chain.prepareTransfer({
          to: transfer.to,
          amount: BigInt(transfer.amount) * (await scale()),
          memo: transferMemo(transfer.idempotencyKey),
        });
        await journal.save(transfer.idempotencyKey, { txHash: tx.txHash, expiry: tx.expiry } satisfies SentTransfer);
        return { txHash: await sendAndWait(tx, "transfer") };
      },

      /** Whole minor units; sub-cent dust is ignored. */
      async escrowBalance() {
        const [balance, unit] = await Promise.all([chain.tokenBalance(config.escrowAccount), scale()]);
        return Number(balance / unit);
      },
    } : null,

    anchor: {
      // Anchoring twice is harmless (the hash is public), so a retry simply sends again.
      async anchor(hash) {
        if (!/^[0-9a-f]{64}$/.test(hash)) throw new TestnetConcordiumError("anchor expects a hex SHA-256 hash");
        const tx = await chain.prepareAnchor(cborText(`boreal:${hash}`));
        return { txHash: await sendAndWait(tx, "anchor") };
      },
    },
  };
}

/** Agent Registry badges, checked live on mainnet then testnet. Unbadged agents are never verified. */
function registryLookup(): Concordium["registry"] {
  return {
    async lookup(registryId) {
      if (registryId.startsWith("unbadged-")) return { registryId, verified: false, ownerRef: null };
      for (const network of ["mainnet", "testnet"] as const) {
        try {
          const badge = await checkRegistryBadge(registryId, network);
          return { registryId, verified: true, ownerRef: badge.ownerAccount };
        } catch (error) {
          if (!(error instanceof BadgeError)) throw error;
        }
      }
      return { registryId, verified: false, ownerRef: null };
    },
  };
}

/** gRPC NOT_FOUND: the node has never seen this transaction. */
function isNotFound(error: unknown): boolean {
  const e = error as { code?: unknown; message?: unknown };
  return e?.code === 5 || (typeof e?.message === "string" && /not ?found/i.test(e.message));
}

/** Reads a finalized block item's outcome: rejected account transactions carry a reject reason. */
function outcomeOf(summary: unknown): TransactionOutcome {
  const s = summary as { transactionType?: string; rejectReason?: { tag?: string } | null } | null;
  if (s?.transactionType === "failed") return { status: "rejected", reason: s.rejectReason?.tag ?? "unknown" };
  return { status: "success" };
}

/** The real chain, over a Concordium node's gRPC API. */
export function grpcChain(
  client: ConcordiumGRPCClient,
  config: Pick<TestnetConfig, "tokenId" | "escrowAccount" | "escrowKey" | "sponsorAccount" | "sponsorKey" | "anchorAccount" | "anchorKey">,
  options: { now?: () => Date; finalizationTimeoutMs?: number } = {},
): Chain {
  const { now = () => new Date(), finalizationTimeoutMs = 60_000 } = options;
  const tokenId = TokenId.fromString(config.tokenId);
  const escrow = config.escrowAccount ? AccountAddress.fromBase58(config.escrowAccount) : null;
  const sponsor = AccountAddress.fromBase58(config.sponsorAccount);
  const anchorAccount = AccountAddress.fromBase58(config.anchorAccount);
  const escrowSigner = config.escrowKey ? buildBasicAccountSigner(config.escrowKey) : null;
  const sponsorSigner = buildBasicAccountSigner(config.sponsorKey);
  const anchorSigner = buildBasicAccountSigner(config.anchorKey);
  let decimals: Promise<number> | undefined;

  function tokenDecimals(): Promise<number> {
    decimals ??= client.getTokenInfo(tokenId).then(
      (info) => info.state.decimals,
      (error) => {
        decimals = undefined;
        throw error;
      },
    );
    return decimals;
  }

  const expiryNow = () => Math.floor(now().getTime() / 1000) + MAX_TIMEOUT_SECONDS;

  function prepared(finalized: Transaction.Finalized, expiry: number): PreparedTransaction {
    // The node names a transaction by the SHA-256 of its block item. The SDK's
    // getAccountTransactionHash gets v0 (unsponsored) transactions wrong, so anchors were
    // waited on under a hash the chain never had.
    const txHash = createHash("sha256").update(Transaction.serializeBlockItem(finalized)).digest("hex");
    return {
      txHash,
      expiry,
      async send() {
        const sent = TransactionHash.toHexString(await client.sendTransaction(finalized));
        if (sent !== txHash) throw new TestnetConcordiumError(`the node named transaction ${txHash} as ${sent}`);
      },
    };
  }

  async function signed(builder: ReturnType<typeof Transaction.create>, sender: AccountAddress.Type, signer: AccountSigner, sponsored: boolean) {
    const expiry = expiryNow();
    const { nonce } = await client.getNextAccountNonce(sender);
    const metadata = { sender, nonce, expiry: TransactionExpiry.fromEpochSeconds(expiry) };
    if (!sponsored) {
      const signable = builder.addMetadata(metadata).build();
      return prepared(Transaction.finalize(await Transaction.sign(signable, signer)), expiry);
    }
    const signable = builder.addMetadata(metadata).addSponsor(sponsor).build();
    const bySender = await Transaction.sign(signable, signer);
    const bySponsor = await Transaction.sponsor(bySender as Parameters<typeof Transaction.sponsor>[0], sponsorSigner);
    return prepared(Transaction.finalize(bySponsor), expiry);
  }

  return {
    tokenDecimals,

    async tokenBalance(account) {
      const info = await client.getAccountInfo(AccountAddress.fromBase58(account));
      const entry = info.accountTokens.find((t) => t.id.value === tokenId.value);
      return entry ? entry.state.balance.value : BigInt(0);
    },

    async prepareTransfer({ to, amount, memo }) {
      const operations = Cbor.encode([
        {
          transfer: {
            amount: TokenAmount.create(amount, await tokenDecimals()),
            recipient: CborAccountAddress.fromAccountAddress(AccountAddress.fromBase58(to)),
            memo: CborMemo.fromString(memo),
          },
        },
      ]);
      if (!escrow || !escrowSigner) throw new TestnetConcordiumError("no escrow account: this deployment runs anchor-only");
      return signed(Transaction.tokenUpdate({ tokenId, operations }), escrow, escrowSigner, true);
    },

    async prepareAnchor(data) {
      return signed(Transaction.registerData({ data: new DataBlob(Uint8Array.from(data).buffer) }), anchorAccount, anchorSigner, false);
    },

    async status(txHash) {
      try {
        const item = await client.getBlockItemStatus(TransactionHash.fromHexString(txHash));
        return item.status === "finalized" ? outcomeOf(item.outcome.summary) : { status: "pending" };
      } catch (error) {
        if (isNotFound(error)) return { status: "unknown" };
        throw error;
      }
    },

    async waitFor(txHash) {
      const item = await client.waitForTransactionFinalization(TransactionHash.fromHexString(txHash), finalizationTimeoutMs);
      return outcomeOf(item.summary);
    },
  };
}
