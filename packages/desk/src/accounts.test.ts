import { POLICY } from "@boreal/core";
import { agents, type Database, eq, fundingApprovals, ledgerEntries, owners, submissions, verificationRequests, workers } from "@boreal/db";
import { createTestDb } from "@boreal/db/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { RETENTION } from "./accounts";
import { type Caller, createDesk, type Desk } from "./desk";
import { DeskError } from "./errors";

// Closing an account on My account, and the retention the privacy policy promises.

const HOUR = 60 * 60 * 1000;
const PP = `pp:${"a".repeat(64)}`;
let db: Database;
let close: () => Promise<void>;
let clock: Date;
let desk: Desk;
let requester: Caller & { role: "requester" };
let ownerId: string;
let ownerWorker: string;
let worker: Caller & { role: "worker" };
const reviewer: Caller = { role: "reviewer", reviewerRef: "boreal-ai-reviewer" };

const advance = (ms: number) => {
  clock = new Date(clock.getTime() + ms);
};

async function expectDeskError(promise: Promise<unknown>, code: DeskError["code"]) {
  await expect(promise).rejects.toSatisfy((e: unknown) => e instanceof DeskError && e.code === code);
}

async function openTask() {
  const { task, quote } = await desk.postTask(requester, {
    description: "Photograph item X on the shelf at the Manila shop, with its price tag visible.",
    acceptanceCriteria: ["Photo shows item X on a shelf"],
    resultFormat: "photo",
    budget: 1_000,
    deadline: new Date(clock.getTime() + 24 * HOUR).toISOString(),
  });
  await desk.fundTask(requester, task.id, { txHash: `tx-${task.id}`, amount: quote.total });
  await desk.screenTask(reviewer, task.id, { outcome: "ok" });
  return task.id;
}

/** A task the worker did, passed and accepted: final, with its payouts sent. */
async function finishedTask() {
  const id = await openTask();
  await desk.claimTask(worker, id);
  await desk.submitResult(worker, id, { fileUrls: [`submissions/${id}/photo.jpg`] });
  await desk.recordVerdict(reviewer, id, { outcome: "pass", ruleIds: [], reasoning: "Shows the item" });
  await desk.acceptEarly(requester, id);
  return id;
}

/** The outbox has sent every payment (no rail runs in these tests). */
async function settleMoney() {
  await db.update(ledgerEntries).set({ status: "settled" });
}

afterEach(() => close());

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  clock = new Date("2026-11-02T00:00:00Z");
  desk = createDesk({ db, now: () => clock });
  const [owner] = await db.insert(owners).values({ kind: "individual", verifiedRef: "pp:owner" }).returning();
  const [agent] = await db
    .insert(agents)
    .values({ ownerId: owner!.id, registryId: "r-1", name: "hermes", maxTaskBudget: 5_000, maxDailySpend: 50_000, apiKeyHash: "h", paymentVaultId: "vault-1" })
    .returning();
  const [o] = await db.insert(workers).values({ pseudonym: "pp:owner", paypalRef: "pp:owner", provenAttributes: {} }).returning();
  const [w] = await db
    .insert(workers)
    .values({ pseudonym: PP, paypalRef: PP, paypalEmail: "worker@paypal.test", paypalVerified: true, nearAccount: "w.near", provenAttributes: { residency: "PH" } })
    .returning();
  requester = { role: "requester", agentId: agent!.id };
  ownerId = owner!.id;
  ownerWorker = o!.id;
  worker = { role: "worker", workerId: w!.id };
});

describe("closing an account", () => {
  it("is refused while a task the worker claimed isn't final, or pay is still on its way", async () => {
    const id = await openTask();
    await desk.claimTask(worker, id);
    expect((await desk.closingCheck(worker.workerId)).blockers).toHaveLength(1);
    await expectDeskError(desk.closeAccount(worker.workerId), "conflict");

    await desk.submitResult(worker, id, { fileUrls: [`submissions/${id}/photo.jpg`] });
    await desk.recordVerdict(reviewer, id, { outcome: "pass", ruleIds: [], reasoning: "Shows the item" });
    await desk.acceptEarly(requester, id);
    // Final, but the payout hasn't been sent yet.
    expect((await desk.closingCheck(worker.workerId)).blockers).toEqual(["Pay is still on its way to you. Wait until it has been sent."]);

    await settleMoney();
    expect((await desk.closingCheck(worker.workerId)).blockers).toEqual([]);
  });

  it("removes every identity, email and payout address, and keeps the record", async () => {
    const id = await finishedTask();
    await settleMoney();
    const ledgerBefore = await db.select().from(ledgerEntries);

    await desk.closeAccount(worker.workerId);

    const [closed] = await db.select().from(workers).where(eq(workers.id, worker.workerId));
    expect(closed).toMatchObject({
      pseudonym: `closed:${worker.workerId}`,
      paypalRef: null,
      paypalEmail: null,
      paypalVerified: false,
      nearAccount: null,
      provenAttributes: {},
    });
    expect(closed!.closedAt).toEqual(clock);
    // The ledger and the task's record are untouched.
    expect(await db.select().from(ledgerEntries)).toEqual(ledgerBefore);
    expect((await desk.getTask(requester, id)).status).toBe("final_pass");

    // A stale session can't act, and can't close twice.
    await expectDeskError(desk.claimTask(worker, await openTask()), "not_found");
    await expectDeskError(desk.closeAccount(worker.workerId), "not_found");

    // Signing in again with the same PayPal account starts a new, empty account.
    const fresh = await desk.signInWithPayPal({ ref: PP, email: "worker@paypal.test", verified: true });
    expect(fresh.id).not.toBe(worker.workerId);
    expect(fresh.pseudonym).toBe(PP);
  });

  it("freezes the owner's agents, forgets their saved PayPal accounts and declines waiting payments", async () => {
    const id = await openTask();
    // A task still open blocks; cancelling it clears the way.
    expect((await desk.closingCheck(ownerWorker)).blockers).toHaveLength(1);
    await desk.cancelTask(requester, id);
    await settleMoney();
    const check = await desk.closingCheck(ownerWorker);
    expect(check).toMatchObject({ blockers: [], agents: 1, savedPayPal: 1 });

    const [approval] = await db
      .insert(fundingApprovals)
      .values({ agentId: requester.agentId, taskIds: [id], total: 1, expiresAt: new Date(clock.getTime() + HOUR) })
      .returning();

    const { vaultIds } = await desk.closeAccount(ownerWorker);
    expect(vaultIds).toEqual(["vault-1"]);
    const [agent] = await db.select().from(agents).where(eq(agents.id, requester.agentId));
    expect(agent).toMatchObject({ status: "frozen", apiKeyHash: null, paymentVaultId: null });
    const [owner] = await db.select().from(owners).where(eq(owners.id, ownerId));
    expect(owner!.verifiedRef).toBe(`closed:${ownerWorker}`);
    const [declined] = await db.select().from(fundingApprovals).where(eq(fundingApprovals.id, approval!.id));
    expect(declined!.status).toBe("declined");

    // The agent can't post, and the closed account can't own a new one.
    await expectDeskError(desk.postTask(requester, { description: "x".repeat(40), acceptanceCriteria: ["a"], resultFormat: "text", budget: 100, deadline: new Date(clock.getTime() + HOUR).toISOString() }), "forbidden");
    await expectDeskError(desk.personalRequester(ownerWorker), "not_found");
  });
});

describe("retention", () => {
  it("deletes a result's files 90 days after its task is final, and old sign-in hashes after 30", async () => {
    const id = await finishedTask();
    await db.insert(verificationRequests).values({ connectionId: "c", request: {}, clientHash: "h", createdAt: clock });
    const deleted: string[] = [];
    const deleteFiles = async (paths: string[]) => {
      deleted.push(...paths);
    };

    advance(RETENTION.resultFilesMs - HOUR);
    expect(await desk.applyRetention(deleteFiles)).toEqual({ results: 0, files: 0, clientHashes: 1 });
    expect(deleted).toEqual([]);

    advance(2 * HOUR);
    expect(await desk.applyRetention(deleteFiles)).toEqual({ results: 1, files: 1, clientHashes: 0 });
    expect(deleted).toEqual([`submissions/${id}/photo.jpg`]);
    const [row] = await db.select().from(submissions).where(eq(submissions.taskId, id));
    expect(row).toMatchObject({ fileUrls: [], filesDeletedAt: clock });

    // Nothing is deleted twice.
    expect(await desk.applyRetention(deleteFiles)).toEqual({ results: 0, files: 0, clientHashes: 0 });
  });

  it("keeps the files of a task that isn't final", async () => {
    const id = await openTask();
    await desk.claimTask(worker, id);
    await desk.submitResult(worker, id, { fileUrls: [`submissions/${id}/photo.jpg`] });
    advance(POLICY.maxDeadlineMs + RETENTION.resultFilesMs);
    const deleted: string[] = [];
    await desk.applyRetention(async (paths) => void deleted.push(...paths));
    expect(deleted).toEqual([]);
  });
});
