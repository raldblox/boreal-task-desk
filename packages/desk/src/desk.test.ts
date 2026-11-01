import { POLICY, quoteFees } from "@boreal/core";
import {
  agents,
  asc,
  type Database,
  eq,
  ledgerEntries,
  outbox,
  owners,
  taskEvents,
  workers,
} from "@boreal/db";
import { createTestDb } from "@boreal/db/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type Caller, createDesk, type Desk } from "./desk";
import { DeskError } from "./errors";
import { issueAgentKey, verifyAgentKey } from "./keys";
import { taskTotal } from "./money";
import { hashEvent } from "./trail";

const HOUR = 60 * 60 * 1000;
let db: Database;
let close: () => Promise<void>;
let clock: Date;
let desk: Desk;

let requester: Caller;
let otherRequester: Caller;
let manilaWorker: Caller;
let otherWorker: Caller;
const reviewer: Caller = { role: "reviewer", reviewerRef: "boreal-ai-reviewer" };
const panel: Caller = { role: "panel", reviewerRef: "panel-1" };

const advance = (ms: number) => {
  clock = new Date(clock.getTime() + ms);
};

const taskInput = (overrides: Record<string, unknown> = {}) => ({
  description: "Photograph item X on the shelf at the Manila shop, with its price tag visible.",
  acceptanceCriteria: ["Photo shows item X on a shelf", "Price tag is readable"],
  requiredAttributes: [{ attribute: "residency", value: "PH" }],
  resultFormat: "photo",
  budget: 1_000,
  deadline: new Date(clock.getTime() + 24 * HOUR).toISOString(),
  ...overrides,
});

async function seedAgent(name: string, maxDailySpend = 50_000) {
  const [owner] = await db
    .insert(owners)
    .values({ kind: "individual", verifiedRef: `owner-${name}` })
    .returning();
  const [agent] = await db
    .insert(agents)
    .values({ ownerId: owner!.id, registryId: `registry-${name}`, name, maxTaskBudget: 5_000, maxDailySpend })
    .returning();
  return agent!;
}

async function seedWorker(pseudonym: string, attributes: Record<string, string>) {
  const [worker] = await db
    .insert(workers)
    .values({ pseudonym, provenAttributes: attributes })
    .returning();
  return worker!;
}

/** Posts, screens and funds a task, returning its id. */
async function openTask(overrides: Record<string, unknown> = {}) {
  const { task, quote } = await desk.postTask(requester, taskInput(overrides));
  await desk.screenTask(reviewer, task.id, { outcome: "ok" });
  await desk.fundTask(requester, task.id, { txHash: `tx-${task.id}`, amount: quote.total });
  return task.id;
}

async function submittedTask() {
  const id = await openTask();
  await desk.claimTask(manilaWorker, id);
  await desk.submitResult(manilaWorker, id, { fileUrls: [`submissions/${id}/photo.jpg`] });
  return id;
}

async function ledgerFor(taskId: string) {
  return db.select().from(ledgerEntries).where(eq(ledgerEntries.taskId, taskId)).orderBy(asc(ledgerEntries.id));
}

async function escrowBalance(taskId: string) {
  const rows = await ledgerFor(taskId);
  return rows.reduce(
    (sum, r) => sum + (r.toAccount === "escrow" ? r.amount : 0) - (r.fromAccount === "escrow" ? r.amount : 0),
    0,
  );
}

async function expectDeskError(promise: Promise<unknown>, code: DeskError["code"]) {
  await expect(promise).rejects.toSatisfy((e: unknown) => e instanceof DeskError && e.code === code);
}

// A fresh database per test, so timer sweeps only ever see this test's tasks.
afterEach(() => close());

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  clock = new Date("2026-11-02T00:00:00Z");
  desk = createDesk({ db, now: () => clock });
  const suffix = crypto.randomUUID();
  requester = { role: "requester", agentId: (await seedAgent(`hermes-${suffix}`)).id };
  otherRequester = { role: "requester", agentId: (await seedAgent(`script-${suffix}`)).id };
  manilaWorker = { role: "worker", workerId: (await seedWorker(`ph-${suffix}`, { residency: "PH" })).id };
  otherWorker = { role: "worker", workerId: (await seedWorker(`us-${suffix}`, { residency: "US" })).id };
});

describe("happy path", () => {
  it("pays the worker, reviewer and boreal once the objection window closes", async () => {
    const id = await submittedTask();
    await desk.recordVerdict(reviewer, id, { outcome: "pass", ruleIds: ["R4.1"], reasoning: "Shows item and tag" });

    advance(POLICY.objectionWindowMs - 1);
    expect(await desk.closeObjectionWindows()).toBe(0);
    advance(1);
    expect(await desk.closeObjectionWindows()).toBe(1);

    const task = await desk.getTask(requester, id);
    expect(task.status).toBe("final_pass");

    const quote = quoteFees(1_000);
    const payouts = (await ledgerFor(id)).filter((r) => r.fromAccount === "escrow");
    expect(payouts.map((r) => [r.toAccount, r.amount])).toEqual([
      ["worker", quote.budget],
      ["reviewer", quote.reviewFee],
      ["operating", quote.platformFee],
    ]);
    expect(await escrowBalance(id)).toBe(0);

    const queued = await db.select().from(outbox).where(eq(outbox.kind, "payout"));
    expect(queued.filter((o) => (o.payload as { ledgerKey: string }).ledgerKey.startsWith(id))).toHaveLength(3);
  });

  it("lets the requester accept a pass early", async () => {
    const id = await submittedTask();
    await desk.recordVerdict(reviewer, id, { outcome: "pass", ruleIds: [], reasoning: "ok" });
    expect((await desk.acceptEarly(requester, id)).status).toBe("final_pass");
  });

  it("records a hash chain that verifies end to end", async () => {
    const id = await submittedTask();
    const events = await db.select().from(taskEvents).where(eq(taskEvents.taskId, id)).orderBy(asc(taskEvents.id));
    expect(events.map((e) => e.type)).toEqual(["posted", "screen_ok", "fund", "claim", "submit"]);

    let prev: string | null = null;
    for (const e of events) {
      expect(e.prevHash).toBe(prev);
      const recomputed = hashEvent({ ...e, taskId: e.taskId, at: e.createdAt });
      expect(recomputed).toBe(e.hash);
      prev = e.hash;
    }
    const anchors = await db.select().from(outbox).where(eq(outbox.kind, "anchor"));
    expect(anchors.length).toBeGreaterThanOrEqual(events.length);
  });
});

describe("who may do what", () => {
  it("hides and protects one agent's task from another", async () => {
    const id = await openTask();
    await expectDeskError(desk.cancelTask(otherRequester, id), "forbidden");
    await expectDeskError(desk.getTask(otherRequester, id), "not_found");
  });

  it("never lets the requester overrule a pass", async () => {
    const id = await submittedTask();
    await desk.recordVerdict(reviewer, id, { outcome: "pass", ruleIds: [], reasoning: "ok" });
    await expectDeskError(
      desk.recordVerdict(requester, id, { outcome: "fail", ruleIds: ["R4.1"], reasoning: "no" }),
      "forbidden",
    );
  });

  it("requires every fail to cite a rule", async () => {
    const id = await submittedTask();
    await expectDeskError(desk.recordVerdict(reviewer, id, { outcome: "fail", ruleIds: [], reasoning: "bad" }), "invalid");
  });

  it("only lets the claiming worker submit", async () => {
    const id = await openTask({ requiredAttributes: [] });
    await desk.claimTask(manilaWorker, id);
    await expectDeskError(desk.submitResult(otherWorker, id, { fileUrls: ["x"] }), "forbidden");
  });
});

describe("worker views", () => {
  it("shows a worker only the open tasks they qualify for", async () => {
    const forPh = await openTask();
    const forAnyone = await openTask({ requiredAttributes: [] });
    expect((await desk.browseOpenTasks(otherWorker)).map((t) => t.id)).toEqual([forAnyone]);
    expect((await desk.browseOpenTasks(manilaWorker)).map((t) => t.id).sort()).toEqual([forPh, forAnyone].sort());
  });

  it("shows the standing verdict without naming the reviewer", async () => {
    const id = await submittedTask();
    expect(await desk.getVerdict(manilaWorker, id)).toBeNull();
    await desk.recordVerdict(reviewer, id, { outcome: "fail", ruleIds: ["R4.2"], reasoning: "tag unreadable" });
    await desk.disputeVerdict(manilaWorker, id, "The tag is readable at full size.");
    await desk.decideDispute(panel, id, { outcome: "pass", ruleIds: ["R5.2"], reasoning: "readable" });
    const verdict = await desk.getVerdict(manilaWorker, id);
    expect(verdict).toMatchObject({ outcome: "pass", ruleIds: ["R5.2"], by: "panel" });
    expect(JSON.stringify(verdict)).not.toContain("panel-1");
  });

  it("refuses files that belong to another task", async () => {
    const id = await openTask();
    await desk.claimTask(manilaWorker, id);
    await expectDeskError(desk.submitResult(manilaWorker, id, { fileUrls: ["submissions/other-task/x.jpg"] }), "invalid");
    expect((await desk.listWorkerTasks(manilaWorker)).map((t) => t.id)).toEqual([id]);
  });
});

describe("listing", () => {
  it("lists only the caller's own tasks, newest first, with a status filter", async () => {
    const older = await openTask();
    advance(1_000);
    const { task: newer } = await desk.postTask(requester, taskInput());
    await desk.postTask(otherRequester, taskInput());

    const mine = await desk.listTasks(requester);
    expect(mine.map((t) => t.id)).toEqual([newer.id, older]);
    expect((await desk.listTasks(requester, { status: "open" })).map((t) => t.id)).toEqual([older]);
  });
});

describe("funding", () => {
  it("rejects a payment that doesn't match the quote", async () => {
    const { task, quote } = await desk.postTask(requester, taskInput());
    await desk.screenTask(reviewer, task.id, { outcome: "ok" });
    await expectDeskError(desk.fundTask(requester, task.id, { txHash: "t", amount: quote.total - 1 }), "invalid");
  });

  it("enforces the agent's daily spending cap", async () => {
    const capped: Caller = { role: "requester", agentId: (await seedAgent(`capped-${crypto.randomUUID()}`, 1_500)).id };
    const first = await desk.postTask(capped, taskInput());
    await desk.screenTask(reviewer, first.task.id, { outcome: "ok" });
    await desk.fundTask(capped, first.task.id, { txHash: "a", amount: first.quote.total });

    const second = await desk.postTask(capped, taskInput());
    await desk.screenTask(reviewer, second.task.id, { outcome: "ok" });
    await expectDeskError(desk.fundTask(capped, second.task.id, { txHash: "b", amount: second.quote.total }), "limit");
  });

  it("cancels an unscreened task without moving money", async () => {
    const { task } = await desk.postTask(requester, taskInput());
    expect((await desk.cancelTask(requester, task.id)).status).toBe("cancelled");
    expect(await ledgerFor(task.id)).toHaveLength(0);
  });

  it("refunds everything when an open task is cancelled", async () => {
    const id = await openTask();
    await desk.cancelTask(requester, id);
    const refund = (await ledgerFor(id)).find((r) => r.toAccount === "requester");
    expect(refund?.amount).toBe(quoteFees(1_000).total);
    expect(await escrowBalance(id)).toBe(0);
  });
});

describe("claims and deadlines", () => {
  it("only lets workers with the required attributes claim", async () => {
    const id = await openTask();
    await expectDeskError(desk.claimTask(otherWorker, id), "forbidden");
  });

  it("limits a new worker to one active claim", async () => {
    await desk.claimTask(manilaWorker, await openTask());
    await expectDeskError(desk.claimTask(manilaWorker, await openTask()), "limit");
  });

  it("reopens a task when the claim expires", async () => {
    const id = await openTask();
    await desk.claimTask(manilaWorker, id);
    advance(POLICY.claimDurationMs);
    expect(await desk.expireClaims()).toBe(1);
    const task = await desk.getTask(requester, id);
    expect(task.status).toBe("open");
    expect(task.claimedBy).toBeNull();
  });

  it("refunds an open task that passes its deadline", async () => {
    const id = await openTask();
    advance(24 * HOUR);
    expect(await desk.expireDeadlines()).toBe(1);
    expect((await desk.getTask(requester, id)).status).toBe("expired");
    expect(await escrowBalance(id)).toBe(0);
  });
});

describe("fails and disputes", () => {
  it("returns the budget and platform fee on a final fail, but pays the reviewer", async () => {
    const id = await submittedTask();
    await desk.recordVerdict(reviewer, id, { outcome: "fail", ruleIds: ["R4.2"], reasoning: "item not visible" });
    advance(POLICY.objectionWindowMs);
    await desk.closeObjectionWindows();

    const quote = quoteFees(1_000);
    const payouts = (await ledgerFor(id)).filter((r) => r.fromAccount === "escrow");
    expect(payouts.map((r) => [r.toAccount, r.amount])).toEqual([
      ["requester", quote.budget + quote.platformFee],
      ["reviewer", quote.reviewFee],
    ]);
    expect(await escrowBalance(id)).toBe(0);
  });

  it("pays the worker when the panel overturns a fail", async () => {
    const id = await submittedTask();
    await desk.recordVerdict(reviewer, id, { outcome: "fail", ruleIds: ["R4.2"], reasoning: "item not visible" });
    await desk.disputeVerdict(manilaWorker, id, "The item is on the second shelf, left side.");
    await expectDeskError(desk.disputeVerdict(requester, id, "I want to dispute as well"), "conflict");

    const decided = await desk.decideDispute(panel, id, { outcome: "pass", ruleIds: ["R4.2"], reasoning: "visible" });
    expect(decided.status).toBe("final_pass");
    const worker = (await ledgerFor(id)).find((r) => r.toAccount === "worker");
    expect(worker?.party).toBe((manilaWorker as { workerId: string }).workerId);
  });

  it("refuses a dispute after the objection window", async () => {
    const id = await submittedTask();
    await desk.recordVerdict(reviewer, id, { outcome: "fail", ruleIds: ["R4.2"], reasoning: "no" });
    advance(POLICY.objectionWindowMs + 1);
    await expectDeskError(desk.disputeVerdict(manilaWorker, id, "Too late but trying anyway"), "conflict");
  });
});

describe("agent keys", () => {
  it("accepts the issued key and rejects tampered or replaced ones", async () => {
    const agentId = (requester as { agentId: string }).agentId;
    const key = await issueAgentKey(db, agentId);
    expect(await verifyAgentKey(db, key)).toBe(agentId);
    expect(await verifyAgentKey(db, `${key}x`)).toBeNull();
    expect(await verifyAgentKey(db, "bk_not-a-key")).toBeNull();

    const replacement = await issueAgentKey(db, agentId);
    expect(await verifyAgentKey(db, key)).toBeNull();
    expect(await verifyAgentKey(db, replacement)).toBe(agentId);
  });
});

describe("agent account", () => {
  it("reports the agent's limits and what it has left today", async () => {
    const before = await desk.getAgentAccount(requester);
    expect(before).toMatchObject({ testMode: false, spentLast24h: 0, leftToday: before.limits.maxDailySpend });
    const { quote } = await desk.postTask(requester, taskInput());
    await openTask();
    const after = await desk.getAgentAccount(requester);
    expect(after.spentLast24h).toBe(quote.total);
    expect(after.leftToday).toBe(after.limits.maxDailySpend - quote.total);
  });

  it("is only for requesters", async () => {
    await expectDeskError(desk.getAgentAccount(reviewer), "forbidden");
  });
});

describe("agent linking", () => {
  const limits = { maxTaskBudget: 1_000, maxDailySpend: 5_000 };
  const workerIdOf = (caller: Caller) => (caller as Extract<Caller, { role: "worker" }>).workerId;

  it("lets an agent collect its own key once its owner approves", async () => {
    const { code, pollToken } = await desk.requestAgentLink({ agentName: "Hermes" }, "client-a");
    expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(await desk.pollAgentLink(pollToken)).toMatchObject({ status: "pending" });

    expect(await desk.getAgentLink(code.toLowerCase().replace("-", " "))).toMatchObject({ agentName: "Hermes" });
    await desk.approveAgentLink(workerIdOf(manilaWorker), code, { name: "Hermes", ...limits });

    const collected = await desk.pollAgentLink(pollToken);
    expect(collected).toMatchObject({ status: "approved", agent: { name: "Hermes", testMode: false, badgeVerified: false } });
    const key = (collected as { key: string }).key;
    const agentId = await verifyAgentKey(db, key);
    expect(agentId).toBe((collected as { agent: { id: string } }).agent.id);
    expect(await desk.getAgentAccount({ role: "requester", agentId: agentId! })).toMatchObject({
      limits: { maxTaskBudget: 1_000, maxDailySpend: 5_000 },
    });

    // The key is handed over once, and the code can't be approved again.
    expect(await desk.pollAgentLink(pollToken)).toEqual({ status: "collected" });
    await expectDeskError(desk.approveAgentLink(workerIdOf(manilaWorker), code, { name: "Again", ...limits }), "conflict");
  });

  it("lets the owner save a PayPal account for their agent, and no one else", async () => {
    const link = await desk.requestAgentLink({ agentName: "Hermes" }, "client-a");
    const { agentId } = await desk.approveAgentLink(workerIdOf(manilaWorker), link.code, { name: "Hermes", ...limits });
    const requester: Caller = { role: "requester", agentId };
    expect(await desk.getAgentAccount(requester)).toMatchObject({ savedPaymentMethod: false });
    expect(await desk.listOwnerAgents(workerIdOf(manilaWorker))).toMatchObject([{ id: agentId, paypalConnected: false }]);

    await desk.savePaymentMethod(workerIdOf(manilaWorker), agentId, "vault-123");
    expect(await desk.getAgentAccount(requester)).toMatchObject({ savedPaymentMethod: true });
    expect(await desk.listOwnerAgents(workerIdOf(manilaWorker))).toMatchObject([{ id: agentId, paypalConnected: true }]);

    const stranger = await desk.signInVerifiedWorker({ pseudonym: "sg-stranger", provenAttributes: {} });
    await expectDeskError(desk.savePaymentMethod(stranger.id, agentId, "vault-evil"), "forbidden");
  });

  it("replaces the key of one of the owner's agents instead of making a duplicate", async () => {
    const first = await desk.requestAgentLink({ agentName: "Hermes" }, "client-a");
    await desk.approveAgentLink(workerIdOf(manilaWorker), first.code, { name: "Hermes", ...limits });
    const oldKey = ((await desk.pollAgentLink(first.pollToken)) as { key: string }).key;
    const [mine] = await desk.listOwnerAgents(workerIdOf(manilaWorker));

    const second = await desk.requestAgentLink({ agentName: "Hermes" }, "client-a");
    await desk.approveAgentLink(workerIdOf(manilaWorker), second.code, { name: "Hermes", ...limits, replaceAgentId: mine!.id });
    const newKey = ((await desk.pollAgentLink(second.pollToken)) as { key: string }).key;
    expect(await verifyAgentKey(db, newKey)).toBe(mine!.id);
    expect(await verifyAgentKey(db, oldKey)).toBeNull();
    expect(await desk.listOwnerAgents(workerIdOf(manilaWorker))).toHaveLength(1);

    // Someone else can't take over that agent.
    const third = await desk.requestAgentLink({ agentName: "Hermes" }, "client-b");
    await expectDeskError(
      desk.approveAgentLink(workerIdOf(otherWorker), third.code, { name: "Mine now", ...limits, replaceAgentId: mine!.id }),
      "forbidden",
    );
  });

  it("records a verified badge, and one badge belongs to one agent", async () => {
    const badge = { registryId: "Mf22soLh1NuZYFgBK8iSs", network: "mainnet" as const, ownerAccount: "4DDv…" };
    const a = await desk.requestAgentLink({ agentName: "Hermes" }, "client-a");
    await desk.approveAgentLink(workerIdOf(manilaWorker), a.code, { name: "Hermes", ...limits, badge });
    expect(await desk.pollAgentLink(a.pollToken)).toMatchObject({ agent: { badgeVerified: true } });
    const b = await desk.requestAgentLink({ agentName: "Copycat" }, "client-b");
    await expectDeskError(desk.approveAgentLink(workerIdOf(otherWorker), b.code, { name: "Copycat", ...limits, badge }), "conflict");
  });

  it("refuses testers as owners, and honours denial, expiry and limits", async () => {
    const [tester] = await db.insert(workers).values({ pseudonym: "tester-1", provenAttributes: {}, testMode: true }).returning();
    const link = await desk.requestAgentLink({ agentName: "Hermes" }, "client-a");
    await expectDeskError(desk.approveAgentLink(tester!.id, link.code, { name: "Hermes", ...limits }), "forbidden");
    await expectDeskError(
      desk.approveAgentLink(workerIdOf(manilaWorker), link.code, { name: "Hermes", maxTaskBudget: POLICY.maxTaskBudget + 1, maxDailySpend: 50_000 }),
      "invalid",
    );

    await desk.denyAgentLink(workerIdOf(manilaWorker), link.code);
    expect(await desk.pollAgentLink(link.pollToken)).toEqual({ status: "denied" });

    const late = await desk.requestAgentLink({ agentName: "Hermes" }, "client-a");
    advance(16 * 60 * 1000);
    expect(await desk.pollAgentLink(late.pollToken)).toEqual({ status: "expired" });
    await expectDeskError(desk.getAgentLink(late.code), "conflict");
    await expectDeskError(desk.pollAgentLink("bl_nope"), "not_found");
  });

  it("rate limits link requests per client", async () => {
    for (let i = 0; i < 5; i++) await desk.requestAgentLink({ agentName: `Agent ${i}` }, "client-c");
    await expectDeskError(desk.requestAgentLink({ agentName: "One more" }, "client-c"), "limit");
  });
});

describe("test tasks and owners", () => {
  it("shows a real worker their own agents' test tasks, and no one else's", async () => {
    const [owner] = await db.insert(owners).values({ kind: "individual", verifiedRef: "ph-owner" }).returning();
    const [agent] = await db
      .insert(agents)
      .values({ ownerId: owner!.id, registryId: "registry-owned", name: "mine", maxTaskBudget: 5_000, maxDailySpend: 50_000, testMode: true })
      .returning();
    const ownerWorker: Caller = { role: "worker", workerId: (await seedWorker("ph-owner", { residency: "PH" })).id };
    const mine: Caller = { role: "requester", agentId: agent!.id };

    const { task } = await desk.postTask(mine, taskInput());
    await desk.fundTask(mine, task.id, { txHash: "test", amount: taskTotal(task) });

    expect((await desk.browseOpenTasks(ownerWorker)).map((t) => t.id)).toContain(task.id);
    expect((await desk.browseOpenTasks(manilaWorker)).map((t) => t.id)).not.toContain(task.id);
    await expectDeskError(desk.claimTask(manilaWorker, task.id), "forbidden");
    expect((await desk.claimTask(ownerWorker, task.id)).status).toBe("claimed");
  });
});

describe("money views", () => {
  it("shows the agent its money moving from escrow to the worker", async () => {
    const quote = quoteFees(1_000);
    const id = await submittedTask();
    let balance = await desk.getBalance(requester);
    expect(balance.inEscrow).toBe(quote.total);
    expect(balance.totals.funded).toBe(quote.total);

    await desk.recordVerdict(reviewer, id, { outcome: "pass", ruleIds: ["R4.1"], reasoning: "Shows item and tag" });
    balance = await desk.getBalance(requester);
    expect(balance.awaitingFinalVerdict).toBe(quote.total);
    expect(balance.actions.acceptToPayNow.map((a) => a.taskId)).toEqual([id]);

    await desk.acceptEarly(requester, id);
    // Real money: entries wait for the transfer to confirm.
    expect((await desk.taskMoneyFor(await desk.getTask(requester, id))).state).toBe("settling");
    balance = await desk.getBalance(requester);
    expect(balance.inEscrow).toBe(0);
    expect(balance.settling).toBe(quote.total);
    expect(balance.totals.paidToWorkers).toBe(quote.budget);

    const ledger = await desk.getLedger(requester, { taskId: id });
    expect(ledger.map((e) => e.what)).toEqual(
      expect.arrayContaining(["funded into escrow", "paid to the worker", "review fee to the reviewer", "platform fee to boreal"]),
    );
    expect((await desk.getWorkerEarnings(manilaWorker)).real).toEqual({ paid: 0, settling: quote.budget, upcoming: 0 });
    expect(await desk.getLedger(otherRequester, { taskId: id })).toEqual([]);
  });

  it("settles test money at once and keeps it apart from real earnings", async () => {
    const [owner] = await db.insert(owners).values({ kind: "individual", verifiedRef: "owner-test-money" }).returning();
    const [agent] = await db
      .insert(agents)
      .values({ ownerId: owner!.id, registryId: "registry-test-money", name: "tester", maxTaskBudget: 5_000, maxDailySpend: 50_000, testMode: true })
      .returning();
    const testAgent: Caller = { role: "requester", agentId: agent!.id };
    const tester: Caller = { role: "worker", workerId: (await db.insert(workers).values({ pseudonym: "test:t", provenAttributes: { residency: "PH" }, testMode: true }).returning())[0]!.id };
    const { task } = await desk.postTask(testAgent, taskInput({ reviewer: "requester" }));
    await desk.fundTask(testAgent, task.id, { txHash: "test", amount: taskTotal(task) });
    await desk.claimTask(tester, task.id);
    await desk.submitResult(tester, task.id, { fileUrls: [`submissions/${task.id}/photo.jpg`] });
    await desk.requesterReview(testAgent, task.id, { outcome: "pass", ruleIds: [], reasoning: "All criteria met" });
    await desk.acceptEarly(testAgent, task.id);

    expect((await desk.taskMoneyFor(await desk.getTask(testAgent, task.id))).state).toBe("paid_out");
    expect((await desk.getLedger(testAgent))[0]).toMatchObject({ test: true, txHash: null });
    const earnings = await desk.getWorkerEarnings(tester);
    expect(earnings.test.paid).toBe(task.budget);
    expect(earnings.real.paid).toBe(0);
    await expectDeskError(desk.getBalance(tester), "forbidden");
  });
});

describe("payment rails side by side", () => {
  /** A rail that settles at once and records what it sends. */
  function fakeRail(name: string) {
    const sent: { to: string; amount: number }[] = [];
    let counter = 0;
    const rail = {
      sent,
      async createPaymentRequest(taskId: string, amount: number) {
        return { scheme: "exact" as const, network: name, asset: "USD", payTo: name, amount: String(amount), maxTimeoutSeconds: 60, extra: { resource: taskId, minorUnits: amount, nonce: "n", expiresAt: "2099-01-01T00:00:00Z" } };
      },
      async confirmPayment(_taskId: string, payment: unknown) {
        return { txHash: `${name}-fund-${++counter}`, amount: (payment as { amount: number }).amount };
      },
      async sponsoredTransfer(t: { to: string; amount: number }) {
        sent.push({ to: t.to, amount: t.amount });
        return { txHash: `${name}-pay-${++counter}` };
      },
      async escrowBalance() {
        return 0;
      },
    };
    return rail;
  }

  it("settles each task on the rail it was funded on, paying the worker there", async () => {
    const concordiumRail = fakeRail("concordium");
    const paypalRail = fakeRail("paypal");
    const railDesk = createDesk({
      db,
      now: () => clock,
      payments: concordiumRail,
      rails: { concordium: concordiumRail, paypal: paypalRail },
      addresses: { reviewers: { [reviewer.reviewerRef]: "ccd-reviewer" }, paypal: { reviewers: { [reviewer.reviewerRef]: "reviewer@paypal.test" } } },
    });
    expect(railDesk.defaultRail).toBe("concordium");

    const { task, quote } = await railDesk.postTask(requester, taskInput());
    await railDesk.screenTask(reviewer, task.id, { outcome: "ok" });
    const funded = await railDesk.fundTask(requester, task.id, { confirm: async () => paypalRail.confirmPayment(task.id, { amount: quote.total }) }, { rail: "paypal" });
    expect(funded.paymentRail).toBe("paypal");

    // The worker has to be payable on that rail first.
    await expectDeskError(railDesk.claimTask(manilaWorker, task.id), "forbidden");
    await railDesk.setPayoutAddress(manilaWorker, "maria@paypal.test", "paypal");
    await railDesk.claimTask(manilaWorker, task.id);
    await railDesk.submitResult(manilaWorker, task.id, { fileUrls: [`submissions/${task.id}/photo.jpg`] });
    await railDesk.recordVerdict(reviewer, task.id, { outcome: "pass", ruleIds: ["R4.1"], reasoning: "Shows item and tag" });
    await railDesk.acceptEarly(requester, task.id);
    await railDesk.drainOutbox();

    expect(paypalRail.sent).toEqual(
      expect.arrayContaining([
        { to: "maria@paypal.test", amount: quote.budget },
        { to: "reviewer@paypal.test", amount: quote.reviewFee },
      ]),
    );
    expect(concordiumRail.sent).toEqual([]);
    await expectDeskError(railDesk.setPayoutAddress(manilaWorker, "not-an-email", "paypal"), "invalid");
  });

  it("lets an owner move their agent between test and live money, and no one else", async () => {
    const [owner] = await db.insert(owners).values({ kind: "individual", verifiedRef: "ph-live-owner" }).returning();
    const [agent] = await db
      .insert(agents)
      .values({ ownerId: owner!.id, registryId: "registry-live", name: "live", maxTaskBudget: 5_000, maxDailySpend: 50_000, testMode: true })
      .returning();
    const ownerWorker = await seedWorker("ph-live-owner", {});
    await desk.setAgentTestMode(ownerWorker.id, agent!.id, false);
    expect((await desk.getAgentAccount({ role: "requester", agentId: agent!.id })).testMode).toBe(false);
    await expectDeskError(desk.setAgentTestMode((manilaWorker as Extract<Caller, { role: "worker" }>).workerId, agent!.id, true), "forbidden");
  });
});
