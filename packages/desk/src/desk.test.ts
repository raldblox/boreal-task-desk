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
