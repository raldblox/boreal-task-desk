import { POLICY } from "@boreal/core";
import { agents, type Database, eq } from "@boreal/db";
import { createTestDb } from "@boreal/db/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type Caller, createDesk, type Desk, type PayPalIdentity } from "./desk";
import { DeskError } from "./errors";
import { issueAgentKey } from "./keys";
import { taskTotal } from "./money";

// A person posts on the website through their own requester: a keyless agent row they own.
// Every rule an agent meets applies to them too; only who counts as verified differs.

let db: Database;
let close: () => Promise<void>;
let desk: Desk;
const reviewer: Caller = { role: "reviewer", reviewerRef: "boreal-ai-reviewer" };

const paypal = (n: number): PayPalIdentity => ({ ref: `pp:${n.toString(16).padStart(64, "0")}`, email: `p${n}@personal.example.com`, verified: true });
const concordium = (n: number) => ({ pseudonym: `ccdid:${n.toString(16).padStart(64, "a")}`, provenAttributes: { residency: "PH", age_over_18: "true" } });
const asWorker = (worker: { id: string }): Caller => ({ role: "worker", workerId: worker.id });

const taskInput = (overrides: Record<string, unknown> = {}) => ({
  description: "Photograph the opening hours sign at the Malate public library entrance.",
  acceptanceCriteria: ["Photo shows the library entrance", "Opening hours are readable"],
  resultFormat: "photo",
  budget: 500,
  deadline: new Date(Date.now() + 24 * 3600_000).toISOString(),
  reviewer: "requester",
  ...overrides,
});

async function expectDeskError(promise: Promise<unknown>, code: DeskError["code"], message?: RegExp) {
  await expect(promise).rejects.toSatisfy(
    (e: unknown) => e instanceof DeskError && e.code === code && (!message || message.test(e.message)),
  );
}

/** A signed-in person and the requester their web session acts as. */
async function person(n: number) {
  const worker = await desk.signInWithPayPal(paypal(n));
  const agent = await desk.personalRequester(worker.id);
  return { worker, agent, asRequester: { role: "requester", agentId: agent.id } as Caller };
}

async function postAndFund(caller: Caller, overrides: Record<string, unknown> = {}) {
  const { task } = await desk.postTask(caller, taskInput(overrides));
  await desk.screenTask(reviewer, task.id, { outcome: "ok" });
  await desk.fundTask(caller, task.id, { txHash: `tx-${task.id}`, amount: taskTotal(task) });
  return task.id;
}

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  desk = createDesk({ db });
});

afterEach(() => close());

describe("a person's own requester", () => {
  it("is made once, owned by them, named after their pseudonym, with no key", async () => {
    const worker = await desk.signInWithPayPal(paypal(1));
    expect(await desk.findPersonalRequester(worker.id)).toBeNull();
    const first = await desk.personalRequester(worker.id);
    const again = await desk.personalRequester(worker.id);
    expect(again.id).toBe(first.id);
    expect(first).toMatchObject({ kind: "personal", name: worker.pseudonym, apiKeyHash: null, testMode: false });
    expect((await desk.findPersonalRequester(worker.id))?.id).toBe(first.id);
    expect(await db.select().from(agents).where(eq(agents.kind, "personal"))).toHaveLength(1);
  });

  it("isn't listed among the owner's agents and never gets a key", async () => {
    const { worker, agent } = await person(1);
    expect(await desk.listOwnerAgents(worker.id)).toEqual([]);
    await expectDeskError(desk.ownerAgent(worker.id, agent.id), "forbidden");
    await expect(issueAgentKey(db, agent.id)).rejects.toThrow(/own requester/);

    const { code } = await desk.requestAgentLink({ agentName: "Hermes" }, "client-1");
    await expectDeskError(
      desk.approveAgentLink(worker.id, code, { name: "Hermes", maxTaskBudget: 500, maxDailySpend: 1_000, replaceAgentId: agent.id }),
      "forbidden",
    );
  });

  it("is refused for testers", async () => {
    const tester = await createDesk({ db, testInvite: "invite-code-123" }).signInTestWorker("invite-code-123", "tester-1", {});
    await expectDeskError(desk.personalRequester(tester.id), "forbidden");
  });
});

describe("posting as a person", () => {
  it("goes through screening, escrow and review like an agent's task, and the requester's pass is final", async () => {
    const poster = await person(1);
    const { task, quote } = await desk.postTask(poster.asRequester, taskInput());
    expect(task.status).toBe("posted");
    expect(quote.reviewFee).toBe(0);
    await desk.screenTask(reviewer, task.id, { outcome: "ok" });
    await desk.fundTask(poster.asRequester, task.id, { txHash: "tx-1", amount: taskTotal(task) });

    const worker = await desk.signInWithPayPal(paypal(2));
    await desk.claimTask(asWorker(worker), task.id);
    await desk.submitResult(asWorker(worker), task.id, { fileUrls: [`submissions/${task.id}/sign.jpg`] });
    expect((await desk.getSubmission(poster.asRequester, task.id))?.fileUrls).toHaveLength(1);
    const judged = await desk.requesterReview(poster.asRequester, task.id, { outcome: "pass", ruleIds: [], reasoning: "Hours are readable" });
    expect(judged.status).toBe("final_pass");
    expect((await desk.listTasks(poster.asRequester)).map((t) => t.id)).toEqual([task.id]);
  });

  it("caps an unverified person at $10 a task and $50 a day, and lifts it with Concordium ID", async () => {
    const poster = await person(1);
    await expectDeskError(
      desk.postTask(poster.asRequester, taskInput({ budget: POLICY.unverifiedTaskBudget + 1 })),
      "limit",
      /Concordium ID/,
    );
    let account = await desk.getAgentAccount(poster.asRequester);
    expect(account).toMatchObject({ kind: "personal", limits: { maxTaskBudget: POLICY.unverifiedTaskBudget, maxDailySpend: POLICY.unverifiedDailySpend } });

    // Five $10 tasks with requester review cost $11.20 each: the fifth passes the $50 day.
    for (let i = 0; i < 4; i++) await postAndFund(poster.asRequester, { budget: 1_000 });
    const { task } = await desk.postTask(poster.asRequester, taskInput({ budget: 1_000 }));
    await desk.screenTask(reviewer, task.id, { outcome: "ok" });
    await expectDeskError(desk.fundTask(poster.asRequester, task.id, { txHash: "tx-5", amount: taskTotal(task) }), "limit", /daily/);

    // Adding Concordium ID to their account verifies them: their full limits apply.
    await desk.linkVerifiedConcordium(asWorker(poster.worker), concordium(1));
    account = await desk.getAgentAccount(poster.asRequester);
    expect(account.limits).toEqual({ maxTaskBudget: POLICY.maxTaskBudget, maxDailySpend: POLICY.maxAgentDailySpend });
    await desk.fundTask(poster.asRequester, task.id, { txHash: "tx-5", amount: taskTotal(task) });
    await desk.postTask(poster.asRequester, taskInput({ budget: POLICY.unverifiedTaskBudget + 1 }));
  });

  it("can't be claimed, or seen on the board, by the person who posted it", async () => {
    const poster = await person(1);
    const id = await postAndFund(poster.asRequester);
    expect(await desk.browseOpenTasks(asWorker(poster.worker))).toEqual([]);
    await expectDeskError(desk.claimTask(asWorker(poster.worker), id), "forbidden", /you posted this task/);
    const other = await desk.signInWithPayPal(paypal(2));
    expect((await desk.browseOpenTasks(asWorker(other))).map((t) => t.id)).toEqual([id]);
  });

  it("can't claim their own agent's live task either", async () => {
    const owner = await desk.signInWithPayPal(paypal(1));
    const { code } = await desk.requestAgentLink({ agentName: "Hermes" }, "client-1");
    const { agentId } = await desk.approveAgentLink(owner.id, code, { name: "Hermes", maxTaskBudget: 500, maxDailySpend: 1_000 });
    const id = await postAndFund({ role: "requester", agentId });
    await expectDeskError(desk.claimTask(asWorker(owner), id), "forbidden", /you posted this task/);
  });

  it("cancels before a claim and disputes a verdict once", async () => {
    const poster = await person(1);
    const cancelled = await desk.cancelTask(poster.asRequester, await postAndFund(poster.asRequester));
    expect(cancelled.status).toBe("cancelled");

    const id = await postAndFund(poster.asRequester, { reviewer: "boreal" });
    const worker = await desk.signInWithPayPal(paypal(2));
    await desk.claimTask(asWorker(worker), id);
    await desk.submitResult(asWorker(worker), id, { fileUrls: [`submissions/${id}/sign.jpg`] });
    // boreal reviews this one: the poster can't judge it, only accept or dispute.
    await expectDeskError(desk.requesterReview(poster.asRequester, id, { outcome: "fail", ruleIds: ["R4.1"], reasoning: "Too dark" }), "forbidden");
    await desk.recordVerdict(reviewer, id, { outcome: "fail", ruleIds: ["R4.2"], reasoning: "The hours aren't in the photo" });
    await desk.disputeVerdict(poster.asRequester, id, "The hours are on the second photo.");
    await expectDeskError(desk.disputeVerdict(asWorker(worker), id, "I agree with the requester."), "conflict");
  });
});

describe("who's behind a task, as workers see it", () => {
  it("marks verified agents and verified people, and nothing otherwise", async () => {
    const poster = await person(1);
    const unverifiedPersonTask = await postAndFund(poster.asRequester);
    const owner = await desk.signInWithPayPal(paypal(3));
    const { code } = await desk.requestAgentLink({ agentName: "Hermes" }, "client-1");
    const { agentId } = await desk.approveAgentLink(owner.id, code, {
      name: "Hermes",
      maxTaskBudget: 500,
      maxDailySpend: 1_000,
      badge: { registryId: "badge-1", network: "testnet", ownerAccount: "acct" },
    });
    const agentTask = await postAndFund({ role: "requester", agentId });

    const worker = asWorker(await desk.signInWithPayPal(paypal(2)));
    const kinds = async () => Object.fromEntries((await desk.browseOpenTasks(worker)).map((t) => [t.id, [t.requesterKind, t.agentVerified]]));
    expect(await kinds()).toEqual({ [unverifiedPersonTask]: ["person", false], [agentTask]: ["verified_agent", true] });

    await desk.linkVerifiedConcordium(asWorker(poster.worker), concordium(1));
    expect((await kinds())[unverifiedPersonTask]).toEqual(["verified_person", false]);
    expect((await desk.getTask(worker, unverifiedPersonTask)).requesterKind).toBe("verified_person");
  });
});
