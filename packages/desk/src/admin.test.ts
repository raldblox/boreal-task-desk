import { quoteFees } from "@boreal/core";
import { adminActions, agents, type Database, eq, outbox, owners, workers } from "@boreal/db";
import { createTestDb } from "@boreal/db/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Admin } from "./admin";
import { type Caller, createDesk, type Desk } from "./desk";
import { DeskError } from "./errors";

const HOUR = 60 * 60 * 1000;
let db: Database;
let close: () => Promise<void>;
let clock: Date;
let desk: Desk;
let requester: Caller;
let worker: Caller;
let agentId: string;
const admin: Admin = { ref: "ccdid:admin-1" };

const taskInput = (overrides: Record<string, unknown> = {}) => ({
  description: "Photograph item X on the shelf at the Manila shop, with its price tag visible.",
  acceptanceCriteria: ["Photo shows item X on a shelf", "Price tag is readable"],
  requiredAttributes: [],
  resultFormat: "text",
  budget: 1_000,
  deadline: new Date(clock.getTime() + 24 * HOUR).toISOString(),
  ...overrides,
});

async function expectDeskError(promise: Promise<unknown>, code: DeskError["code"]) {
  await expect(promise).rejects.toSatisfy((e: unknown) => e instanceof DeskError && e.code === code);
}

/** Posted and funded: waiting for screening, the first thing in the admin queue. */
async function posted() {
  const id = (await desk.postTask(requester, taskInput())).task.id;
  await desk.fundTask(requester, id, { txHash: `tx-${id}`, amount: quoteFees(1_000).total });
  return id;
}

async function submitted() {
  const id = await posted();
  await desk.adminScreenTask(admin, id, { outcome: "ok" }, "Clear, lawful task");
  await desk.claimTask(worker, id);
  await desk.submitResult(worker, id, { text: "Item X is on the shelf at 99 pesos." });
  return id;
}

afterEach(() => close());

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  clock = new Date("2026-11-02T00:00:00Z");
  desk = createDesk({ db, now: () => clock });
  const [owner] = await db.insert(owners).values({ kind: "individual", verifiedRef: "owner-1" }).returning();
  const [agent] = await db
    .insert(agents)
    .values({ ownerId: owner!.id, registryId: "registry-1", name: "hermes", maxTaskBudget: 5_000, maxDailySpend: 50_000, paymentVaultId: "vault-1" })
    .returning();
  agentId = agent!.id;
  requester = { role: "requester", agentId };
  const [w] = await db
    .insert(workers)
    .values({ pseudonym: "ccdid:worker-1", concordiumRef: "ccdid:worker-1", provenAttributes: { residency: "PH" }, paypalEmail: "w@example.com", payoutAddress: "acct-w" })
    .returning();
  worker = { role: "worker", workerId: w!.id };
});

describe("admin gate", () => {
  it("admits only allowlisted workers who signed in with Concordium ID", async () => {
    const workerId = (worker as { workerId: string }).workerId;
    expect(await desk.adminFor(workerId, undefined)).toBeNull();
    expect(await desk.adminFor(workerId, "")).toBeNull();
    expect(await desk.adminFor(workerId, "ccdid:someone-else")).toBeNull();
    expect(await desk.adminFor(workerId, "ccdid:someone-else, ccdid:worker-1")).toEqual({ ref: "ccdid:worker-1" });
    expect(await desk.adminFor(crypto.randomUUID(), "ccdid:worker-1")).toBeNull();
    expect(await desk.adminFor("not-a-worker-id", "ccdid:worker-1")).toBeNull();
    // A prefix or a near match is not the pseudonym.
    expect(await desk.adminFor(workerId, "ccdid:worker")).toBeNull();

    const [tester] = await db
      .insert(workers)
      .values({ pseudonym: "test:ops", provenAttributes: {}, testMode: true })
      .returning();
    expect(await desk.adminFor(tester!.id, "test:ops")).toBeNull();
  });
});

describe("admin review", () => {
  it("screens, judges and decides disputes through the desk, logging each with its reason", async () => {
    const id = await posted();
    expect((await desk.adminReviewQueue()).map((t) => t.id)).toEqual([id]);

    await desk.adminScreenTask(admin, id, { outcome: "ok" }, "Clear, lawful task");
    await desk.claimTask(worker, id);
    await desk.submitResult(worker, id, { text: "done" });
    expect((await desk.adminReviewQueue()).map((t) => t.status)).toEqual(["submitted"]);

    await desk.adminRecordVerdict(admin, id, { outcome: "fail", ruleIds: ["R4.1"], reasoning: "No price" }, "Price tag missing");
    await desk.disputeVerdict(worker, id, "The price is in my text answer.");
    expect((await desk.adminReviewQueue()).map((t) => t.status)).toEqual(["disputed"]);
    const task = await desk.adminDecideDispute(admin, id, { outcome: "pass", ruleIds: [], reasoning: "Price is given" }, "Text names the price");
    expect(task.status).toBe("final_pass");

    const log = await desk.adminAudit();
    expect(log.map((a) => [a.action, a.outcome, a.adminRef])).toEqual([
      ["panel_pass", "ok", admin.ref],
      ["verdict_fail", "ok", admin.ref],
      ["screen_ok", "ok", admin.ref],
    ]);
    // The trail shows boreal's reviewer, not the operator.
    const detail = await desk.adminTask(id);
    expect(detail.trail.find((e) => e.type === "screen_ok")?.actor).toBe("reviewer");
    expect(detail.task.reviewerRef).toBe("boreal-ai-reviewer");
    expect(detail.audit).toHaveLength(3);
  });

  it("requires a reason and logs refusals from the state machine", async () => {
    const id = await posted();
    await expectDeskError(desk.adminScreenTask(admin, id, { outcome: "ok" }, " no "), "invalid");
    expect(await desk.adminAudit()).toHaveLength(0);

    await expectDeskError(
      desk.adminRecordVerdict(admin, id, { outcome: "pass", ruleIds: [], reasoning: "ok" }, "Looks good to me"),
      "conflict",
    );
    const [entry] = await desk.adminAudit();
    expect(entry?.outcome).toMatch(/^refused: /);
  });
});

describe("admin controls", () => {
  it("freezes and unfreezes an agent, logged in the same transaction", async () => {
    await desk.adminSetAgentStatus(admin, agentId, "frozen", "Spam tasks");
    await expectDeskError(desk.postTask(requester, taskInput()), "forbidden");
    await expectDeskError(desk.adminSetAgentStatus(admin, agentId, "frozen", "Again please"), "conflict");
    await desk.adminSetAgentStatus(admin, agentId, "active", "Owner fixed it");
    await posted();
    expect((await desk.adminAudit()).map((a) => [a.action, a.target])).toEqual([
      ["unfreeze_agent", `agent:${agentId}`],
      ["freeze_agent", `agent:${agentId}`],
    ]);
  });

  it("retries only failing outbox rows, making them due now", async () => {
    const [waiting] = await db.insert(outbox).values({ kind: "anchor", payload: {}, nextAttemptAt: new Date(clock.getTime() + HOUR) }).returning();
    await expectDeskError(desk.adminRetryOutbox(admin, waiting!.id, "Try it now"), "conflict");

    await db.update(outbox).set({ attempts: 3, lastError: "PayPal said no" }).where(eq(outbox.id, waiting!.id));
    const retried = await desk.adminRetryOutbox(admin, waiting!.id, "PayPal is back up");
    expect(retried.nextAttemptAt).toEqual(clock);
    const [row] = await db.select().from(outbox).where(eq(outbox.id, waiting!.id));
    expect(row?.nextAttemptAt).toEqual(clock);
    expect(row?.attempts).toBe(3);

    await db.update(outbox).set({ doneAt: clock }).where(eq(outbox.id, waiting!.id));
    await expectDeskError(desk.adminRetryOutbox(admin, waiting!.id, "Once more"), "conflict");
    expect(await db.select().from(adminActions)).toHaveLength(1);
  });
});

describe("admin views", () => {
  it("counts tasks, queues, money and the outbox", async () => {
    const id = await submitted();
    await posted();
    await desk.adminRecordVerdict(admin, id, { outcome: "pass", ruleIds: [], reasoning: "ok" }, "Answer is right");
    await desk.acceptEarly(requester, id);

    const overview = await desk.adminOverview();
    expect(overview.byStatus.map((s) => [s.status, s.test, s.n]).sort()).toEqual([
      ["final_pass", false, 1],
      ["posted", false, 1],
    ]);
    expect(overview.queue).toMatchObject({ screen: 1, review: 0, human: 0, disputed: 0 });
    const quote = quoteFees(1_000);
    // Both are funded: the one still in screening holds its money too.
    expect(overview.windows[0]).toMatchObject({ days: 1, posted: { live: 2, test: 0 }, funded: { n: 2, amount: 2 * quote.total } });
    // Payouts are queued, not yet sent.
    expect(overview.windows[0]!.paid.amount).toBe(0);
    expect(overview.outbox.find((o) => o.kind === "payout")?.n).toBe(3);

    const money = await desk.adminMoney();
    const sum = (to: string) => money.totals.filter((t) => t.from === "escrow" && t.to === to).reduce((s, t) => s + t.amount, 0);
    expect(sum("operating")).toBe(quote.platformFee);
    expect(sum("worker")).toBe(quote.budget);
    expect(money.unsettled).toHaveLength(3);
    expect(money.recent[0]?.taskId).toBe(id);
  });

  it("searches tasks and shows one task's detail with its money", async () => {
    const id = await submitted();
    await desk.postTask(requester, taskInput({ description: "Count the jeepneys passing the corner of Taft and Vito Cruz." }));
    expect((await desk.adminTasks({ q: "jeepneys" })).map((r) => r.agentName)).toEqual(["hermes"]);
    expect((await desk.adminTasks({ q: id.slice(0, 8) })).map((r) => r.task.id)).toEqual([id]);
    expect(await desk.adminTasks({ status: "submitted" })).toHaveLength(1);
    expect(await desk.adminTasks({ test: true })).toHaveLength(0);

    const detail = await desk.adminTask(id);
    expect(detail.submission?.text).toContain("99 pesos");
    expect(detail.worker).toEqual({ pseudonym: "ccdid:worker-1", provenAttributes: { residency: "PH" }, testMode: false });
    expect(detail.money.state).toBe("held");
    expect(detail.trail.map((e) => e.type)).toEqual(["posted", "fund", "screen_ok", "claim", "submit"]);
    await expectDeskError(desk.adminTask("not-a-task"), "not_found");
  });

  it("lists agents and workers without anything personal", async () => {
    await submitted();
    const [agent] = await desk.adminAgents();
    expect(agent).toMatchObject({ name: "hermes", paypalConnected: true, tasks: 1, spent: quoteFees(1_000).total });

    const [w] = await desk.adminWorkers();
    expect(w).toMatchObject({ pseudonym: "ccdid:worker-1", paypalSet: true, concordiumSet: true, claimed: 1 });
    const text = JSON.stringify(w);
    expect(text).not.toContain("w@example.com");
    expect(text).not.toContain("acct-w");
  });

  it("charts posting, funding and verdicts per day, with pass rate and times", async () => {
    const id = await posted();
    await desk.adminScreenTask(admin, id, { outcome: "ok" }, "Clear, lawful task");
    clock = new Date(clock.getTime() + 2 * HOUR);
    await desk.claimTask(worker, id);
    await desk.submitResult(worker, id, { text: "done" });
    await desk.adminRecordVerdict(admin, id, { outcome: "pass", ruleIds: [], reasoning: "ok" }, "Answer is right");

    const stats = await desk.adminAnalytics({ days: 7 });
    expect(stats.days).toHaveLength(7);
    const today = stats.days.at(-1)!;
    expect(today).toMatchObject({ posted: 1, funded: quoteFees(1_000).total, passes: 1, fails: 0 });
    expect(stats.passRate).toBe(1);
    expect(stats.medianMsToClaim).toBe(2 * HOUR);
    expect(stats.medianMsToPay).toBeNull();
  });
});
