import type { Reviewer, ReviewResult, ScreenResult } from "@boreal/brain";
import { agents, asc, type Database, eq, owners, taskEvents, workers } from "@boreal/db";
import { createTestDb } from "@boreal/db/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type Caller, createDesk, type Desk } from "./desk";
import { AI_REVIEWER, runAiReview } from "./review-loop";

let db: Database;
let close: () => Promise<void>;
let clock: Date;
let desk: Desk;
let requester: Caller;
let worker: Caller;

/** A reviewer that returns whatever the test scripts, and counts its calls. */
function scripted(screen: ScreenResult | (() => ScreenResult), review: ReviewResult = { outcome: "pass", ruleIds: [], reasoning: "ok", model: "claude-opus-5-5" }) {
  const calls = { screen: 0, review: 0 };
  const reviewer: Reviewer = {
    screen: async () => {
      calls.screen++;
      return typeof screen === "function" ? screen() : screen;
    },
    review: async () => {
      calls.review++;
      return review;
    },
  };
  return { reviewer, calls };
}

const photo = async () => ({ bytes: Buffer.from([1]), contentType: "image/jpeg" });

async function postTask() {
  const { task } = await desk.postTask(requester, {
    description: "Photograph item X on the shelf at the Manila shop, with its price tag visible.",
    acceptanceCriteria: ["Photo shows item X on a shelf"],
    resultFormat: "photo",
    budget: 500,
    deadline: new Date(clock.getTime() + 24 * 3600_000).toISOString(),
  });
  return task;
}

/** Posted and funded: only funded tasks are screened. */
async function fundedTask() {
  const task = await postTask();
  await desk.fundTask(requester, task.id, { txHash: `t-${task.id}`, amount: task.budget + task.platformFee + task.reviewFee });
  return task;
}

async function submittedTask() {
  const task = await postTask();
  await desk.fundTask(requester, task.id, { txHash: "t", amount: task.budget + task.platformFee + task.reviewFee });
  await desk.screenTask(AI_REVIEWER, task.id, { outcome: "ok" });
  await desk.claimTask(worker, task.id);
  await desk.submitResult(worker, task.id, { fileUrls: [`submissions/${task.id}/a.jpg`] });
  return task;
}

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  clock = new Date("2026-11-02T00:00:00Z");
  desk = createDesk({ db, now: () => clock });
  const [owner] = await db.insert(owners).values({ kind: "individual", verifiedRef: "o" }).returning();
  const [agent] = await db
    .insert(agents)
    .values({ ownerId: owner!.id, registryId: "dev-a", name: "a", maxTaskBudget: 5_000, maxDailySpend: 50_000 })
    .returning();
  const [w] = await db.insert(workers).values({ pseudonym: "w", provenAttributes: {}, paypalVerified: true }).returning();
  requester = { role: "requester", agentId: agent!.id };
  worker = { role: "worker", workerId: w!.id };
});

afterEach(() => close());

describe("screening", () => {
  it("moves a clean task on to funding, and refuses one that breaks a rule", async () => {
    const clean = await fundedTask();
    await runAiReview(desk, scripted({ outcome: "ok", reasoning: "fine" }).reviewer, { readFile: photo });
    expect((await desk.getTask(requester, clean.id)).status).toBe("open");

    const bad = await fundedTask();
    await runAiReview(desk, scripted({ outcome: "refused", ruleIds: ["R2.3"], reasoning: "collects data" }).reviewer, {
      readFile: photo,
    });
    expect((await desk.getTask(requester, bad.id)).status).toBe("refused");
  });

  it("hands an undecided task to a human, records it, and stops asking the AI", async () => {
    const task = await fundedTask();
    const { reviewer, calls } = scripted({ outcome: "needs_human", reason: "borderline legality" });
    expect(await runAiReview(desk, reviewer, { readFile: photo })).toMatchObject({ toHumans: 1 });
    await runAiReview(desk, reviewer, { readFile: photo });
    expect(calls.screen).toBe(1);

    const [flagged] = await desk.humanQueue();
    expect(flagged).toMatchObject({ id: task.id, status: "posted", humanReason: "borderline legality" });
    const types = (await db.select().from(taskEvents).where(eq(taskEvents.taskId, task.id)).orderBy(asc(taskEvents.id))).map((e) => e.type);
    expect(types).toEqual(["posted", "fund", "flagged_for_human"]);

    // A human reviewer's decision clears the flag.
    await desk.screenTask({ role: "reviewer", reviewerRef: "human-1" }, task.id, { outcome: "ok" });
    expect(await desk.humanQueue()).toHaveLength(0);
  });

  it("backs off on outages and gives up to a human on the third failure", async () => {
    const task = await fundedTask();
    const { reviewer, calls } = scripted({ outcome: "retry", reason: "overloaded" });
    expect(await runAiReview(desk, reviewer, { readFile: photo })).toMatchObject({ deferred: 1 });
    await runAiReview(desk, reviewer, { readFile: photo });
    expect(calls.screen).toBe(1); // still backing off

    clock = new Date(clock.getTime() + 3 * 60_000);
    await runAiReview(desk, reviewer, { readFile: photo });
    clock = new Date(clock.getTime() + 5 * 60_000);
    expect(await runAiReview(desk, reviewer, { readFile: photo })).toMatchObject({ toHumans: 1 });
    expect(calls.screen).toBe(3);
    expect((await desk.humanQueue())[0]?.id).toBe(task.id);
  });
});

describe("result review", () => {
  it("records the AI verdict with the model that made it", async () => {
    const task = await submittedTask();
    await runAiReview(
      desk,
      scripted({ outcome: "ok", reasoning: "" }, { outcome: "fail", ruleIds: ["R4.2"], reasoning: "tag unreadable", model: "claude-opus-5-5" }).reviewer,
      { readFile: photo },
    );
    expect((await desk.getTask(requester, task.id)).status).toBe("failed");
    const [verdict] = await db.select().from(taskEvents).where(eq(taskEvents.type, "verdict_fail"));
    expect(verdict?.payload).toMatchObject({ ruleIds: ["R4.2"], model: "claude-opus-5-5", reviewerRef: "boreal-ai-reviewer" });
  });

  it("sends a submission whose file can't be read to a human without asking the AI", async () => {
    const task = await submittedTask();
    const { reviewer, calls } = scripted({ outcome: "ok", reasoning: "" });
    await runAiReview(desk, reviewer, { readFile: async () => null });
    expect(calls.review).toBe(0);
    expect((await desk.humanQueue())[0]).toMatchObject({ id: task.id, status: "submitted" });
  });
});

describe("private review", () => {
  const proof = {
    provider: "near-ai-cloud" as const,
    model: "z-ai/glm-5.3-flash",
    completionId: "chat-1",
    requestSha256: "aa",
    responseSha256: "bb",
    signedText: "z-ai/glm-5.3-flash:aa:bb",
    signature: "0x00",
    signingAddress: "0x3b753b4406613c5e70ae640508632b600424fa0c",
    attestation: { nonce: "cc", checkedAt: "2026-11-02T00:00:00.000Z", intelQuote: "dd" },
  };

  it("keeps each TEE proof in the task's trail and shows the verdict as reviewed privately", async () => {
    const task = await submittedTask();
    const { reviewer } = scripted({ outcome: "ok", reasoning: "fine", proof }, { outcome: "pass", ruleIds: ["R4.1"], reasoning: "sign readable", model: proof.model, proof });
    await runAiReview(desk, reviewer, { readFile: photo });

    const verdict = await desk.getVerdict(requester, task.id);
    expect(verdict).toMatchObject({ outcome: "pass", privateReview: { provider: "near-ai-cloud", model: proof.model, completionId: "chat-1", signingAddress: proof.signingAddress } });
    const [event] = await db.select().from(taskEvents).where(eq(taskEvents.type, "verdict_pass"));
    expect((event!.payload as { proof: typeof proof }).proof).toEqual(proof);

    const screened = await fundedTask();
    await runAiReview(desk, reviewer, { readFile: photo });
    const [screenEvent] = await db.select().from(taskEvents).where(eq(taskEvents.taskId, screened.id)).orderBy(asc(taskEvents.id));
    const ok = (await db.select().from(taskEvents).where(eq(taskEvents.taskId, screened.id))).find((e) => e.type === "screen_ok");
    expect(screenEvent).toBeDefined();
    expect((ok!.payload as { proof: typeof proof }).proof.completionId).toBe("chat-1");
  });

  it("shows no private review for a verdict without a proof", async () => {
    const task = await submittedTask();
    await runAiReview(desk, scripted({ outcome: "ok", reasoning: "fine" }).reviewer, { readFile: photo });
    expect((await desk.getVerdict(requester, task.id))?.privateReview).toBeNull();
  });
});
