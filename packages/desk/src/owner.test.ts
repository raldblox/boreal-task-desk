import { POLICY } from "@boreal/core";
import { adminActions, agents, type Database, eq, fundingApprovals, ledgerEntries, ownerActions, owners, workers } from "@boreal/db";
import { createTestDb } from "@boreal/db/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type Caller, createDesk, type Desk } from "./desk";
import { DeskError } from "./errors";
import { issueAgentKey, verifyAgentKey } from "./keys";

// Owner controls (docs/briefs/owner-controls.md; readiness RS-1, RS-2) and the operator's rail switch.

const HOUR = 60 * 60 * 1000;
let db: Database;
let close: () => Promise<void>;
let clock: Date;
let desk: Desk;
let agent: Caller & { role: "requester" };
let ownerWorker: string;
let strangerWorker: string;
let charges: { taskId: string; amount: number }[];

const input = (overrides: Record<string, unknown> = {}) => ({
  description: "Photograph item X on the shelf at the Manila shop, with its price tag visible.",
  acceptanceCriteria: ["Photo shows item X on a shelf"],
  resultFormat: "text",
  budget: 800,
  deadline: new Date(clock.getTime() + 24 * HOUR).toISOString(),
  ...overrides,
});

async function expectDeskError(promise: Promise<unknown>, code: DeskError["code"]) {
  await expect(promise).rejects.toSatisfy((e: unknown) => e instanceof DeskError && e.code === code);
}

/** A PayPal-like rail: holds at once, and pays from a saved method, recording each charge. */
function vaultRail() {
  return {
    async createPaymentRequest(taskId: string, amount: number) {
      return { scheme: "exact" as const, network: "paypal", asset: "USD", payTo: "boreal.work", amount: String(amount), maxTimeoutSeconds: 60, extra: { resource: taskId, minorUnits: amount, nonce: "n", expiresAt: "2099-01-01T00:00:00Z" } };
    },
    async confirmPayment(taskId: string, payment: unknown) {
      return { txHash: `order-${taskId}`, amount: (payment as { amount: number }).amount };
    },
    async sponsoredTransfer() {
      return { txHash: "payout" };
    },
    async escrowBalance() {
      return 0;
    },
    vault: {
      async pay(taskId: string, amount: number) {
        charges.push({ taskId, amount });
        return { txHash: `vault-${taskId}`, amount, payer: "owner@paypal.test" };
      },
    },
  };
}

afterEach(() => close());

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  clock = new Date("2026-11-02T00:00:00Z");
  charges = [];
  const paypal = vaultRail();
  desk = createDesk({ db, now: () => clock, payments: paypal, rails: { paypal } });
  const [owner] = await db.insert(owners).values({ kind: "individual", verifiedRef: "pp-owner" }).returning();
  const [a] = await db
    .insert(agents)
    .values({ ownerId: owner!.id, registryId: "r-1", name: "hermes", maxTaskBudget: 1_000, maxDailySpend: 5_000, paymentVaultId: "vault-1", spendingMode: "ask" })
    .returning();
  const [w] = await db.insert(workers).values({ pseudonym: "pp-owner", paypalRef: "pp-owner", provenAttributes: {} }).returning();
  const [s] = await db.insert(workers).values({ pseudonym: "pp-stranger", paypalRef: "pp-stranger", provenAttributes: {} }).returning();
  agent = { role: "requester", agentId: a!.id };
  ownerWorker = w!.id;
  strangerWorker = s!.id;
});

describe("ask me each time", () => {
  it("holds nothing from the saved payment method until the owner approves that payment", async () => {
    const { task, quote } = await desk.postTask(agent, input());
    // The agent can't charge the saved method on its own, whatever client it uses.
    await expectDeskError(desk.fundTask(agent, task.id, { vault: true }, { rail: "paypal" }), "forbidden");
    expect(charges).toEqual([]);

    const asked = await desk.requestFundingApproval(agent, [task.id]);
    expect(asked).toMatchObject({ status: "pending", total: quote.total, taskIds: [task.id] });
    // Asking again is the same request, not a second one.
    expect((await desk.requestFundingApproval(agent, [task.id])).id).toBe(asked.id);
    expect((await desk.getTask(agent, task.id)).status).toBe("awaiting_funding");

    // Only the owner sees it or decides it.
    await expectDeskError(desk.ownerFundingApproval(strangerWorker, asked.id), "not_found");
    await expectDeskError(desk.decideFundingApproval(strangerWorker, asked.id, "approve"), "forbidden");
    expect(await desk.ownerFundingApproval(ownerWorker, asked.id)).toMatchObject({ total: quote.total, agent: { name: "hermes" }, tasks: [{ id: task.id }] });

    const decided = await desk.decideFundingApproval(ownerWorker, asked.id, "approve");
    expect(decided).toEqual({ status: "used", funded: [task.id], failed: [] });
    expect(charges).toEqual([{ taskId: task.id, amount: quote.total }]);
    expect((await desk.getTask(agent, task.id)).status).toBe("posted");
    expect(await desk.getFundingApproval(agent, asked.id)).toMatchObject({ status: "used", result: { funded: [task.id] } });

    // Used once: it can't be decided again, and it covers no other task.
    await expectDeskError(desk.decideFundingApproval(ownerWorker, asked.id, "approve"), "conflict");
    const other = await desk.postTask(agent, input());
    await expectDeskError(desk.fundTask(agent, other.task.id, { vault: true }, { rail: "paypal", approvalId: asked.id }), "forbidden");
    expect(charges).toHaveLength(1);
  });

  it("lets the owner decline, and the agent can't ask again for that task", async () => {
    const { task } = await desk.postTask(agent, input());
    const asked = await desk.requestFundingApproval(agent, [task.id]);
    expect(await desk.decideFundingApproval(ownerWorker, asked.id, "decline")).toMatchObject({ status: "declined" });
    expect(charges).toEqual([]);
    await expectDeskError(desk.requestFundingApproval(agent, [task.id]), "forbidden");
    await expectDeskError(desk.fundTask(agent, task.id, { vault: true }, { rail: "paypal", approvalId: asked.id }), "forbidden");
  });

  it("expires a request nobody answered, and a pending one funds nothing", async () => {
    const { task } = await desk.postTask(agent, input());
    const asked = await desk.requestFundingApproval(agent, [task.id]);
    await expectDeskError(desk.fundTask(agent, task.id, { vault: true }, { rail: "paypal", approvalId: asked.id }), "forbidden");
    clock = new Date(clock.getTime() + POLICY.fundingApprovalMs + HOUR);
    expect((await desk.getFundingApproval(agent, asked.id)).status).toBe("expired");
    await expectDeskError(desk.decideFundingApproval(ownerWorker, asked.id, "approve"), "conflict");
    expect(charges).toEqual([]);
  });

  it("approves a batch as one decision, each task still passing its own checks", async () => {
    const a = await desk.postTask(agent, input());
    const b = await desk.postTask(agent, input());
    const asked = await desk.requestFundingApproval(agent, [a.task.id, b.task.id]);
    expect(asked.total).toBe(a.quote.total + b.quote.total);
    // One of them is cancelled before the owner gets to it.
    await desk.cancelTask(agent, b.task.id);
    const decided = await desk.decideFundingApproval(ownerWorker, asked.id, "approve");
    expect(decided.funded).toEqual([a.task.id]);
    expect(decided.failed).toMatchObject([{ taskId: b.task.id }]);
    expect(charges).toEqual([{ taskId: a.task.id, amount: a.quote.total }]);
  });

  it("leaves an agent on auto paying on its own, within its limits", async () => {
    await desk.ownerSetLimits(ownerWorker, agent.agentId, { maxTaskBudget: 1_000, maxDailySpend: 5_000, spendingMode: "auto" });
    const { task } = await desk.postTask(agent, input());
    expect((await desk.fundTask(agent, task.id, { vault: true }, { rail: "paypal" })).status).toBe("posted");
    expect(await desk.getAgentAccount(agent)).toMatchObject({ spendingMode: "auto", paused: false });
  });
});

describe("what an owner can do to their agent", () => {
  it("pauses and resumes it: paused, it reads and cancels but does not post, fund, accept or review", async () => {
    const { task, quote } = await desk.postTask(agent, input({ reviewer: "requester" }));
    await desk.ownerSetPaused(ownerWorker, agent.agentId, true);
    expect((await desk.getAgentAccount(agent)).paused).toBe(true);
    await expectDeskError(desk.postTask(agent, input()), "forbidden");
    await expectDeskError(desk.fundTask(agent, task.id, { confirm: async () => ({ txHash: "o", amount: quote.total }) }, { rail: "paypal" }), "forbidden");
    await expectDeskError(desk.requestFundingApproval(agent, [task.id]), "forbidden");
    await expectDeskError(desk.acceptEarly(agent, task.id), "forbidden");
    await expectDeskError(desk.requesterReview(agent, task.id, { outcome: "pass", ruleIds: [], reasoning: "looks right" }), "forbidden");
    expect((await desk.getTask(agent, task.id)).id).toBe(task.id);
    expect((await desk.cancelTask(agent, task.id)).status).toBe("cancelled");

    await desk.ownerSetPaused(ownerWorker, agent.agentId, false);
    expect((await desk.postTask(agent, input())).task.status).toBe("awaiting_funding");
    await expectDeskError(desk.ownerSetPaused(strangerWorker, agent.agentId, true), "forbidden");
  });

  it("takes the key back", async () => {
    const key = await issueAgentKey(db, agent.agentId);
    expect(await verifyAgentKey(db, key)).toBe(agent.agentId);
    await desk.ownerRevokeKey(ownerWorker, agent.agentId);
    expect(await verifyAgentKey(db, key)).toBeNull();
    await expectDeskError(desk.ownerRevokeKey(strangerWorker, agent.agentId), "forbidden");
  });

  it("changes the limits, in force at the next payment, and disconnects the payment method", async () => {
    const { task } = await desk.postTask(agent, input({ budget: 800 }));
    await expectDeskError(desk.ownerSetLimits(ownerWorker, agent.agentId, { maxTaskBudget: 2_000, maxDailySpend: 1_000, spendingMode: "auto" }), "invalid");
    await desk.ownerSetLimits(ownerWorker, agent.agentId, { maxTaskBudget: 500, maxDailySpend: 5_000, spendingMode: "auto" });
    await expectDeskError(desk.fundTask(agent, task.id, { vault: true }, { rail: "paypal" }), "limit");

    expect(await desk.ownerDisconnectPayment(ownerWorker, agent.agentId)).toEqual({ vaultId: "vault-1" });
    expect((await desk.getAgentAccount(agent)).savedPaymentMethod).toBe(false);
    await expectDeskError(desk.ownerDisconnectPayment(ownerWorker, agent.agentId), "conflict");
    const log = await db.select().from(ownerActions).where(eq(ownerActions.agentId, agent.agentId));
    expect(log.map((l) => l.action)).toEqual(["set_limits", "disconnect_payment"]);
  });

  it("shows the owner what each agent spent, to the cent of the ledger", async () => {
    await desk.ownerSetLimits(ownerWorker, agent.agentId, { maxTaskBudget: 1_000, maxDailySpend: 5_000, spendingMode: "auto" });
    const first = await desk.postTask(agent, input());
    await desk.fundTask(agent, first.task.id, { vault: true }, { rail: "paypal" });
    clock = new Date(clock.getTime() + 3 * 24 * HOUR);
    const second = await desk.postTask(agent, input({ budget: 500 }));
    await desk.fundTask(agent, second.task.id, { vault: true }, { rail: "paypal" });

    const [overview] = await desk.ownerAgentsOverview(ownerWorker);
    const ledger = await db.select().from(ledgerEntries).where(eq(ledgerEntries.fromAccount, "requester"));
    expect(overview).toMatchObject({
      name: "hermes",
      spendingMode: "auto",
      paymentSaved: true,
      spent: { last24h: second.quote.total, last7d: first.quote.total + second.quote.total, total: ledger.reduce((s, e) => s + e.amount, 0) },
    });
    expect(await desk.ownerAgentsOverview(strangerWorker)).toEqual([]);
    const activity = await desk.ownerAgentActivity(ownerWorker, agent.agentId);
    expect(activity.payments.map((p) => p.amount)).toEqual([second.quote.total, first.quote.total]);
  });
});

describe("the operator's rail switch", () => {
  const admin = { ref: "admin-1" };

  it("closes a rail to new money, and opens it again, logged with the reason", async () => {
    await desk.ownerSetLimits(ownerWorker, agent.agentId, { maxTaskBudget: 1_000, maxDailySpend: 5_000, spendingMode: "auto" });
    const { task } = await desk.postTask(agent, input());
    await expectDeskError(desk.adminSetRailClosed(admin, "paypal", true, ""), "invalid");
    await expectDeskError(desk.adminSetRailClosed(admin, "dogecoin", true, "not a rail"), "invalid");
    await desk.adminSetRailClosed(admin, "paypal", true, "PayPal incident, stop new holds");
    expect([...(await desk.closedRails())]).toEqual(["paypal"]);
    await expectDeskError(desk.fundTask(agent, task.id, { vault: true }, { rail: "paypal" }), "unavailable");
    expect(charges).toEqual([]);

    await desk.adminSetRailClosed(admin, "paypal", false, "incident over");
    expect((await desk.fundTask(agent, task.id, { vault: true }, { rail: "paypal" })).status).toBe("posted");
    const log = await db.select().from(adminActions);
    expect(log.map((l) => [l.action, l.target])).toEqual([["close_rail", "rail:paypal"], ["open_rail", "rail:paypal"]]);
  });

  it("still settles tasks already funded on a closed rail", async () => {
    await desk.ownerSetLimits(ownerWorker, agent.agentId, { maxTaskBudget: 1_000, maxDailySpend: 5_000, spendingMode: "auto" });
    const { task } = await desk.postTask(agent, input());
    await desk.fundTask(agent, task.id, { vault: true }, { rail: "paypal" });
    await desk.adminSetRailClosed(admin, "paypal", true, "closing to new money");
    await desk.cancelTask(agent, task.id);
    // The refund is queued and sent as usual.
    expect(await desk.drainOutbox()).toMatchObject({ failed: 0 });
    expect(await db.select().from(fundingApprovals)).toEqual([]);
  });
});
