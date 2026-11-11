import { type Chain, createTestnetConcordium, type PayingConcordium, type PaymentRequirement } from "@boreal/concordium";
import { agents, type Database, eq, ledgerEntries, outbox, owners, workers } from "@boreal/db";
import { createTestDb } from "@boreal/db/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type Caller, createDesk, type Desk } from "./desk";
import { outboxTransferJournal } from "./outbox";

// The testnet adapter end to end through the desk, with a fake chain and facilitator in place
// of the Concordium node: funding lands in escrow, payouts leave it once each, and the ledger
// and the chain agree.

const HOUR = 60 * 60 * 1000;
const reviewer: Caller = { role: "reviewer", reviewerRef: "boreal-ai-reviewer" };
const ESCROW = "escrow-account";

let db: Database;
let close: () => Promise<void>;
let clock: Date;
let desk: Desk;
let concordium: PayingConcordium;
let requester: Caller;
let balances: Map<string, bigint>;
let sent: string[];

/** Token balances move when a transaction is sent; every send is recorded. */
function fakeChain(): Chain {
  let n = 0;
  const landed = new Set<string>();
  const move = (from: string, to: string, amount: bigint) => {
    balances.set(from, (balances.get(from) ?? 0n) - amount);
    balances.set(to, (balances.get(to) ?? 0n) + amount);
  };
  return {
    tokenDecimals: async () => 6,
    tokenBalance: async (account) => balances.get(account) ?? 0n,
    async prepareTransfer({ to, amount }) {
      const txHash = `${++n}`.padStart(64, "c");
      return {
        txHash,
        expiry: Math.floor(clock.getTime() / 1000) + 300,
        async send() {
          sent.push(`${to} ${amount}`);
          move(ESCROW, to, amount);
          landed.add(txHash);
        },
      };
    },
    async prepareAnchor() {
      const txHash = `${++n}`.padStart(64, "a");
      return { txHash, expiry: 0, send: async () => void landed.add(txHash) };
    },
    status: async (txHash) => (landed.has(txHash) ? { status: "success" } : { status: "unknown" }),
    waitFor: async () => ({ status: "success" }),
  };
}

async function seedAgent(registryId: string) {
  const [owner] = await db.insert(owners).values({ kind: "individual", verifiedRef: `owner-${registryId}` }).returning();
  const [agent] = await db
    .insert(agents)
    .values({ ownerId: owner!.id, registryId, name: registryId, maxTaskBudget: 5_000, maxDailySpend: 50_000, refundAddress: "agent-account" })
    .returning();
  return agent!;
}

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  clock = new Date("2026-11-02T00:00:00Z");
  balances = new Map([["agent-account", 100_000_000n]]);
  sent = [];
  concordium = createTestnetConcordium(
    {
      network: "ccd:4221332d34e1694168c2a0c0b3fd0f27",
      grpcHost: "localhost",
      grpcPort: 20000,
      escrowAccount: ESCROW,
      escrowKey: "",
      sponsorAccount: "sponsor-account",
      sponsorKey: "",
      anchorAccount: "anchor-account",
      anchorKey: "",
      tokenId: "USDR",
      paymentSecret: "p".repeat(32),
    },
    {
      journal: outboxTransferJournal(db),
      chain: fakeChain(),
      // Settles what the agent signed: the accepted amount moves from the agent into escrow.
      facilitator: {
        async settle(payload, requirements) {
          balances.set("agent-account", balances.get("agent-account")! - BigInt(requirements.amount));
          balances.set(ESCROW, (balances.get(ESCROW) ?? 0n) + BigInt(requirements.amount));
          return { success: true, transaction: "f".repeat(64), network: requirements.network, payer: "agent-account" };
        },
      },
      registry: { lookup: async (registryId) => ({ registryId, verified: true, ownerRef: null }) },
      now: () => clock,
    },
  ) as PayingConcordium;
  desk = createDesk({
    db,
    now: () => clock,
    concordium,
    addresses: { operating: "boreal-operating", reviewers: { "boreal-ai-reviewer": "reviewer-account" } },
  });
  requester = { role: "requester", agentId: (await seedAgent("badged-agent")).id };
});

afterEach(() => close());

async function passedTask() {
  const { task, quote } = await desk.postTask(requester, {
    description: "Photograph item X on the shelf at the Manila shop, with its price tag visible.",
    acceptanceCriteria: ["Photo shows item X on a shelf"],
    requiredAttributes: [],
    resultFormat: "photo",
    budget: 1_000,
    deadline: new Date(clock.getTime() + 24 * HOUR).toISOString(),
  });
  const requirement: PaymentRequirement = await concordium.payments.createPaymentRequest(task.id, quote.total);
  const payment = { x402Version: 2, accepted: requirement, payload: { signedTransaction: { version: 1 } } };
  await desk.fundTask(requester, task.id, { confirm: () => concordium.payments.confirmPayment(task.id, payment) });
  await desk.screenTask(reviewer, task.id, { outcome: "ok" });

  const worker = await desk.signInVerifiedWorker({ pseudonym: "ccdid:ph-1", provenAttributes: {} });
  await db.update(workers).set({ payoutAddress: "worker-account" }).where(eq(workers.id, worker.id));
  const caller: Caller = { role: "worker", workerId: worker.id };
  await desk.claimTask(caller, task.id);
  await desk.submitResult(caller, task.id, { fileUrls: [`submissions/${task.id}/photo.jpg`] });
  await desk.recordVerdict(reviewer, task.id, { outcome: "pass", ruleIds: ["R4.1"], reasoning: "ok" });
  await desk.acceptEarly(requester, task.id);
  return { id: task.id, total: quote.total };
}

describe("testnet money path through the desk", () => {
  it("funds escrow on-chain, pays out once each, and leaves escrow matching the ledger", async () => {
    const { id, total } = await passedTask();
    expect(balances.get(ESCROW)).toBe(BigInt(total) * 10_000n);
    expect(await desk.reconcileEscrow()).toMatchObject({ expected: total, actual: total, gap: 0, short: 0 });

    expect((await desk.drainOutbox(100)).failed).toBe(0);
    expect(sent.map((s) => s.split(" ")[0]).sort()).toEqual(["boreal-operating", "reviewer-account", "worker-account"]);
    expect(balances.get("worker-account")).toBe(1_000n * 10_000n);
    expect(await desk.reconcileEscrow()).toMatchObject({ expected: 0, actual: 0, gap: 0, short: 0 });

    // Every payout is journaled on its outbox row and settled in the ledger with its chain hash.
    const rows = await db.select().from(outbox);
    const entries = await db.select().from(ledgerEntries).where(eq(ledgerEntries.taskId, id));
    for (const row of rows.filter((r) => r.kind === "payout")) {
      const { ledgerKey, sent: journaled } = row.payload as { ledgerKey: string; sent: { txHash: string } };
      expect(entries.find((e) => e.idempotencyKey === ledgerKey)).toMatchObject({ status: "settled", txHash: journaled.txHash });
    }
  });

  it("never pays twice when a payout is retried after it was sent but not recorded", async () => {
    await passedTask();
    await desk.drainOutbox(100);
    // A crash after sending, before the outbox and ledger were updated.
    await db.update(outbox).set({ doneAt: null, nextAttemptAt: clock });
    await db.update(ledgerEntries).set({ status: "pending", txHash: null }).where(eq(ledgerEntries.fromAccount, "escrow"));

    const retried = await desk.drainOutbox(100);
    expect(retried.failed).toBe(0);
    expect(retried.sent).toBeGreaterThan(3);
    expect(sent).toHaveLength(3);
    expect(await desk.reconcileEscrow()).toMatchObject({ expected: 0, actual: 0, gap: 0, short: 0 });
  });
});
