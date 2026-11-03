import { quoteFees } from "@boreal/core";
import { agents, type Database, owners } from "@boreal/db";
import { createTestDb } from "@boreal/db/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type Caller, createDesk, type Desk } from "./desk";
import { DeskError } from "./errors";

// A person's own insights: spending on tasks they or their agents posted, and earnings from tasks
// they did. Each sees only their own, and My account offers a report only once it has data.

const HOUR = 60 * 60 * 1000;
const reviewer: Caller = { role: "reviewer", reviewerRef: "boreal-ai-reviewer" };

let db: Database;
let close: () => Promise<void>;
let clock: Date;
let desk: Desk;
let owner: Caller;
let agent: Caller;
let worker: Caller;
let stranger: Caller;

async function signIn(pseudonym: string) {
  const request = await desk.workerProofRequest([]);
  const w = await desk.signInWorker(request, { pseudonym, attributes: {} }, `acct-${pseudonym}`);
  return { role: "worker", workerId: w.id } as Caller;
}

/** A task the agent posts and funds, the worker does, and the reviewer passes; paid out at once. */
async function paidTask(budget = 1_000) {
  const { task } = await desk.postTask(agent, {
    description: "Photograph item X on the shelf at the Manila shop, with its price tag visible.",
    acceptanceCriteria: ["Photo shows item X on a shelf"],
    requiredAttributes: [],
    resultFormat: "text",
    budget,
    deadline: new Date(clock.getTime() + 24 * HOUR).toISOString(),
  });
  await desk.screenTask(reviewer, task.id, { outcome: "ok" });
  await desk.fundTask(agent, task.id, { txHash: `tx-${task.id}`, amount: quoteFees(budget).total });
  clock = new Date(clock.getTime() + 2 * HOUR);
  await desk.claimTask(worker, task.id);
  await desk.submitResult(worker, task.id, { text: "Item X is on the shelf at 99 pesos." });
  await desk.recordVerdict(reviewer, task.id, { outcome: "pass", ruleIds: ["R5.2"], reasoning: "ok" });
  await desk.acceptEarly(agent, task.id);
  await desk.drainOutbox();
  return task.id;
}

afterEach(() => close());

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  clock = new Date("2026-11-02T00:00:00Z");
  const { createDevConcordium } = await import("@boreal/concordium");
  desk = createDesk({
    db,
    now: () => clock,
    concordium: createDevConcordium({ secret: "s".repeat(32), now: () => clock }),
    addresses: { operating: "acct-boreal", reviewers: { "boreal-ai-reviewer": "acct-reviewer" } },
  });
  owner = await signIn("ccdid:owner");
  worker = await signIn("ccdid:worker");
  stranger = await signIn("ccdid:stranger");
  const [o] = await db.insert(owners).values({ kind: "individual", verifiedRef: "ccdid:owner" }).returning();
  const [a] = await db
    .insert(agents)
    .values({ ownerId: o!.id, registryId: "hermes", name: "hermes", maxTaskBudget: 5_000, maxDailySpend: 50_000, refundAddress: "acct-hermes" })
    .returning();
  agent = { role: "requester", agentId: a!.id };
});

describe("my insights", () => {
  it("offers a report only once there are enough live tasks", async () => {
    await paidTask();
    await paidTask();
    expect(await desk.insightsAvailable(owner)).toEqual({ spending: false, earnings: false });
    await paidTask();
    expect(await desk.insightsAvailable(owner)).toEqual({ spending: true, earnings: false });
    expect(await desk.insightsAvailable(worker)).toEqual({ spending: false, earnings: true });
    expect(await desk.insightsAvailable(stranger)).toEqual({ spending: false, earnings: false });
  });

  it("shows an owner their agents' spending, and a worker their earnings, without anyone else's identity", async () => {
    const id = await paidTask(900);

    const spending = await desk.mySpending(owner);
    expect(spending.tasks).toEqual([expect.objectContaining({ id, postedBy: "hermes", total: quoteFees(900).total, verdict: "pass", ownPage: false, hoursToClaim: 2 })]);
    expect(spending.entries.map((e) => e.kind).sort()).toEqual(["funding", "platform fee", "review fee", "worker pay"]);

    const earnings = await desk.myEarnings(worker);
    expect(earnings).toEqual([expect.objectContaining({ id, state: "paid", paid: 900, requester: "an agent", rail: "concordium" })]);

    // Nothing behind a pseudonym, and no one else's tasks.
    expect(JSON.stringify({ spending, earnings })).not.toMatch(/ccdid:|acct-/);
    expect(await desk.mySpending(worker)).toEqual({ tasks: [], entries: [] });
    expect(await desk.myEarnings(owner)).toEqual([]);
  });

  it("is for signed-in people only", async () => {
    await expect(desk.mySpending(agent)).rejects.toBeInstanceOf(DeskError);
    await expect(desk.myEarnings(reviewer)).rejects.toBeInstanceOf(DeskError);
  });
});
