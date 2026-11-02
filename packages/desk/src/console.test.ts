import { createDevConcordium, type PayingConcordium, signDevPayment } from "@boreal/concordium";
import { agents, type Database, eq, ledgerEntries, owners, tasks } from "@boreal/db";
import { createTestDb } from "@boreal/db/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type ConsoleData, findAnomalies, scrub, shortRef } from "./console-views";
import { type Caller, createDesk, type Desk } from "./desk";
import { ledgerEscrowBalance } from "./outbox";

// The money console's read-only views, on PGlite: funnel rows, ledger rows, transfers and
// escrow per rail, and the anomaly agent's checks.

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const secret = "s".repeat(32);
const reviewer: Caller = { role: "reviewer", reviewerRef: "boreal-ai-reviewer" };

let db: Database;
let close: () => Promise<void>;
let clock: Date;
let concordium: PayingConcordium;
let desk: Desk;
let requester: Caller;
let worker: Caller;

const taskInput = () => ({
  description: "Photograph item X on the shelf at the Manila shop, with its price tag visible.",
  acceptanceCriteria: ["Photo shows item X on a shelf"],
  requiredAttributes: [],
  resultFormat: "text",
  budget: 1_000,
  deadline: new Date(clock.getTime() + 24 * HOUR).toISOString(),
});

async function submittedTask() {
  const { task, quote } = await desk.postTask(requester, taskInput());
  await desk.screenTask(reviewer, task.id, { outcome: "ok" });
  const requirement = await concordium.payments.createPaymentRequest(task.id, quote.total);
  const payment = { requirement, signature: signDevPayment(secret, requirement) };
  await desk.fundTask(requester, task.id, { confirm: () => concordium.payments.confirmPayment(task.id, payment) });
  clock = new Date(clock.getTime() + 3 * HOUR);
  await desk.claimTask(worker, task.id);
  await desk.submitResult(worker, task.id, { text: "Item X is on the shelf at 99 pesos." });
  return { id: task.id, quote };
}

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  clock = new Date("2026-11-02T00:00:00Z");
  concordium = createDevConcordium({ secret, now: () => clock, escrowBalance: () => ledgerEscrowBalance(db, "concordium") });
  desk = createDesk({
    db,
    now: () => clock,
    concordium,
    addresses: { operating: "acct-boreal", reviewers: { "boreal-ai-reviewer": "acct-reviewer" } },
  });
  const [owner] = await db.insert(owners).values({ kind: "individual", verifiedRef: "owner-1" }).returning();
  const [agent] = await db
    .insert(agents)
    .values({ ownerId: owner!.id, registryId: "dev-hermes", name: "hermes", maxTaskBudget: 5_000, maxDailySpend: 50_000, refundAddress: "acct-hermes" })
    .returning();
  requester = { role: "requester", agentId: agent!.id };
  const request = await desk.workerProofRequest([]);
  const signedIn = await desk.signInWorker(request, { pseudonym: "ccdid:worker-with-a-long-pseudonym", attributes: {} }, "acct-worker");
  worker = { role: "worker", workerId: signedIn.id };
});

afterEach(() => close());

describe("money console", () => {
  it("shows each task's funnel, its money and the escrow per rail", async () => {
    const paid = await submittedTask();
    await desk.recordVerdict(reviewer, paid.id, { outcome: "pass", ruleIds: ["R5.2"], reasoning: "Shelf visible" });
    clock = new Date(clock.getTime() + HOUR);
    await desk.acceptEarly(requester, paid.id);
    await desk.drainOutbox();
    const held = await submittedTask();
    await desk.postTask(requester, taskInput());

    const data = await desk.adminConsole();
    const row = (id: string) => data.tasks.find((t) => t.id === id)!;
    expect(row(paid.id)).toMatchObject({
      stage: "paid",
      rail: "concordium",
      requesterKind: "agent",
      workerKind: "person",
      worker: shortRef("ccdid:worker-with-a-long-pseudonym"),
      verdict: "pass",
      gmv: paid.quote.total,
      hoursToClaim: 3,
      hoursPassToPayout: 1,
    });
    expect(row(held.id)).toMatchObject({ stage: "submitted", gmv: held.quote.total, paidAt: null });
    expect(data.tasks.filter((t) => t.stage === "posted")).toHaveLength(1);

    const kinds = data.ledger.filter((e) => e.taskId === paid.id).map((e) => [e.kind, e.state]);
    expect(kinds).toEqual([
      ["funding", "received"],
      ["worker payout", "paid"],
      ["review fee", "paid"],
      ["platform fee", "paid"],
    ]);
    expect(data.escrow).toEqual([
      expect.objectContaining({
        rail: "concordium",
        held: 0,
        received: paid.quote.total + held.quote.total,
        paidToWorkers: paid.quote.budget,
        platformFees: paid.quote.platformFee,
        balance: held.quote.total,
      }),
    ]);
    expect(data.transfers.every((t) => t.state === "done")).toBe(true);
    // Nothing behind a pseudonym leaves the desk.
    expect(JSON.stringify(data)).not.toContain("acct-worker");
  });

  it("flags failed payouts, payouts on their way too long, and refund spikes", async () => {
    const paid = await submittedTask();
    await desk.recordVerdict(reviewer, paid.id, { outcome: "pass", ruleIds: ["R5.2"], reasoning: "Shelf visible" });
    await desk.acceptEarly(requester, paid.id);
    await desk.drainOutbox();
    await desk.queuePaymentUpdate({ ledgerKey: `${paid.id}:pay-worker`, status: "failed", detail: "RECEIVER_UNREGISTERED" });
    await desk.drainOutbox();

    // A pass whose payouts are queued but never sent.
    const waiting = await submittedTask();
    await desk.recordVerdict(reviewer, waiting.id, { outcome: "pass", ruleIds: ["R5.2"], reasoning: "Shelf visible" });
    await desk.acceptEarly(requester, waiting.id);
    clock = new Date(clock.getTime() + 3 * HOUR);

    const data = await desk.adminConsole();
    expect(data.ledger.find((e) => e.taskId === paid.id && e.kind === "worker payout")?.state).toBe("failed");
    expect(data.transfers.filter((t) => t.taskId === waiting.id && t.kind === "payout").map((t) => t.state)).toEqual(["stuck", "stuck", "stuck"]);

    const { anomalies, reconciliation } = await desk.adminAnomalies();
    expect(reconciliation).toEqual([{ rail: "concordium", expected: expect.any(Number), actual: expect.any(Number), gap: 0 }]);
    expect(anomalies.map((a) => a.kind)).toEqual(["failed_payouts", "stuck_payouts"]);
    expect(anomalies[0]).toMatchObject({ amount: paid.quote.budget, taskIds: [paid.id] });
    expect(anomalies[1]).toMatchObject({ count: 3, taskIds: [waiting.id] });
  });

  it("reports a refund spike and an escrow gap from the data it is given", () => {
    const at = new Date("2026-11-02T00:00:00Z");
    const refund = (daysAgo: number) => ({ kind: "refund", direction: "out", status: "settled", taskId: `t${daysAgo}`, amount: 500, at: new Date(at.getTime() - daysAgo * DAY) });
    const data = { tasks: [], transfers: [], escrow: [], ledger: [refund(0.1), refund(0.5), refund(1.2), refund(1.5), refund(9)] } as unknown as ConsoleData;
    const anomalies = findAnomalies(data, [{ rail: "paypal", expected: 1_000, actual: 900, gap: -100 }], at);
    expect(anomalies.map((a) => [a.kind, a.severity])).toEqual([
      ["escrow_gap", "critical"],
      ["refund_spike", "warning"],
    ]);
    expect(anomalies[1]).toMatchObject({ count: 4, amount: 2_000 });
    expect(findAnomalies({ ...data, ledger: [refund(0.5), refund(3)] } as unknown as ConsoleData, [], at)).toEqual([]);
  });

  it("splits by requester kind and leaves test tasks out", async () => {
    const { id } = await submittedTask();
    await db.update(agents).set({ kind: "market" }).where(eq(agents.id, (requester as { agentId: string }).agentId));
    const testing = await desk.postTask(requester, taskInput());
    await db.update(tasks).set({ test: true }).where(eq(tasks.id, testing.task.id));
    const data = await desk.adminConsole();
    expect(data.tasks.map((t) => [t.id, t.requesterKind])).toEqual([[id, "NEAR market buyer"]]);
    expect((await db.select().from(ledgerEntries)).length).toBe(data.ledger.length);
  });

  it("scrubs email addresses out of provider errors", () => {
    expect(scrub("Receiver maria@example.com is unregistered")).toBe("Receiver [email] is unregistered");
  });
});
