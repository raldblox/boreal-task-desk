import { POLICY } from "@boreal/core";
import { agents, type Database, eq, ledgerEntries, outbox, owners, tasks, workers } from "@boreal/db";
import { createTestDb } from "@boreal/db/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { BOREAL_REVIEWER } from "./admin";
import { type Caller, createDesk, type Desk } from "./desk";
import { DeskError } from "./errors";

// Regression tests for readiness-sweep findings (docs/readiness.md); each names its finding.

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
let db: Database;
let close: () => Promise<void>;
let clock: Date;
let desk: Desk;
let requester: Caller & { role: "requester" };
let worker: Caller & { role: "worker" };
const reviewer: Caller = { role: "reviewer", reviewerRef: "boreal-ai-reviewer" };
const admin = { ref: "admin-1" };

const advance = (ms: number) => {
  clock = new Date(clock.getTime() + ms);
};

const taskInput = (overrides: Record<string, unknown> = {}) => ({
  description: "Photograph item X on the shelf at the Manila shop, with its price tag visible.",
  acceptanceCriteria: ["Photo shows item X on a shelf", "Price tag is readable"],
  resultFormat: "text",
  budget: 1_000,
  deadline: new Date(clock.getTime() + 24 * HOUR).toISOString(),
  ...overrides,
});

/** A rail that settles at once, names its payer and records what it sends. */
function fakeRail(name: string, payer?: string) {
  const sent: { to: string; amount: number; key: string }[] = [];
  let counter = 0;
  return {
    sent,
    async createPaymentRequest(taskId: string, amount: number) {
      return { scheme: "exact" as const, network: name, asset: "USD", payTo: name, amount: String(amount), maxTimeoutSeconds: 60, extra: { resource: taskId, minorUnits: amount, nonce: "n", expiresAt: "2099-01-01T00:00:00Z" } };
    },
    async confirmPayment(_taskId: string, payment: unknown) {
      return { txHash: `${name}-fund-${++counter}`, amount: (payment as { amount: number }).amount, ...(payer ? { payer } : {}) };
    },
    async sponsoredTransfer(t: { to: string; amount: number; idempotencyKey: string }) {
      sent.push({ to: t.to, amount: t.amount, key: t.idempotencyKey });
      return { txHash: `${name}-pay-${++counter}` };
    },
    async escrowBalance() {
      return 0;
    },
  };
}

async function expectDeskError(promise: Promise<unknown>, code: DeskError["code"]) {
  await expect(promise).rejects.toSatisfy((e: unknown) => e instanceof DeskError && e.code === code);
}

async function openTask(on: Desk = desk, overrides: Record<string, unknown> = {}) {
  const { task, quote } = await on.postTask(requester, taskInput(overrides));
  await on.fundTask(requester, task.id, { txHash: `tx-${task.id}`, amount: quote.total });
  await on.screenTask(reviewer, task.id, { outcome: "ok" });
  return task.id;
}

afterEach(() => close());

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  clock = new Date("2026-11-02T00:00:00Z");
  desk = createDesk({ db, now: () => clock });
  const [owner] = await db.insert(owners).values({ kind: "individual", verifiedRef: "owner-1" }).returning();
  const [agent] = await db
    .insert(agents)
    // Linked the way agents link themselves: no refund address on file.
    .values({ ownerId: owner!.id, registryId: "registry-1", name: "hermes", maxTaskBudget: 5_000, maxDailySpend: 50_000 })
    .returning();
  const [w] = await db
    .insert(workers)
    .values({ pseudonym: "w-1", concordiumRef: "w-1", provenAttributes: {}, nearAccount: "worker.near", paypalEmail: "maria@paypal.test" })
    .returning();
  requester = { role: "requester", agentId: agent!.id };
  worker = { role: "worker", workerId: w!.id };
});

describe("RS-6: refunds on a chain rail go back to the account that paid", () => {
  it("refunds a cancelled task to its payer when the agent has no refund address", async () => {
    const near = fakeRail("near", "hermes-agent.near");
    const railDesk = createDesk({ db, now: () => clock, payments: near, rails: { near } });
    const { task, quote } = await railDesk.postTask(requester, taskInput());
    await railDesk.fundTask(requester, task.id, { confirm: async () => near.confirmPayment(task.id, { amount: quote.total }) }, { rail: "near" });
    await railDesk.screenTask(reviewer, task.id, { outcome: "ok" });
    await railDesk.cancelTask(requester, task.id);

    expect(await railDesk.drainOutbox()).toMatchObject({ sent: 1, failed: 0 });
    expect(near.sent).toEqual([{ to: "hermes-agent.near", amount: quote.total, key: `${task.id}:refund` }]);
    const [refund] = await db.select().from(ledgerEntries).where(eq(ledgerEntries.idempotencyKey, `${task.id}:refund`));
    expect(refund!.status).toBe("settled");
  });
});

describe("RS-7: a task can't outlive its PayPal hold", () => {
  it("refuses a deadline further away than the policy allows", async () => {
    await expectDeskError(desk.postTask(requester, taskInput({ deadline: new Date(clock.getTime() + POLICY.maxDeadlineMs + HOUR).toISOString() })), "invalid");
    const { task } = await desk.postTask(requester, taskInput({ deadline: new Date(clock.getTime() + POLICY.maxDeadlineMs).toISOString() }));
    expect(task.status).toBe("awaiting_funding");
    // The whole life of a task fits inside the 29 days PayPal keeps an authorization.
    expect(POLICY.maxDeadlineMs + POLICY.requesterReviewMs + POLICY.objectionWindowMs + POLICY.disputeDecisionMs).toBeLessThan(29 * DAY);
  });
});

describe("RS-11: a submission its requester never reviews doesn't wait forever", () => {
  async function submittedForRequesterReview() {
    const id = await openTask(desk, { reviewer: "requester" });
    await desk.claimTask(worker, id);
    await desk.submitResult(worker, id, { text: "Item X is on the second shelf, 129 pesos." });
    return id;
  }

  it("hands it to boreal.work's reviewers once the requester's time is up", async () => {
    const id = await submittedForRequesterReview();
    advance(POLICY.requesterReviewMs - HOUR);
    expect(await desk.escalateSilentReviews()).toBe(0);
    expect((await desk.adminReviewQueue()).map((t) => t.id)).not.toContain(id);

    advance(2 * HOUR);
    expect(await desk.escalateSilentReviews()).toBe(1);
    expect(await desk.escalateSilentReviews()).toBe(0);
    const task = await desk.getTask(requester, id);
    expect(task).toMatchObject({ status: "submitted", needsHuman: true });
    expect((await desk.adminReviewQueue()).map((t) => t.id)).toContain(id);

    // An operator decides as boreal.work's reviewer; the worker is paid when the window closes.
    await desk.adminRecordVerdict(admin, id, { outcome: "pass", ruleIds: ["R4.1"], reasoning: "Meets both criteria." }, "requester went silent");
    advance(POLICY.objectionWindowMs + HOUR);
    expect(await desk.closeObjectionWindows()).toBe(1);
    expect((await desk.getTask(requester, id)).status).toBe("final_pass");
  });

  it("leaves a submission the requester reviews in time alone", async () => {
    const id = await submittedForRequesterReview();
    await desk.requesterReview(requester, id, { outcome: "pass", ruleIds: [], reasoning: "Looks right." });
    advance(POLICY.requesterReviewMs + HOUR);
    expect(await desk.escalateSilentReviews()).toBe(0);
  });
});

describe("RS-13: one task that can't move doesn't block the timers for the rest", () => {
  it("expires the other tasks and reports the one that failed", async () => {
    const poisoned = await openTask();
    const healthy = await openTask();
    // A total past the ledger's integer range: its refund can't be written.
    await db.update(tasks).set({ budget: 2_147_483_647 }).where(eq(tasks.id, poisoned));
    advance(25 * HOUR);

    await expect(desk.expireDeadlines()).rejects.toThrow(/1 of 2 tasks/);
    expect((await desk.getTask(requester, healthy)).status).toBe("expired");
    expect((await desk.getTask(requester, poisoned)).status).toBe("open");
  });
});

describe("RS-5: the limits in force when a task is funded are the ones that count", () => {
  it("refuses to fund a task that is over a per-task cap lowered since it was posted", async () => {
    const { task, quote } = await desk.postTask(requester, taskInput({ budget: 900 }));
    await db.update(agents).set({ maxTaskBudget: 500 }).where(eq(agents.id, requester.agentId));
    await expectDeskError(desk.fundTask(requester, task.id, { txHash: "tx-1", amount: quote.total }), "limit");
    expect((await desk.getTask(requester, task.id)).status).toBe("awaiting_funding");
    expect(await db.select().from(ledgerEntries)).toHaveLength(0);

    await db.update(agents).set({ maxTaskBudget: 5_000 }).where(eq(agents.id, requester.agentId));
    expect((await desk.fundTask(requester, task.id, { txHash: "tx-1", amount: quote.total })).status).toBe("posted");
  });

  it("refuses to fund for a requester frozen since it posted", async () => {
    const { task, quote } = await desk.postTask(requester, taskInput());
    await db.update(agents).set({ status: "frozen" }).where(eq(agents.id, requester.agentId));
    await expectDeskError(desk.fundTask(requester, task.id, { txHash: "tx-1", amount: quote.total }), "forbidden");
    expect(await db.select().from(ledgerEntries)).toHaveLength(0);
  });
});

describe("RS-15: files are only stored for a task the worker is doing", () => {
  it("says whether a worker may upload for a task", async () => {
    const id = await openTask();
    await expectDeskError(desk.assertCanSubmit(worker, id), "forbidden");
    await expectDeskError(desk.assertCanSubmit(worker, "../../etc"), "not_found");
    await desk.claimTask(worker, id);
    await desk.assertCanSubmit(worker, id);
    advance(POLICY.claimDurationMs + HOUR);
    await expectDeskError(desk.assertCanSubmit(worker, id), "conflict");
  });
});

describe("RS-12: a payout PayPal sent back can be sent again", () => {
  async function failedPayout() {
    const paypal = fakeRail("paypal");
    const railDesk = createDesk({ db, now: () => clock, payments: paypal, rails: { paypal } });
    const { task, quote } = await railDesk.postTask(requester, taskInput());
    await railDesk.fundTask(requester, task.id, { confirm: async () => paypal.confirmPayment(task.id, { amount: quote.total }) }, { rail: "paypal" });
    await railDesk.screenTask(reviewer, task.id, { outcome: "ok" });
    await railDesk.claimTask(worker, task.id);
    await railDesk.submitResult(worker, task.id, { text: "Item X is on the second shelf, 129 pesos." });
    await railDesk.recordVerdict(BOREAL_REVIEWER, task.id, { outcome: "pass", ruleIds: ["R4.1"], reasoning: "ok" });
    await railDesk.acceptEarly(requester, task.id);
    await railDesk.drainOutbox();
    const key = `${task.id}:pay-worker`;
    expect(paypal.sent.filter((s) => s.key === key)).toHaveLength(1);
    await railDesk.queuePaymentUpdate({ ledgerKey: key, status: "failed", detail: "PAYMENT.PAYOUTS-ITEM.RETURNED" });
    await railDesk.drainOutbox();
    return { railDesk, paypal, key, quote };
  }
  const entry = async (key: string) => (await db.select().from(ledgerEntries).where(eq(ledgerEntries.idempotencyKey, key)))[0]!;

  it("resends under a new PayPal batch id, once, and settles the same ledger entry", async () => {
    const { railDesk, paypal, key, quote } = await failedPayout();
    expect((await entry(key)).status).toBe("failed");

    await railDesk.adminResendPayout(admin, key, "worker fixed their PayPal account");
    expect((await entry(key)).status).toBe("pending");
    // Asking twice doesn't queue two payments.
    await expectDeskError(railDesk.adminResendPayout(admin, key, "worker fixed their PayPal account"), "conflict");
    await railDesk.drainOutbox();

    expect(paypal.sent.filter((s) => s.amount === quote.budget)).toEqual([
      { to: "maria@paypal.test", amount: quote.budget, key },
      { to: "maria@paypal.test", amount: quote.budget, key: `${key}:r1` },
    ]);
    expect((await entry(key)).status).toBe("settled");
  });

  it("applies PayPal's reports on the resend, and ignores late ones about the first attempt", async () => {
    const { railDesk, key } = await failedPayout();
    await railDesk.adminResendPayout(admin, key, "worker fixed their PayPal account");
    await railDesk.drainOutbox();

    // A late report about the attempt that already failed changes nothing.
    await railDesk.queuePaymentUpdate({ ledgerKey: key, status: "failed", detail: "PAYMENT.PAYOUTS-ITEM.RETURNED (late)" });
    expect(await railDesk.drainOutbox()).toMatchObject({ failed: 0 });
    expect((await entry(key)).status).toBe("settled");

    await railDesk.queuePaymentUpdate({ ledgerKey: `${key}:r1`, status: "settled", txHash: "paypal:txn:9", detail: "PAYMENT.PAYOUTS-ITEM.SUCCEEDED" });
    expect(await railDesk.drainOutbox()).toMatchObject({ failed: 0 });
    expect(await entry(key)).toMatchObject({ status: "settled", txHash: "paypal:txn:9" });
  });

  it("only resends a failed payout out of escrow", async () => {
    const { railDesk, key } = await failedPayout();
    await expectDeskError(railDesk.adminResendPayout(admin, key.replace("pay-worker", "fund"), "trying the funding entry"), "conflict");
    await expectDeskError(railDesk.adminResendPayout(admin, "no-such-key", "trying a missing entry"), "not_found");
    const rows = await db.select().from(outbox).where(eq(outbox.kind, "payout"));
    expect(rows.filter((r) => (r.payload as { ledgerKey: string }).ledgerKey === key)).toHaveLength(1);
  });
});
