import { createDevConcordium } from "@boreal/concordium";
import { agents, asc, type Database, eq, ledgerEntries, outbox, owners, tasks } from "@boreal/db";
import { createTestDb } from "@boreal/db/testing";
import { type Caller, createDesk, type Desk, ledgerEscrowBalance } from "@boreal/desk";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createFakePayPal, type FakePayPal } from "./fake-paypal";
import { createPayPalPayments, type PayPalPayments } from "./payments";
import { payoutUpdateFrom } from "./webhooks";

// The PayPal rail through the desk, on PGlite: agent funds (authorize), worker completes,
// review passes, the desk captures and pays out, and a webhook settles the payout.

const HOUR = 60 * 60 * 1000;
const reviewer: Caller = { role: "reviewer", reviewerRef: "boreal-ai-reviewer" };

let db: Database;
let close: () => Promise<void>;
let clock: Date;
let paypal: FakePayPal;
let payments: PayPalPayments;
let desk: Desk;
let requester: Caller;
let worker: Caller;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  clock = new Date("2026-11-02T00:00:00Z");
  paypal = createFakePayPal();
  payments = createPayPalPayments({
    clientId: "id",
    clientSecret: "secret",
    fetch: paypal.fetch,
    now: () => clock,
    returnUrl: "http://localhost:3000/paypal/approved",
    cancelUrl: "http://localhost:3000/paypal/cancelled",
    escrowBalance: () => ledgerEscrowBalance(db),
  });
  const concordium = createDevConcordium({ secret: "s".repeat(32), now: () => clock });
  // Screening isn't what these tests are about: a funded task opens at once, as on testnet.
  desk = createDesk({
    autoScreen: true,
    db,
    now: () => clock,
    concordium,
    payments,
    addresses: { paypal: { reviewers: { "boreal-ai-reviewer": "reviews@boreal.example" } } },
  });

  const [owner] = await db.insert(owners).values({ kind: "individual", verifiedRef: "owner-hermes" }).returning();
  const [agent] = await db
    .insert(agents)
    .values({ ownerId: owner!.id, registryId: "dev-hermes", name: "Hermes", maxTaskBudget: 5_000, maxDailySpend: 50_000 })
    .returning();
  requester = { role: "requester", agentId: agent!.id };
  const request = await desk.workerProofRequest([]);
  const signedIn = await desk.signInWorker(request, { pseudonym: "ph-maria", attributes: { residency: "PH" } });
  worker = { role: "worker", workerId: signedIn.id };
  await desk.setPayoutAddress(worker, "maria@example.com", "paypal");
});

afterEach(() => close());

/** Posts a task and screens it, ready for funding. */
async function screenedTask() {
  const { task, quote } = await desk.postTask(requester, {
    description: "Photograph item X on the shelf at the Manila shop, with its price tag visible.",
    acceptanceCriteria: ["Photo shows item X on a shelf"],
    requiredAttributes: [{ attribute: "residency", value: "PH" }],
    resultFormat: "photo",
    budget: 1_000,
    deadline: new Date(clock.getTime() + 24 * HOUR).toISOString(),
  });
  return { task, quote };
}

/** Posts and screens a task, then funds it the way an agent does: get the link, owner approves, fund. */
async function fundedTask(options: { approve?: boolean } = {}) {
  const { task, quote } = await screenedTask();
  const requirement = await payments.createPaymentRequest(task.id, quote.total);
  if (options.approve !== false) paypal.approve(requirement.nonce);
  const funded = await desk.fundTask(requester, task.id, {
    confirm: () => payments.confirmPayment(task.id, { orderId: requirement.nonce }),
  });
  return { task: funded, quote };
}

async function submitted(taskId: string) {
  await desk.claimTask(worker, taskId);
  await desk.submitResult(worker, taskId, { fileUrls: [`submissions/${taskId}/shelf.jpg`] });
}

const agentId = () => (requester as { agentId: string }).agentId;
const savedVault = async () => (await db.select().from(agents).where(eq(agents.id, agentId())))[0]!.paymentVaultId;

const ledger = (taskId: string) =>
  db.select().from(ledgerEntries).where(eq(ledgerEntries.taskId, taskId)).orderBy(asc(ledgerEntries.id));

describe("PayPal rail", () => {
  it("holds at funding, captures on pass, pays the worker, and settles the payout from the webhook", async () => {
    const { task, quote } = await fundedTask();
    expect(task.status).toBe("open");
    expect(task.fundingHold).toMatch(/^AUTH/);
    // Held, not taken: the funding entry waits, and escrow holds nothing yet.
    expect((await ledger(task.id))[0]).toMatchObject({ idempotencyKey: `${task.id}:fund`, status: "pending", amount: quote.total });
    expect(await ledgerEscrowBalance(db)).toBe(0);

    await submitted(task.id);
    await desk.recordVerdict(reviewer, task.id, { outcome: "pass", ruleIds: ["R5.2"], reasoning: "Shelf and tag visible" });
    await desk.acceptEarly(requester, task.id);

    // The first drain captures the whole hold, which queues the payouts; the next sends them.
    await desk.drainOutbox();
    expect(paypal.authorizations.get(task.fundingHold!)).toMatchObject({ status: "CAPTURED", captured: toUsd(quote.total) });
    expect(paypal.payouts).toEqual([]);
    expect(await desk.drainOutbox()).toEqual({ sent: 2, failed: 0 });
    expect(paypal.payouts.map((p) => [p.senderBatchId, p.receiver, p.value])).toEqual([
      [`${task.id}:pay-worker`, "maria@example.com", "10.00"],
      [`${task.id}:pay-reviewer`, "reviews@boreal.example", toUsd(quote.reviewFee)],
    ]);
    // A repeated drain sends nothing again.
    expect(await desk.drainOutbox()).toEqual({ sent: 0, failed: 0 });

    const entries = await ledger(task.id);
    expect(entries.every((e) => e.status === "settled")).toBe(true);
    expect(entries.find((e) => e.toAccount === "operating")?.txHash).toMatch(/^paypal:capture:/);
    expect(await ledgerEscrowBalance(db)).toBe(0);

    // PayPal reports the payout went through: the outbox records PayPal's transaction.
    const update = payoutUpdateFrom({
      id: "WH-1",
      event_type: "PAYMENT.PAYOUTS-ITEM.SUCCEEDED",
      resource: { transaction_id: "TXN42", payout_item: { sender_item_id: `${task.id}:pay-worker` } },
    })!;
    await desk.queuePaymentUpdate(update);
    await desk.drainOutbox();
    const [pay] = await db.select().from(ledgerEntries).where(eq(ledgerEntries.idempotencyKey, `${task.id}:pay-worker`));
    expect(pay).toMatchObject({ status: "settled", txHash: "paypal:txn:TXN42" });
  });

  it("keeps the review fee in boreal's PayPal when no reviewer email is set", async () => {
    // boreal reviewing itself: no PayPal payee for its reviewer, so the fee stays put.
    desk = createDesk({ db, now: () => clock, payments, autoScreen: true });
    const { task, quote } = await fundedTask();
    await submitted(task.id);
    await desk.recordVerdict(reviewer, task.id, { outcome: "pass", ruleIds: ["R5.2"], reasoning: "Shelf and tag visible" });
    await desk.acceptEarly(requester, task.id);

    await desk.drainOutbox();
    expect(await desk.drainOutbox()).toEqual({ sent: 1, failed: 0 });
    expect(paypal.payouts.map((p) => p.senderBatchId)).toEqual([`${task.id}:pay-worker`]);
    const fee = (await ledger(task.id)).find((e) => e.toAccount === "reviewer");
    expect(fee).toMatchObject({ status: "settled", amount: quote.reviewFee });
    expect(fee?.txHash).toMatch(/^paypal:capture:/);
    expect(await ledgerEscrowBalance(db)).toBe(0);
  });

  it("settles an already-queued review fee with no payee in boreal's account instead of retrying", async () => {
    const { task, quote } = await fundedTask();
    await submitted(task.id);
    await desk.recordVerdict(reviewer, task.id, { outcome: "pass", ruleIds: ["R5.2"], reasoning: "Fine" });
    await desk.acceptEarly(requester, task.id);
    await desk.drainOutbox(); // capture: queues worker and reviewer payouts (an email was set then)
    // The reviewer email is removed before the payout goes out.
    desk = createDesk({ db, now: () => clock, payments, autoScreen: true });
    expect(await desk.drainOutbox()).toEqual({ sent: 2, failed: 0 });
    expect(paypal.payouts.map((p) => p.senderBatchId)).toEqual([`${task.id}:pay-worker`]);
    expect((await ledger(task.id)).find((e) => e.toAccount === "reviewer")).toMatchObject({
      status: "settled",
      amount: quote.reviewFee,
      txHash: "paypal:kept-by-boreal",
    });
  });

  it("funds several tasks from one approval, holding money separately per task", async () => {
    const tasks = [await screenedTask(), await screenedTask(), await screenedTask()];
    const ids = tasks.map((t) => t.task.id);
    const request = await desk.requestBatchFunding(requester, ids);
    expect(request).toMatchObject({ rail: "paypal", amount: tasks[0]!.quote.total * 3, taskIds: ids });

    // Not approved yet: nothing funds.
    await expect(desk.fundTasks(requester, ids, { orderId: request.orderId })).rejects.toThrow(/isn't approved yet/);
    // An order for other tasks never funds these.
    await expect(desk.fundTasks(requester, ids.slice(0, 2), { orderId: request.orderId })).rejects.toThrow(/different tasks/);

    paypal.approve(request.orderId);
    const { funded, failed } = await desk.fundTasks(requester, ids, { orderId: request.orderId });
    expect(failed).toEqual([]);
    expect(funded.map((t) => t.status)).toEqual(["open", "open", "open"]);
    const holds = funded.map((t) => t.fundingHold!);
    expect(new Set(holds).size).toBe(3);
    expect(holds.every((h) => paypal.authorizations.get(h)?.status === "CREATED")).toBe(true);

    // One passes: only its own hold is captured; the others stay held.
    await submitted(ids[0]!);
    await desk.recordVerdict(reviewer, ids[0]!, { outcome: "pass", ruleIds: ["R5.2"], reasoning: "Shelf and tag visible" });
    await desk.acceptEarly(requester, ids[0]!);
    await desk.drainOutbox();
    expect(paypal.authorizations.get(holds[0]!)?.status).toBe("CAPTURED");
    expect([holds[1], holds[2]].map((h) => paypal.authorizations.get(h!)?.status)).toEqual(["CREATED", "CREATED"]);
  });

  it("refuses a batch that would pass the daily cap, before any PayPal order", async () => {
    const tasks = [await screenedTask(), await screenedTask(), await screenedTask(), await screenedTask(), await screenedTask()];
    const before = paypal.calls.filter((c) => c === "POST /v2/checkout/orders").length;
    await expect(desk.requestBatchFunding(requester, tasks.map((t) => t.task.id))).rejects.toThrow(/daily spending cap/);
    expect(paypal.calls.filter((c) => c === "POST /v2/checkout/orders").length).toBe(before);
  });

  it("captures only the review fee on a fail and lets the rest of the hold go", async () => {
    const { task, quote } = await fundedTask();
    await submitted(task.id);
    await desk.recordVerdict(reviewer, task.id, { outcome: "fail", ruleIds: ["R4.2"], reasoning: "Tag unreadable" });
    clock = new Date(clock.getTime() + 49 * HOUR);
    await desk.closeObjectionWindows();
    await desk.drainOutbox();
    expect(paypal.authorizations.get(task.fundingHold!)).toMatchObject({ status: "PARTIALLY_CAPTURED", captured: toUsd(quote.reviewFee) });
    await desk.drainOutbox();
    expect(paypal.payouts.map((p) => p.senderBatchId)).toEqual([`${task.id}:pay-reviewer`]);
    const refund = (await ledger(task.id)).find((e) => e.toAccount === "requester");
    expect(refund).toMatchObject({ amount: quote.budget + quote.platformFee, status: "settled" });
  });

  it("voids the hold when a funded task is cancelled, and pays no one", async () => {
    const { task } = await fundedTask();
    await desk.cancelTask(requester, task.id);
    await desk.drainOutbox();
    expect(paypal.authorizations.get(task.fundingHold!)?.status).toBe("VOIDED");
    expect(paypal.payouts).toEqual([]);
    expect((await ledger(task.id)).every((e) => e.status === "settled")).toBe(true);
    expect(await ledgerEscrowBalance(db)).toBe(0);
  });

  it("never authorizes when the task's checks fail, and refuses an unapproved order", async () => {
    await db.update(agents).set({ maxDailySpend: 100 }).where(eq(agents.id, (requester as { agentId: string }).agentId));
    await expect(fundedTask()).rejects.toThrow(/daily spending cap/);
    expect(paypal.calls.filter((c) => c.endsWith("/authorize"))).toEqual([]);

    await db.update(agents).set({ maxDailySpend: 50_000 }).where(eq(agents.id, (requester as { agentId: string }).agentId));
    await expect(fundedTask({ approve: false })).rejects.toThrow(/isn't approved/);
    expect(await db.select().from(tasks).where(eq(tasks.status, "open"))).toEqual([]);
  });

  it("puts a returned payout back in escrow", async () => {
    const { task, quote } = await fundedTask();
    await submitted(task.id);
    await desk.recordVerdict(reviewer, task.id, { outcome: "pass", ruleIds: ["R5.2"], reasoning: "Fine" });
    await desk.acceptEarly(requester, task.id);
    await desk.drainOutbox();
    await desk.drainOutbox();
    await desk.queuePaymentUpdate({ ledgerKey: `${task.id}:pay-worker`, status: "failed", detail: "RETURNED" });
    await desk.drainOutbox();
    expect(await ledgerEscrowBalance(db)).toBe(quote.budget);
    expect(await db.select().from(outbox).where(eq(outbox.kind, "reconcile"))).toHaveLength(1);
  });
});

describe("PayPal vaulting", () => {
  it("saves the owner's PayPal account on the first approval, then funds with no approval page", async () => {
    const first = await fundedTask();
    const vaultId = await savedVault();
    expect(vaultId).toMatch(/^VAULT/);
    expect(paypal.orders.get(first.task.fundingTxHash!.replace("paypal:order:", ""))?.storeInVault).toBe(true);

    const { task, quote } = await screenedTask();
    const before = paypal.calls.length;
    const funded = await desk.fundTask(requester, task.id, { vault: true });
    expect(funded.status).toBe("open");
    // One order paid from the vault, authorized on the spot: nobody was asked to approve.
    expect(paypal.calls.slice(before).filter((c) => c !== "POST /v1/oauth2/token")).toEqual(["POST /v2/checkout/orders"]);
    expect(paypal.authorizations.get(funded.fundingHold!)).toMatchObject({ status: "CREATED", amount: { value: toUsd(quote.total) } });
    expect((await ledger(task.id))[0]).toMatchObject({ status: "pending", amount: quote.total });

    // The hold settles like any other.
    await submitted(task.id);
    await desk.recordVerdict(reviewer, task.id, { outcome: "pass", ruleIds: ["R5.2"], reasoning: "Fine" });
    await desk.acceptEarly(requester, task.id);
    await desk.drainOutbox();
    expect(paypal.authorizations.get(funded.fundingHold!)?.status).toBe("CAPTURED");
    expect(await savedVault()).toBe(vaultId);
  });

  it("funds several tasks from the saved account in one call, one held order each", async () => {
    await fundedTask();
    const ids = [(await screenedTask()).task.id, (await screenedTask()).task.id];
    const before = paypal.calls.length;
    const { funded, failed } = await desk.fundTasksSaved(requester, ids);
    expect(failed).toEqual([]);
    expect(funded.map((t) => t.status)).toEqual(["open", "open"]);
    expect(new Set(funded.map((t) => t.fundingHold)).size).toBe(2);
    expect(paypal.calls.slice(before).filter((c) => c === "POST /v2/checkout/orders")).toHaveLength(2);
  });

  it("authorizes a vaulted order that PayPal returns approved but not yet authorized", async () => {
    await fundedTask();
    paypal.vaultAuthorizesOnCreate = false;
    const { task } = await screenedTask();
    const funded = await desk.fundTask(requester, task.id, { vault: true });
    expect(funded.status).toBe("open");
    expect(paypal.calls.at(-1)).toMatch(/^POST \/v2\/checkout\/orders\/ORDER\d+\/authorize$/);
  });

  it("checks the agent's limits before paying from the vault", async () => {
    await fundedTask();
    await db.update(agents).set({ maxDailySpend: 2_000 }).where(eq(agents.id, agentId()));
    const { task } = await screenedTask();
    const orders = paypal.orders.size;
    await expect(desk.fundTask(requester, task.id, { vault: true })).rejects.toThrow(/daily spending cap/);
    expect(paypal.orders.size).toBe(orders);
    expect((await desk.getTask(requester, task.id)).status).toBe("awaiting_funding");
  });

  it("refuses a revoked vault without opening the task, and needs a vault to use one", async () => {
    const { task: first } = await screenedTask();
    await expect(desk.fundTask(requester, first.id, { vault: true })).rejects.toThrow(/hasn't saved a payment method/);

    await fundedTask();
    paypal.revokeVault((await savedVault())!);
    const { task } = await screenedTask();
    await expect(desk.fundTask(requester, task.id, { vault: true })).rejects.toThrow(/saved payment method was refused/);
    expect((await desk.getTask(requester, task.id)).status).toBe("awaiting_funding");
    expect(await ledger(task.id)).toEqual([]);
  });

  it("saves nothing when vaulting is off", async () => {
    payments = createPayPalPayments({
      clientId: "id",
      clientSecret: "secret",
      fetch: paypal.fetch,
      now: () => clock,
      returnUrl: "http://localhost:3000/paypal/approved",
      cancelUrl: "http://localhost:3000/paypal/cancelled",
      escrowBalance: () => ledgerEscrowBalance(db),
      vault: false,
    });
    expect(payments.vault).toBeUndefined();
    await fundedTask();
    expect(await savedVault()).toBeNull();
    expect(paypal.vaults.size).toBe(0);
  });
});

function toUsd(cents: number): string {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}
