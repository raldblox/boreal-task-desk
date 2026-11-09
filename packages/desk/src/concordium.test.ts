import { createDevConcordium, type PayingConcordium, signDevPayment } from "@boreal/concordium";
import { agents, asc, type Database, eq, ledgerEntries, outbox, owners, taskEvents } from "@boreal/db";
import { createTestDb } from "@boreal/db/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type Caller, createDesk, type Desk } from "./desk";
import { DeskError } from "./errors";
import { ledgerEscrowBalance } from "./outbox";

const HOUR = 60 * 60 * 1000;
const secret = "s".repeat(32);
const reviewer: Caller = { role: "reviewer", reviewerRef: "boreal-ai-reviewer" };

let db: Database;
let close: () => Promise<void>;
let clock: Date;
let concordium: PayingConcordium;
let desk: Desk;
let requester: Caller;

async function seedAgent(registryId: string, maxDailySpend = 50_000) {
  const [owner] = await db.insert(owners).values({ kind: "individual", verifiedRef: `owner-${registryId}` }).returning();
  const [agent] = await db
    .insert(agents)
    .values({ ownerId: owner!.id, registryId, name: registryId, maxTaskBudget: 5_000, maxDailySpend, refundAddress: `acct-${registryId}` })
    .returning();
  return agent!;
}

const taskInput = () => ({
  description: "Photograph item X on the shelf at the Manila shop, with its price tag visible.",
  acceptanceCriteria: ["Photo shows item X on a shelf"],
  requiredAttributes: [{ attribute: "residency", value: "PH" }],
  resultFormat: "photo",
  budget: 1_000,
  deadline: new Date(clock.getTime() + 24 * HOUR).toISOString(),
});

/** What an agent's x402 client does: take the 402 requirement, sign it, send it back. */
async function payWith(taskId: string, amount: number) {
  const requirement = await concordium.payments.createPaymentRequest(taskId, amount);
  return { requirement, signature: signDevPayment(secret, requirement) };
}

async function signIn(pseudonym: string, attributes: Record<string, string>) {
  const request = await desk.workerProofRequest([]);
  return desk.signInWorker(request, { pseudonym, attributes }, `acct-${pseudonym}`);
}

async function fundedTask() {
  const { task, quote } = await desk.postTask(requester, taskInput());
  const payment = await payWith(task.id, quote.total);
  await desk.fundTask(requester, task.id, { confirm: () => concordium.payments.confirmPayment(task.id, payment) });
  await desk.screenTask(reviewer, task.id, { outcome: "ok" });
  return task.id;
}

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  clock = new Date("2026-11-02T00:00:00Z");
  concordium = createDevConcordium({ secret, now: () => clock, escrowBalance: () => ledgerEscrowBalance(db) });
  desk = createDesk({
    db,
    now: () => clock,
    concordium,
    addresses: { operating: "acct-boreal", reviewers: { "boreal-ai-reviewer": "acct-reviewer" } },
  });
  requester = { role: "requester", agentId: (await seedAgent("dev-hermes")).id };
});

afterEach(() => close());

describe("registry badge", () => {
  it("refuses tasks from an agent without the badge when the badge is required", async () => {
    const unbadged: Caller = { role: "requester", agentId: (await seedAgent("script-no-badge")).id };
    // Optional during the beta: posting works without a badge.
    await desk.postTask(unbadged, taskInput());
    const strict = createDesk({ db, now: () => clock, concordium, requireBadge: true });
    await expect(strict.postTask(unbadged, taskInput())).rejects.toSatisfy(
      (e: unknown) => e instanceof DeskError && e.code === "forbidden" && /badge/.test(e.message),
    );
  });
});

describe("x402 funding", () => {
  it("opens the task and records the settled payment", async () => {
    const id = await fundedTask();
    const task = await desk.getTask(requester, id);
    expect(task.status).toBe("open");
    expect(task.fundingTxHash).toMatch(/^dev-/);
  });

  it("never takes money when the task's checks fail", async () => {
    const capped: Caller = { role: "requester", agentId: (await seedAgent("dev-capped", 100)).id };
    const { task, quote } = await desk.postTask(capped, taskInput());
    let charged = false;
    await expect(
      desk.fundTask(capped, task.id, {
        confirm: async () => {
          charged = true;
          return { txHash: "x", amount: quote.total };
        },
      }),
    ).rejects.toSatisfy((e: unknown) => e instanceof DeskError && e.code === "limit");
    expect(charged).toBe(false);
  });
});

describe("worker sign-in", () => {
  it("keeps one account per person and refreshes proven attributes", async () => {
    const first = await signIn("ph-1", { residency: "PH" });
    const again = await signIn("ph-1", { residency: "PH", age_over_18: "true" });
    expect(again.id).toBe(first.id);
    expect(again.provenAttributes).toEqual({ residency: "PH", age_over_18: "true" });
  });

  it("rejects a forged proof challenge", async () => {
    const request = await desk.workerProofRequest([]);
    await expect(
      desk.signInWorker({ ...request, challenge: "forged.x" }, { pseudonym: "a", attributes: {} }),
    ).rejects.toSatisfy((e: unknown) => e instanceof DeskError && e.code === "forbidden");
  });
});

describe("outbox", () => {
  async function passedAndFinal() {
    const id = await fundedTask();
    const worker = await signIn("ph-1", { residency: "PH" });
    const caller: Caller = { role: "worker", workerId: worker.id };
    await desk.claimTask(caller, id);
    await desk.submitResult(caller, id, { fileUrls: [`submissions/${id}/photo.jpg`] });
    await desk.recordVerdict(reviewer, id, { outcome: "pass", ruleIds: ["R4.1"], reasoning: "ok" });
    await desk.acceptEarly(requester, id);
    return id;
  }

  it("anchors every event and settles every payout, leaving escrow balanced", async () => {
    const id = await passedAndFinal();
    expect(await desk.drainOutbox(100)).toEqual({ sent: expect.any(Number), failed: 0 });

    const events = await db.select().from(taskEvents).where(eq(taskEvents.taskId, id));
    expect(events.every((e) => e.anchorTxHash?.startsWith("dev-"))).toBe(true);

    const entries = await db.select().from(ledgerEntries).where(eq(ledgerEntries.taskId, id)).orderBy(asc(ledgerEntries.id));
    expect(entries.every((e) => e.status === "settled" && e.txHash)).toBe(true);
    expect(await desk.reconcileEscrow()).toEqual({ expected: 0, actual: 0, gap: 0 });
    expect(await desk.drainOutbox(100)).toEqual({ sent: 0, failed: 0 });
  });

  it("backs off and retries a payout with no address, without blocking the rest", async () => {
    desk = createDesk({ db, now: () => clock, concordium, addresses: { operating: "acct-boreal" } });
    await passedAndFinal();

    const first = await desk.drainOutbox(100);
    expect(first.failed).toBe(1);
    const [stuck] = await db.select().from(outbox).where(eq(outbox.attempts, 1));
    expect(stuck?.lastError).toMatch(/no payout address for reviewer/);
    expect(await desk.drainOutbox(100)).toEqual({ sent: 0, failed: 0 });

    desk = createDesk({
      db,
      now: () => clock,
      concordium,
      addresses: { operating: "acct-boreal", reviewers: { "boreal-ai-reviewer": "acct-reviewer" } },
    });
    clock = new Date(clock.getTime() + 2 * 60 * 1000);
    expect(await desk.drainOutbox(100)).toEqual({ sent: 1, failed: 0 });
  });

  it("refuses to drain without adapters", async () => {
    const off = createDesk({ db, now: () => clock });
    await expect(off.drainOutbox()).rejects.toSatisfy((e: unknown) => e instanceof DeskError && e.code === "unavailable");
  });
});

describe("timers with real money", () => {
  it("refunds an expired funded task through the outbox", async () => {
    const id = await fundedTask();
    clock = new Date(clock.getTime() + 24 * HOUR);
    await desk.expireDeadlines();
    await desk.drainOutbox(100);
    const refund = (await db.select().from(ledgerEntries).where(eq(ledgerEntries.taskId, id))).find(
      (e) => e.toAccount === "requester",
    );
    expect(refund?.status).toBe("settled");
    expect((await desk.reconcileEscrow()).gap).toBe(0);
  });
});
