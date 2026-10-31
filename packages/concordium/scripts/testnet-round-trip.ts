// One real round trip on Concordium testnet: an agent funds a pretend task into escrow over
// x402, escrow pays it back out as a sponsored transfer, and an event hash is anchored. Every
// step prints its CCDExplorer link. It moves test tokens, so it runs only with --yes.
//
//   pnpm --filter @boreal/concordium testnet:round-trip -- --yes [amount-in-cents]
//
// Reads the CONCORDIUM_* variables from the environment or packages/concordium/.env.testnet,
// plus the paying agent's account: CONCORDIUM_TEST_PAYER_ACCOUNT and CONCORDIUM_TEST_PAYER_KEY.
// The payout goes to CONCORDIUM_TEST_PAYOUT_ACCOUNT, or back to the payer.

import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

import { AccountAddress, buildBasicAccountSigner } from "@concordium/web-sdk";
import { ExactConcordiumScheme } from "@x402/concordium/exact/client";
import type { PaymentRequirements } from "@x402/core/types";

import { createTestnetConcordium, type SentTransfer, testnetConfigFromEnv, type TransferJournal } from "../src/index";

const EXPLORER = "https://ccdexplorer.io/testnet";
const args = process.argv.slice(2).filter((a) => a !== "--");
const confirmed = args.includes("--yes");
const cents = Number(args.find((a) => /^\d+$/.test(a)) ?? 100);

const config = testnetConfigFromEnv();
const payerAccount = process.env.CONCORDIUM_TEST_PAYER_ACCOUNT ?? "";
const payerKey = process.env.CONCORDIUM_TEST_PAYER_KEY ?? "";
if (!payerAccount || !payerKey) throw new Error("set CONCORDIUM_TEST_PAYER_ACCOUNT and CONCORDIUM_TEST_PAYER_KEY");
if (payerAccount === config.escrowAccount) throw new Error("the payer must not be the escrow account");
const payoutAccount = process.env.CONCORDIUM_TEST_PAYOUT_ACCOUNT || payerAccount;

/** A file journal, so rerunning after a failure never repeats a payout. */
const journalPath = ".local/testnet-journal.json";
const journal: TransferJournal = {
  async find(key) {
    try {
      return (JSON.parse(readFileSync(journalPath, "utf8")) as Record<string, SentTransfer>)[key] ?? null;
    } catch {
      return null;
    }
  },
  async save(key, sent) {
    let all: Record<string, SentTransfer> = {};
    try {
      all = JSON.parse(readFileSync(journalPath, "utf8"));
    } catch {}
    mkdirSync(".local", { recursive: true });
    writeFileSync(journalPath, JSON.stringify({ ...all, [key]: sent }, null, 2));
  },
};

const concordium = createTestnetConcordium(config, { journal });
const taskId = `round-trip-${randomUUID()}`;
const tx = (hash: string) => `${EXPLORER}/transaction/${hash}`;

console.log(`Token ${config.tokenId} on ${config.network} via ${config.grpcHost}:${config.grpcPort}`);
console.log(`Escrow  ${EXPLORER}/account/${config.escrowAccount}`);
console.log(`Sponsor ${EXPLORER}/account/${config.sponsorAccount} (pays every fee)`);
console.log(`Payer   ${EXPLORER}/account/${payerAccount}`);
console.log(`Payout  ${EXPLORER}/account/${payoutAccount}`);
console.log(`Escrow holds ${await concordium.payments.escrowBalance()} cents`);

const requirement = await concordium.payments.createPaymentRequest(taskId, cents);
console.log(`\n1. 402: pay ${requirement.amount} ${requirement.asset} units (${cents} cents) to escrow, sponsored by ${requirement.extra.feePayer}`);
if (!confirmed) {
  console.log("\nDry run: nothing sent. Run again with --yes to fund, pay out and anchor on testnet.");
  process.exit(0);
}

// The agent's side, exactly as an x402 client does it: sign a sponsored transfer, unsponsored.
const client = new ExactConcordiumScheme(
  { accountAddress: AccountAddress.fromBase58(payerAccount), signer: buildBasicAccountSigner(payerKey) },
  { grpcUrl: `${config.grpcHost}:${config.grpcPort}` },
);
const signed = await client.createPaymentPayload(2, requirement as unknown as PaymentRequirements);
const funded = await concordium.payments.confirmPayment(taskId, { ...signed, accepted: requirement });
console.log(`   funded ${funded.amount} cents: ${tx(funded.txHash)}`);
console.log(`   escrow holds ${await concordium.payments.escrowBalance()} cents`);

const payout = await concordium.payments.sponsoredTransfer({ to: payoutAccount, amount: cents, idempotencyKey: `${taskId}:refund` });
console.log(`\n2. paid ${cents} cents out of escrow: ${tx(payout.txHash)}`);
console.log(`   escrow holds ${await concordium.payments.escrowBalance()} cents`);

const hash = createHash("sha256").update(`${taskId}:round-trip`).digest("hex");
const anchored = await concordium.anchor.anchor(hash);
console.log(`\n3. anchored ${hash}: ${tx(anchored.txHash)}`);
process.exit(0);
