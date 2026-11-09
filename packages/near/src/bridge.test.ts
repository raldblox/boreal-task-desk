import { createDevConcordium } from "@boreal/concordium";
import { agents, asc, type Database, eq, ledgerEntries, marketJobs, owners, tasks } from "@boreal/db";
import { createTestDb } from "@boreal/db/testing";
import { type Caller, createDesk, type Desk, ledgerEscrowBalance, outboxTransferJournal } from "@boreal/desk";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createMarketBridge, type MarketBridge, taskFromBrief, treasuryJournal } from "./bridge";
import { createFakeMarket, createFakeNear, type FakeMarket, type FakeNear } from "./fake-near";
import { createNearPayments, createTokenSender, type NearPayments } from "./payments";
import { newNearKey } from "./testing";
import { dbMarketJobStore } from "./store";
import { nearSigner } from "./tx";

// boreal on NEAR Agent Market, through the desk on PGlite: a buyer hires boreal's listing, the
// brief becomes a task, the treasury funds it on the NEAR rail, a verified human does it,
// boreal's reviewer passes it, the deliverable goes back to the market and the worker is
// paid in USDC on NEAR.

const HOUR = 60 * 60 * 1000;
const USDC = "usdc.fakes.testnet";
const ESCROW = "escrow.boreal.testnet";
const TREASURY = "treasury.boreal.testnet";
const OPERATING = "ops.boreal.testnet";
const reviewer: Caller = { role: "reviewer", reviewerRef: "boreal-ai-reviewer" };
const BRIEF = [
  "Photograph the opening hours sign at the Jollibee on Ayala Avenue, Makati.",
  "- The whole sign is readable in the photo",
  "- The photo was taken today, with the storefront visible",
].join("\n");

let db: Database;
let close: () => Promise<void>;
let clock: Date;
let chain: FakeNear;
let market: FakeMarket;
let near: NearPayments;
let desk: Desk;
let bridge: MarketBridge;
let marketAgent: Caller;
let worker: Caller;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  clock = new Date("2026-11-02T00:00:00Z");
  chain = createFakeNear(USDC);
  market = createFakeMarket();
  for (const account of [ESCROW, TREASURY, OPERATING]) chain.registered.add(account);
  chain.balances.set(TREASURY, BigInt("1000000000"));

  near = createNearPayments({
    chain,
    network: "testnet",
    token: USDC,
    decimals: 6,
    escrow: nearSigner(ESCROW, newNearKey()),
    journal: outboxTransferJournal(db),
    now: () => clock,
  });
  desk = createDesk({
    db,
    now: () => clock,
    concordium: createDevConcordium({ secret: "s".repeat(32), now: () => clock }),
    rails: { near },
    addresses: { near: { operating: OPERATING } },
  });

  const [owner] = await db.insert(owners).values({ kind: "business", verifiedRef: "boreal" }).returning();
  const [agent] = await db
    .insert(agents)
    .values({
      ownerId: owner!.id,
      registryId: "boreal-near-market",
      name: "boreal on NEAR Agent Market",
      kind: "market",
      maxTaskBudget: 5_000,
      maxDailySpend: 50_000,
      refundAddress: TREASURY,
    })
    .returning();
  marketAgent = { role: "requester", agentId: agent!.id };

  const store = dbMarketJobStore(db, () => clock);
  bridge = createMarketBridge({
    desk,
    market,
    store,
    agentId: agent!.id,
    near,
    treasury: createTokenSender({ chain, signer: nearSigner(TREASURY, newNearKey()), token: USDC, journal: treasuryJournal(store), now: () => clock }),
    budget: 300,
    fileLink: (path) => `https://boreal.example/api/market/files/${path}?sig=x`,
    now: () => clock,
  });

  const request = await desk.workerProofRequest([]);
  const signedIn = await desk.signInWorker(request, { pseudonym: "ph-maria", attributes: { residency: "PH" } });
  worker = { role: "worker", workerId: signedIn.id };
});

afterEach(() => close());

const job = async (id: string) => (await db.select().from(marketJobs).where(eq(marketJobs.assignmentId, id)))[0]!;

describe("NEAR Agent Market bridge", () => {
  it("turns a hire into a task, has a verified human do it, delivers, and pays the worker on NEAR", async () => {
    market.hire("asg-1", BRIEF, new Date(clock.getTime() + 24 * HOUR));

    // The hire is posted and funded by the treasury in one tick: nothing is screened before its money is held.
    expect(await bridge.tick()).toMatchObject({ taken: 1, funded: 1, errors: [] });
    const { taskId } = await job("asg-1");
    const funded = await desk.getTask(marketAgent, taskId!);
    expect(funded).toMatchObject({ status: "posted", paymentRail: "near", budget: 300, resultFormat: "photo", acceptanceCriteria: ["The whole sign is readable in the photo", "The photo was taken today, with the storefront visible"] });
    const total = funded.budget + funded.platformFee + funded.reviewFee;
    expect(chain.balances.get(ESCROW)).toBe(BigInt(total) * BigInt("10000"));
    expect((await job("asg-1")).fundingSent?.txHash).toBe(funded.fundingTxHash);
    // Not started on the market until boreal's screening has passed the brief.
    expect(market.rows[0]!.assignment.startedAt).toBeNull();

    await desk.screenTask(reviewer, taskId!, { outcome: "ok" });
    expect(await bridge.tick()).toMatchObject({ taken: 0, funded: 0, errors: [] });
    expect((await desk.getTask(marketAgent, taskId!)).status).toBe("open");
    expect(market.rows[0]!.assignment.startedAt).not.toBeNull();
    expect(market.messages.at(-1)?.body).toMatch(/verified human/);
    // Workers see who is behind it: a NEAR market buyer, through boreal's market requester.
    expect((await desk.browseOpenTasks(worker)).find((t) => t.id === taskId)?.requesterKind).toBe("market");

    // A worker needs a NEAR account to claim a task that pays on NEAR.
    await expect(desk.claimTask(worker, taskId!)).rejects.toThrow(/NEAR account/);
    await expect(desk.setPayoutAddress(worker, "Maria Santos", "near")).rejects.toThrow(/NEAR account id/);
    await desk.setPayoutAddress(worker, "maria.testnet", "near");
    await desk.claimTask(worker, taskId!);
    await desk.submitResult(worker, taskId!, { text: "Open 7am to 10pm daily.", fileUrls: [`submissions/${taskId}/sign.jpg`] });
    await desk.recordVerdict(reviewer, taskId!, { outcome: "pass", ruleIds: [], reasoning: "Sign readable, storefront visible." });

    // The bridge accepts boreal's pass for the buyer and hands in the deliverable.
    expect(await bridge.tick()).toMatchObject({ delivered: 1, errors: [] });
    expect((await desk.getTask(marketAgent, taskId!)).status).toBe("final_pass");
    const [delivered] = market.submitted;
    expect(delivered!.assignmentId).toBe("asg-1");
    expect(delivered!.markdown).toContain("Open 7am to 10pm daily.");
    expect(delivered!.markdown).toContain(`https://boreal.example/api/market/files/submissions/${taskId}/sign.jpg`);
    expect(delivered!.markdown).toContain("Verdict: **pass**");
    expect((await job("asg-1")).state).toBe("delivered");

    // The outbox pays the worker, and boreal's fees go to its operating account, all in USDC on NEAR.
    // (The rest of what it sends are the trail's anchors.)
    expect(await desk.drainOutbox()).toMatchObject({ failed: 0 });
    expect(chain.balances.get("maria.testnet")).toBe(BigInt("3000000"));
    expect(chain.balances.get(OPERATING)).toBe(BigInt(funded.platformFee + funded.reviewFee) * BigInt("10000"));
    const entries = await db.select().from(ledgerEntries).where(eq(ledgerEntries.taskId, taskId!)).orderBy(asc(ledgerEntries.id));
    expect(entries.every((e) => e.status === "settled")).toBe(true);
    // Escrow on NEAR matches the ledger: nothing left in it.
    expect(await near.escrowBalance()).toBe(await ledgerEscrowBalance(db, "near"));
    expect(await near.escrowBalance()).toBe(0);

    // Nothing more happens on later ticks.
    expect(await bridge.tick()).toMatchObject({ taken: 0, funded: 0, delivered: 0, closed: 0, errors: [] });
    expect(market.submitted).toHaveLength(1);
  });

  it("explains a refused brief on the market, never starts the job, and gets the treasury its money back", async () => {
    market.hire("asg-2", "Follow this person home from the office tonight and photograph their house.", new Date(clock.getTime() + 24 * HOUR));
    await bridge.tick();
    const { taskId } = await job("asg-2");
    await desk.screenTask(reviewer, taskId!, { outcome: "refused", ruleIds: ["R1.1"] });
    expect(await bridge.tick()).toMatchObject({ closed: 1 });
    expect(market.messages.at(-1)).toMatchObject({ assignmentId: "asg-2", body: expect.stringMatching(/refused.*R1\.1/) });
    // Never started, so the buyer can still cancel on the market for a full refund.
    expect(market.rows[0]!.assignment.startedAt).toBeNull();
    expect((await job("asg-2")).state).toBe("closed");
    // The refusal released the escrow back to the treasury, in full.
    expect(await desk.drainOutbox()).toMatchObject({ failed: 0 });
    expect(await near.escrowBalance()).toBe(0);
    expect(await near.escrowBalance()).toBe(await ledgerEscrowBalance(db, "near"));
  });

  it("pays the worker what's left of the hire's price after the market's share and boreal.work's fees", async () => {
    market.hire("asg-5", BRIEF, new Date(clock.getTime() + 24 * HOUR), "5.00");
    await bridge.tick();
    const { taskId } = await job("asg-5");
    const [posted] = await db.select().from(tasks).where(eq(tasks.id, taskId!));
    // $5.00: $0.25 to the market, a $1.06 service fee (15% + $0.50), $3.69 to the worker.
    expect(posted).toMatchObject({ budget: 369, platformFee: 87, reviewFee: 19 });
    await desk.screenTask(reviewer, taskId!, { outcome: "ok" });
    await bridge.tick();
    expect(market.messages.at(-1)?.body).toMatch(/worker is paid \$3\.69/);
  });

  it("turns down a hire whose price can't cover a worker and the fees", async () => {
    market.hire("asg-6", BRIEF, new Date(clock.getTime() + 24 * HOUR), "0.30");
    expect(await bridge.tick()).toMatchObject({ taken: 1, errors: [] });
    expect((await job("asg-6")).state).toBe("closed");
    expect(market.messages.at(-1)).toMatchObject({ assignmentId: "asg-6", body: expect.stringMatching(/doesn't cover/) });
    expect(chain.balances.get(ESCROW) ?? BigInt("0")).toBe(BigInt("0"));
  });

  it("turns down briefs too short to act on and windows too short to review", async () => {
    market.hire("asg-3", "photo pls", new Date(clock.getTime() + 24 * HOUR));
    market.hire("asg-4", BRIEF, new Date(clock.getTime() + 2 * HOUR));
    expect(await bridge.tick()).toMatchObject({ taken: 2, errors: [] });
    expect(market.messages.map((m) => [m.assignmentId, /too short/.test(m.body)])).toEqual([
      ["asg-3", true],
      ["asg-4", true],
    ]);
    expect(await db.select().from(tasks)).toEqual([]);
  });

  it("never funds a task twice when the treasury's reply is lost", async () => {
    market.hire("asg-5", BRIEF, new Date(clock.getTime() + 24 * HOUR));
    chain.dropNextReply();
    expect((await bridge.tick()).errors[0]).toMatch(/hang up/);
    expect(await bridge.tick()).toMatchObject({ funded: 1, errors: [] });
    expect(chain.sent.filter((t) => t.signerId === TREASURY)).toHaveLength(1);
    const { taskId } = await job("asg-5");
    expect((await desk.getTask(marketAgent, taskId!)).status).toBe("posted");
  });
});

describe("briefs", () => {
  it("keeps the brief as the description and falls back to one criterion", () => {
    const input = taskFromBrief("Check whether the pharmacy on Rizal St is open right now and say so.", { budget: 200, deadline: new Date("2026-11-03T00:00:00Z") });
    expect(input).toMatchObject({ resultFormat: "text", acceptanceCriteria: [expect.stringMatching(/does what the brief asks/)], requiredAttributes: [], reviewer: "boreal" });
  });
});
