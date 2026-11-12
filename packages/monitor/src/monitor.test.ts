import type { Reviewer } from "@boreal/brain";
import { agents, type Database, eq, leases, outbox, owners, sql, workers } from "@boreal/db";
import { createTestDb } from "@boreal/db/testing";
import { type Caller, createDesk, type Desk } from "@boreal/desk";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createMonitor, describeTick } from "./index";

let db: Database;
let close: () => Promise<void>;
let clock: Date;
let desk: Desk;
let requester: Caller;
let worker: Caller;

const passAll: Reviewer = {
  screen: async () => ({ outcome: "ok", reasoning: "fine" }),
  review: async () => ({ outcome: "pass", ruleIds: [], reasoning: "ok", model: "claude-opus-5-5" }),
  dispute: async () => ({ outcome: "pass", ruleIds: [], reasoning: "agree", model: "claude-opus-5-5" }),
};

function monitor(reviewer: Reviewer | null = null) {
  return createMonitor({ db, desk, concordium: null, reviewer, readFile: async () => null, now: () => clock });
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
  const [w] = await db.insert(workers).values({ pseudonym: "w", provenAttributes: {} }).returning();
  requester = { role: "requester", agentId: agent!.id };
  worker = { role: "worker", workerId: w!.id };
});

afterEach(() => close());

describe("lease", () => {
  it("lets only one tick run at a time, and frees the lease after", async () => {
    const [a, b] = await Promise.all([monitor().tick(), monitor().tick()]);
    expect([a.ran, b.ran].sort()).toEqual([false, true]);
    expect((await monitor().tick()).ran).toBe(true);
  });

  it("takes over a lease left by a crashed tick once it expires", async () => {
    await db.insert(leases).values({ name: "monitor-tick", holder: "crashed", until: new Date(clock.getTime() + 60_000) });
    expect((await monitor().tick()).ran).toBe(false);
    clock = new Date(clock.getTime() + 61_000);
    expect((await monitor().tick()).ran).toBe(true);
  });
});

describe("tick", () => {
  it("screens with the AI reviewer and expires claims, reporting what it did", async () => {
    const { task } = await desk.postTask(requester, {
      description: "Photograph item X on the shelf at the Manila shop, with its price tag visible.",
      acceptanceCriteria: ["Photo shows item X on a shelf"],
      resultFormat: "photo",
      budget: 500,
      deadline: new Date(clock.getTime() + 48 * 3600_000).toISOString(),
    });
    // Nothing to screen until it's funded.
    expect((await monitor(passAll).tick()).ai).toMatchObject({ screened: 0 });
    await desk.fundTask(requester, task.id, { txHash: "t", amount: task.budget + task.platformFee + task.reviewFee });
    clock = new Date(clock.getTime() + 61_000);
    const report = await monitor(passAll).tick();
    expect(report.ai).toMatchObject({ screened: 1 });
    expect((await desk.getTask(requester, task.id)).status).toBe("open");

    await desk.claimTask(worker, task.id);
    clock = new Date(clock.getTime() + 5 * 3600_000);
    const later = await monitor(passAll).tick();
    expect(later.expiredClaims).toBe(1);
    expect(describeTick(later)).toContain("1 claims expired");
  });

  it("keeps going when a step fails and reports the error", async () => {
    const broken: Reviewer = { ...passAll, screen: async () => { throw new Error("boom"); } };
    const { task } = await desk.postTask(requester, {
      description: "Photograph item X on the shelf at the Manila shop, with its price tag visible.",
      acceptanceCriteria: ["Photo shows item X on a shelf"],
      resultFormat: "photo",
      budget: 500,
      deadline: new Date(clock.getTime() + 48 * 3600_000).toISOString(),
    });
    await desk.fundTask(requester, task.id, { txHash: "t", amount: task.budget + task.platformFee + task.reviewFee });
    const report = await monitor(broken).tick();
    expect(report.ran).toBe(true);
    expect(report.errors).toEqual(["ai-review: boom"]);
  });
});

// RS-9 (docs/readiness.md): what escrow's balance may and may not stop.
describe("escrow and the outbox", () => {
  const input = () => ({
    description: "Photograph item X on the shelf at the Manila shop, with its price tag visible.",
    acceptanceCriteria: ["Photo shows item X on a shelf"],
    resultFormat: "photo",
    budget: 500,
    deadline: new Date(clock.getTime() + 48 * 3600_000).toISOString(),
  });

  /** A rail that settles at once; its escrow balance is whatever the test says the chain holds. */
  function fakeRail(name: "near" | "paypal") {
    const rail = {
      sent: [] as { to: string; amount: number }[],
      balance: 0,
      async createPaymentRequest(taskId: string, amount: number) {
        return { scheme: "exact" as const, network: name, asset: "USD", payTo: name, amount: String(amount), maxTimeoutSeconds: 60, extra: { resource: taskId, minorUnits: amount, nonce: "n", expiresAt: "2099-01-01T00:00:00Z" } };
      },
      async confirmPayment(taskId: string, payment: unknown) {
        return { txHash: `${name}-fund-${taskId}`, amount: (payment as { amount: number }).amount, payer: `payer.${name}` };
      },
      async sponsoredTransfer(t: { to: string; amount: number }) {
        rail.sent.push({ to: t.to, amount: t.amount });
        return { txHash: `${name}-pay-${rail.sent.length}` };
      },
      async escrowBalance() {
        return rail.balance;
      },
    };
    return rail;
  }

  /** Two rails, each with one cancelled task whose refund is waiting in the outbox. */
  async function twoRefunds() {
    const near = fakeRail("near");
    const paypal = fakeRail("paypal");
    const railDesk = createDesk({ db, now: () => clock, payments: paypal, rails: { paypal, near } });
    const totals = { near: 0, paypal: 0 };
    for (const [name, rail] of [["near", near], ["paypal", paypal]] as const) {
      const { task } = await railDesk.postTask(requester, input());
      totals[name] = task.budget + task.platformFee + task.reviewFee;
      await railDesk.fundTask(requester, task.id, { confirm: async () => rail.confirmPayment(task.id, { amount: totals[name] }) }, { rail: name });
      await railDesk.cancelTask(requester, task.id);
      rail.balance = totals[name];
    }
    const tick = () => createMonitor({ db, desk: railDesk, concordium: null, payments: paypal, reviewer: null, readFile: async () => null, now: () => clock }).tick();
    return { near, paypal, totals, tick };
  }

  it("holds only the money of the rail whose escrow is short", async () => {
    const { near, paypal, totals, tick } = await twoRefunds();
    near.balance = totals.near - 100;

    const report = await tick();
    expect(report.pausedRails).toEqual(["near"]);
    expect(report.errors.join()).toContain("near is short of the ledger by 100");
    expect(report.outbox).toMatchObject({ sent: 1, held: 1 });
    expect(paypal.sent).toEqual([{ to: "payer.paypal", amount: totals.paypal }]);
    expect(near.sent).toEqual([]);

    // Once escrow matches again, the held refund goes out on the next pass.
    near.balance = totals.near;
    const next = await tick();
    expect(next.pausedRails).toEqual([]);
    expect(near.sent).toEqual([{ to: "payer.near", amount: totals.near }]);
  });

  it("reports money nobody matched to a task, and keeps paying", async () => {
    const { near, totals, tick } = await twoRefunds();
    near.balance = totals.near + 5;

    const report = await tick();
    expect(report.pausedRails).toEqual([]);
    expect(report.errors.join()).toContain("near holds 5 more than the ledger");
    expect(report.outbox).toMatchObject({ sent: 2, held: 0 });
    expect(near.sent).toEqual([{ to: "payer.near", amount: totals.near }]);
  });

  it("lets a transfer that was sent but not yet recorded finish, instead of pausing on it", async () => {
    const { near, totals, tick } = await twoRefunds();
    // A crash right after sending: the refund left escrow and is journaled, the ledger still says pending.
    near.balance = 0;
    await db.update(outbox).set({ payload: sql`${outbox.payload} || '{"sent":{"txHash":"near-1","expiry":1}}'::jsonb` }).where(eq(outbox.kind, "refund"));

    const report = await tick();
    expect(report.pausedRails).toEqual([]);
    expect(report.outbox).toMatchObject({ sent: 2, held: 0 });
    expect(near.sent).toEqual([{ to: "payer.near", amount: totals.near }]);
  });

  it("holds a rail whose balance can't be read, and says so", async () => {
    const { near, paypal, tick } = await twoRefunds();
    near.escrowBalance = async () => {
      throw new Error("rpc down");
    };
    const report = await tick();
    expect(report.pausedRails).toEqual(["near"]);
    expect(report.errors.join()).toContain("near couldn't be checked");
    expect(paypal.sent).toHaveLength(1);
    expect(near.sent).toEqual([]);
  });
});

// RS-18 (docs/readiness.md): work waiting on boreal.work's own people can't wait unnoticed.
describe("overdue work", () => {
  it("says on every tick when a dispute or the human queue has waited too long", async () => {
    const { task } = await desk.postTask(requester, {
      description: "Photograph item X on the shelf at the Manila shop, with its price tag visible.",
      acceptanceCriteria: ["Photo shows item X on a shelf"],
      resultFormat: "text",
      budget: 500,
      deadline: new Date(clock.getTime() + 48 * 3600_000).toISOString(),
    });
    await desk.fundTask(requester, task.id, { txHash: "t", amount: task.budget + task.platformFee + task.reviewFee });
    const reviewer: Caller = { role: "reviewer", reviewerRef: "boreal-ai-reviewer" };
    await desk.screenTask(reviewer, task.id, { outcome: "ok" });
    await desk.claimTask(worker, task.id);
    await desk.submitResult(worker, task.id, { text: "On the second shelf, 129 pesos." });
    await desk.recordVerdict(reviewer, task.id, { outcome: "fail", ruleIds: ["R4.1"], reasoning: "No price." });
    await desk.disputeVerdict(worker, task.id, "The price is in the second sentence.");

    clock = new Date(clock.getTime() + 71 * 3600_000);
    expect((await monitor().tick()).errors).toEqual([]);
    clock = new Date(clock.getTime() + 2 * 3600_000);
    expect((await monitor().tick()).errors).toEqual(["1 dispute has waited more than 72 hours for a panel decision"]);
    // Still disputed: nothing decides itself.
    expect((await desk.getTask(requester, task.id)).status).toBe("disputed");
  });
});
