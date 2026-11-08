import { loadConcordium } from "@boreal/concordium";
import { addonEnv, deskVerification, readAddons } from "@boreal/core";
import { agents, type Database, eq, ledgerEntries } from "@boreal/db";
import { createTestDb } from "@boreal/db/testing";
import { type Caller, createDesk, type Desk, DeskError, ledgerEscrowBalance, type PayPalIdentity } from "@boreal/desk";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createFakePayPal, type FakePayPal } from "./fake-paypal";
import { loadRails } from "./index";
import { createPayPalPayments, type PayPalPayments } from "./payments";

// boreal on PayPal alone (BOREAL_ADDONS=none): no Concordium or NEAR adapters, no add-on
// settings reaching the loaders, and every step still works end to end on PGlite with the
// in-memory PayPal: an owner logs in with PayPal and approves their agent, the agent posts and
// funds (first by approval, which saves the owner's PayPal, then from the Vault), a PayPal
// worker claims and submits, a pass is captured and paid out, a fail is voided.

const HOUR = 60 * 60 * 1000;
const reviewer: Caller = { role: "reviewer", reviewerRef: "boreal-ai-reviewer" };

/** A deployment with PayPal set up, and add-on settings lying around that must not take effect. */
const ENV = {
  BOREAL_ADDONS: "none",
  BOREAL_NETWORK: "testnet",
  PAYPAL_CLIENT_ID: "id",
  PAYPAL_CLIENT_SECRET: "secret",
  BOREAL_PSEUDONYM_SECRET: "p".repeat(32),
  CONCORDIUM_MODE: "dev",
  DEV_CONCORDIUM_SECRET: "d".repeat(32),
  DATABASE_URL: "postgres://localhost/boreal",
  NEAR_TOKEN_CONTRACT: "usdc.testnet",
  NEAR_ESCROW_ACCOUNT: "escrow.testnet",
  NEAR_ESCROW_KEY: "ed25519:x",
  PAYMENT_RAILS: "paypal,concordium,near",
};

const identity = (n: number, verified = true): PayPalIdentity => ({
  ref: `pp:${n.toString(16).padStart(64, "0")}`,
  email: `person${n}@example.com`,
  verified,
});

let db: Database;
let close: () => Promise<void>;
let clock: Date;
let paypal: FakePayPal;
let payments: PayPalPayments;
let desk: Desk;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  clock = new Date("2026-11-08T00:00:00Z");
  paypal = createFakePayPal();
  payments = createPayPalPayments({
    clientId: "id",
    clientSecret: "secret",
    fetch: paypal.fetch,
    now: () => clock,
    returnUrl: "http://localhost:3000/paypal/approved",
    cancelUrl: "http://localhost:3000/paypal/cancelled",
    escrowBalance: () => ledgerEscrowBalance(db, "paypal"),
  });
  desk = createDesk({
    db,
    now: () => clock,
    concordium: null,
    payments,
    rails: { paypal: payments },
    verification: deskVerification(readAddons(ENV)),
    addresses: { paypal: { reviewers: { "boreal-ai-reviewer": "reviews@boreal.example" } } },
  });
});

afterEach(() => close());

/** An owner logs in with PayPal and approves an agent's link request; the agent collects its key. */
async function linkedAgent(owner: PayPalIdentity): Promise<Caller> {
  const person = await desk.signInWithPayPal(owner);
  const { code, pollToken } = await desk.requestAgentLink({ agentName: "Hermes" }, "client");
  await desk.approveAgentLink(person.id, code, { name: "Hermes", maxTaskBudget: 5_000, maxDailySpend: 50_000 });
  const collected = await desk.pollAgentLink(pollToken);
  if (collected.status !== "approved") throw new Error(`link ${collected.status}`);
  return { role: "requester", agentId: collected.agent.id };
}

const taskInput = (overrides: Record<string, unknown> = {}) => ({
  description: "Photograph the opening hours sign at the Malate public library entrance.",
  acceptanceCriteria: ["Photo shows the library entrance", "Opening hours are readable"],
  resultFormat: "photo",
  budget: 3_000,
  deadline: new Date(clock.getTime() + 24 * HOUR).toISOString(),
  ...overrides,
});

async function screened(requester: Caller, overrides: Record<string, unknown> = {}) {
  const { task, quote } = await desk.postTask(requester, taskInput(overrides));
  await desk.screenTask(reviewer, task.id, { outcome: "ok" });
  return { task, quote };
}

describe("the PayPal-only configuration", () => {
  it("keeps every add-on setting away from the loaders, leaving PayPal as the only rail", () => {
    const addons = readAddons(ENV);
    expect(addons.paypalOnly).toBe(true);
    expect([addons.on("concordium"), addons.on("near")]).toEqual([false, false]);
    expect(addons.concordium.parts.every((p) => p.state === "off")).toBe(true);

    const env = addonEnv(ENV);
    expect(env.PAYMENT_RAILS).toBe("paypal");
    expect(Object.keys(env).filter((k) => k.startsWith("NEAR_") || k === "CONCORDIUM_MODE" || k === "DEV_CONCORDIUM_SECRET")).toEqual([]);
    // The PayPal identity secret survives, under the name the ID App also reads.
    expect(env.CONCORDIUM_PSEUDONYM_SECRET).toBe("p".repeat(32));

    expect(loadConcordium(env)).toBeNull();
    const { rails, payments: fallback } = loadRails(env, null, { escrowBalance: async () => 0 });
    expect(Object.keys(rails)).toEqual(["paypal"]);
    expect(fallback).toBe(rails.paypal);
  });

  it("runs a task end to end: PayPal sign-in, link, approval funding, claim, pass, capture and payout", async () => {
    const requester = await linkedAgent(identity(1));
    // The owner's PayPal is verified by PayPal, so the agent gets its owner's full limits.
    const account = await desk.getAgentAccount(requester);
    expect(account).toMatchObject({ verified: true, limits: { maxTaskBudget: 5_000, maxDailySpend: 50_000 } });

    const { task, quote } = await screened(requester);
    const requirement = await payments.createPaymentRequest(task.id, quote.total);
    paypal.approve(requirement.nonce);
    const funded = await desk.fundTask(requester, task.id, { confirm: () => payments.confirmPayment(task.id, { orderId: requirement.nonce }) });
    expect(funded).toMatchObject({ status: "open", paymentRail: "paypal" });
    expect(funded.fundingHold).toMatch(/^AUTH/);
    // Approving saved the owner's PayPal for the agent.
    expect((await db.select().from(agents).where(eq(agents.id, (requester as { agentId: string }).agentId)))[0]!.paymentVaultId).toMatch(/^VAULT/);

    const worker = await desk.signInWithPayPal(identity(2));
    const asWorker: Caller = { role: "worker", workerId: worker.id };
    expect((await desk.browseOpenTasks(asWorker)).map((t) => t.id)).toEqual([task.id]);
    await desk.claimTask(asWorker, task.id);
    await desk.submitResult(asWorker, task.id, { fileUrls: [`submissions/${task.id}/sign.jpg`] });
    await desk.recordVerdict(reviewer, task.id, { outcome: "pass", ruleIds: ["R5.2"], reasoning: "Sign readable" });
    await desk.acceptEarly(requester, task.id);

    await desk.drainOutbox(); // captures the hold
    expect(paypal.authorizations.get(funded.fundingHold!)?.status).toBe("CAPTURED");
    expect(await desk.drainOutbox()).toEqual({ sent: 2, failed: 0 });
    expect(paypal.payouts.map((p) => [p.receiver, p.value])).toEqual([
      ["person2@example.com", "30.00"],
      ["reviews@boreal.example", (quote.reviewFee / 100).toFixed(2)],
    ]);
    const entries = await db.select().from(ledgerEntries).where(eq(ledgerEntries.taskId, task.id));
    expect(entries.every((e) => e.status === "settled")).toBe(true);
    // No anchor could be sent, and nothing failed for want of one.
    expect(await desk.drainOutbox()).toEqual({ sent: 0, failed: 0 });
  });

  it("funds the next task from the saved PayPal account and voids the hold when it fails", async () => {
    const requester = await linkedAgent(identity(1));
    const first = await screened(requester);
    const order = await payments.createPaymentRequest(first.task.id, first.quote.total);
    paypal.approve(order.nonce);
    await desk.fundTask(requester, first.task.id, { confirm: () => payments.confirmPayment(first.task.id, { orderId: order.nonce }) });

    const { task } = await screened(requester);
    const funded = await desk.fundTask(requester, task.id, { vault: true });
    expect(funded.status).toBe("open");

    const worker = await desk.signInWithPayPal(identity(2));
    const asWorker: Caller = { role: "worker", workerId: worker.id };
    await desk.claimTask(asWorker, task.id);
    await desk.submitResult(asWorker, task.id, { fileUrls: [`submissions/${task.id}/sign.jpg`] });
    await desk.recordVerdict(reviewer, task.id, { outcome: "fail", ruleIds: ["R4.2"], reasoning: "Hours unreadable" });
    clock = new Date(clock.getTime() + 49 * HOUR);
    await desk.closeObjectionWindows();
    await desk.drainOutbox();
    await desk.drainOutbox();
    // Only the review fee is taken; the worker is paid nothing.
    expect(paypal.payouts.some((p) => p.receiver === "person2@example.com")).toBe(false);
    expect((await desk.getTask(requester, task.id)).status).toBe("final_fail");
  });

  it("refuses required attributes with a reason, and keeps unverified owners at the caps", async () => {
    const requester = await linkedAgent(identity(1));
    await expect(desk.postTask(requester, taskInput({ requiredAttributes: [{ attribute: "age_over_18" }] }))).rejects.toSatisfy(
      (e: unknown) => e instanceof DeskError && e.code === "invalid" && /Concordium integration/.test(e.message),
    );

    const unverified = await linkedAgent(identity(3, false));
    expect(await desk.getAgentAccount(unverified)).toMatchObject({ verified: false, limits: { maxTaskBudget: 1_000 } });
    await expect(desk.postTask(unverified, taskInput())).rejects.toSatisfy(
      (e: unknown) => e instanceof DeskError && e.code === "limit" && /PayPal/.test(e.message) && !/Concordium/.test(e.message),
    );
    // A person posting for themselves, verified by PayPal, gets the full limits too.
    const person = await desk.signInWithPayPal(identity(4));
    const own = await desk.personalRequester(person.id);
    expect(await desk.getAgentAccount({ role: "requester", agentId: own.id })).toMatchObject({ verified: true });
  });

  it("refuses Concordium ID sign-in plainly, since its adapters aren't loaded", async () => {
    await expect(desk.workerProofRequest([])).rejects.toSatisfy((e: unknown) => e instanceof DeskError && e.code === "unavailable");
  });
});
