import { createDevConcordium } from "@boreal/concordium";
import { agents, type Database, eq, owners, workers } from "@boreal/db";
import { createTestDb } from "@boreal/db/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type Caller, createDesk, type Desk, type PayPalIdentity } from "./desk";
import { DeskError } from "./errors";
import { taskTotal } from "./money";

// Workers sign in with PayPal and/or Concordium ID. Each identity belongs to one worker,
// Concordium ID is the badge that proves attributes, and nothing is ever merged.

let db: Database;
let close: () => Promise<void>;
let desk: Desk;
let requester: Caller;
const reviewer: Caller = { role: "reviewer", reviewerRef: "boreal-ai-reviewer" };

const ref = (n: number) => `pp:${n.toString(16).padStart(64, "0")}`;
const paypal = (n: number, verified = true): PayPalIdentity => ({ ref: ref(n), email: `w${n}@personal.example.com`, verified });
const concordium = (n: number, residency = "PH") => ({
  pseudonym: `ccdid:${n.toString(16).padStart(64, "a")}`,
  provenAttributes: { residency, age_over_18: "true" },
});
const asWorker = (worker: { id: string }): Caller => ({ role: "worker", workerId: worker.id });

async function expectDeskError(promise: Promise<unknown>, code: DeskError["code"], message?: RegExp) {
  await expect(promise).rejects.toSatisfy(
    (e: unknown) => e instanceof DeskError && e.code === code && (!message || message.test(e.message)),
  );
}

async function openTask(requiredAttributes: { attribute: string; value?: string }[]) {
  const { task } = await desk.postTask(requester, {
    description: "Photograph the jeepney stop at Taft Avenue corner Vito Cruz, showing the route sign.",
    acceptanceCriteria: ["Photo shows the jeepney stop", "Route sign is readable"],
    requiredAttributes,
    resultFormat: "photo",
    budget: 500,
    deadline: new Date(Date.now() + 24 * 3600_000).toISOString(),
  });
  await desk.screenTask(reviewer, task.id, { outcome: "ok" });
  await desk.fundTask(requester, task.id, { txHash: `tx-${task.id}`, amount: taskTotal(task) });
  return task.id;
}

// No payment rail, so tasks fund with test-style payments and claims need no payout account.
function useDesk(options: { requireVerifiedPayPal?: boolean; devWallet?: boolean } = {}) {
  const { devWallet, ...rest } = options;
  desk = createDesk({ db, ...(devWallet ? { concordium: createDevConcordium({ secret: "d".repeat(32) }) } : {}), ...rest });
}

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  useDesk();
  const [owner] = await db.insert(owners).values({ kind: "individual", verifiedRef: "owner-1" }).returning();
  const [agent] = await db
    .insert(agents)
    .values({ ownerId: owner!.id, registryId: "registry-1", name: "Hermes", maxTaskBudget: 5_000, maxDailySpend: 50_000 })
    .returning();
  requester = { role: "requester", agentId: agent!.id };
});

afterEach(() => close());

describe("signing in", () => {
  it("signs in with PayPal: one worker per account, payout set in the same step", async () => {
    const first = await desk.signInWithPayPal(paypal(1, false));
    expect(first).toMatchObject({
      pseudonym: ref(1),
      paypalRef: ref(1),
      paypalEmail: "w1@personal.example.com",
      paypalVerified: false,
      concordiumRef: null,
      provenAttributes: {},
    });
    const again = await desk.signInWithPayPal({ ...paypal(1), email: "new@personal.example.com" });
    expect(again.id).toBe(first.id);
    expect(again).toMatchObject({ paypalEmail: "new@personal.example.com", paypalVerified: true });
    expect(await desk.getWorker(asWorker(first))).toMatchObject({ hasPayPal: true, paypalVerified: true, hasConcordium: false });
  });

  it("refuses a PayPal identity that isn't a keyed hash", async () => {
    await expectDeskError(desk.signInWithPayPal({ ref: "PAYERID123", email: "w@example.com", verified: true }), "invalid");
  });

  it("signs in with either identity once both are on one account", async () => {
    const worker = await desk.signInWithPayPal(paypal(1));
    await desk.linkVerifiedConcordium(asWorker(worker), concordium(1));
    expect((await desk.signInVerifiedWorker(concordium(1))).id).toBe(worker.id);
    expect((await desk.signInWithPayPal(paypal(1))).id).toBe(worker.id);
    // The worker's ID never changes: it is still the PayPal hash they started with.
    const [row] = await db.select().from(workers).where(eq(workers.id, worker.id));
    expect(row!.pseudonym).toBe(ref(1));
  });
});

describe("linking identities", () => {
  it("adds Concordium ID to a PayPal worker: the badge and proven attributes", async () => {
    useDesk({ devWallet: true });
    const worker = asWorker(await desk.signInWithPayPal(paypal(1)));
    const request = await desk.workerProofRequest([]);
    await desk.linkConcordium(worker, request, { pseudonym: "ph-maria", attributes: { residency: "PH" } });
    expect(await desk.getWorker(worker)).toMatchObject({ hasConcordium: true, hasPayPal: true, provenAttributes: { residency: "PH" } });
  });

  it("adds PayPal to a Concordium worker, with the payout email", async () => {
    const worker = asWorker(await desk.signInVerifiedWorker(concordium(1)));
    await desk.linkPayPal(worker, paypal(1));
    expect(await desk.getWorker(worker)).toMatchObject({ hasPayPal: true, paypalVerified: true, paypalEmail: "w1@personal.example.com" });
    // Logging in again with the same PayPal account refreshes it.
    await desk.linkPayPal(worker, { ...paypal(1, false), email: "again@personal.example.com" });
    expect(await desk.getWorker(worker)).toMatchObject({ paypalVerified: false, paypalEmail: "again@personal.example.com" });
  });

  it("refuses a PayPal account that already belongs to another worker, and merges nothing", async () => {
    const paypalWorker = await desk.signInWithPayPal(paypal(1));
    const ccdWorker = asWorker(await desk.signInVerifiedWorker(concordium(1)));
    await expectDeskError(desk.linkPayPal(ccdWorker, paypal(1)), "conflict", /another boreal account/);
    expect(await desk.getWorker(ccdWorker)).toMatchObject({ hasPayPal: false, paypalEmail: null });
    expect((await desk.signInWithPayPal(paypal(1))).id).toBe(paypalWorker.id);
  });

  it("refuses a Concordium ID that already belongs to another worker", async () => {
    await desk.signInVerifiedWorker(concordium(1));
    const paypalWorker = asWorker(await desk.signInWithPayPal(paypal(1)));
    await expectDeskError(desk.linkVerifiedConcordium(paypalWorker, concordium(1)), "conflict", /another boreal account/);
    expect(await desk.getWorker(paypalWorker)).toMatchObject({ hasConcordium: false, provenAttributes: {} });
  });

  it("refuses swapping in a different identity of the same kind", async () => {
    const worker = asWorker(await desk.signInWithPayPal(paypal(1)));
    await desk.linkVerifiedConcordium(worker, concordium(1));
    await expectDeskError(desk.linkPayPal(worker, paypal(2)), "conflict", /different PayPal account/);
    await expectDeskError(desk.linkVerifiedConcordium(worker, concordium(2)), "conflict", /different Concordium ID/);
    // Proving again with the same Concordium ID refreshes the attributes.
    await desk.linkVerifiedConcordium(worker, concordium(1, "SG"));
    expect(await desk.getWorker(worker)).toMatchObject({ provenAttributes: { residency: "SG" } });
  });

  it("keeps testers out of linking", async () => {
    desk = createDesk({ db, testInvite: "boreal-test-invite-1" });
    const tester = asWorker(await desk.signInTestWorker("boreal-test-invite-1", "raldb", {}));
    await expectDeskError(desk.linkPayPal(tester, paypal(1)), "forbidden");
    await expectDeskError(desk.linkVerifiedConcordium(tester, concordium(1)), "forbidden");
  });
});

describe("who may claim", () => {
  it("needs the Concordium badge for a task with required attributes", async () => {
    const forPh = await openTask([{ attribute: "residency", value: "PH" }]);
    const worker = asWorker(await desk.signInWithPayPal(paypal(1)));
    // Shown to the worker, so they know to add Concordium ID, but refused until they do.
    expect((await desk.browseOpenTasks(worker)).map((t) => t.id)).toEqual([forPh]);
    await expectDeskError(desk.claimTask(worker, forPh), "forbidden", /Verified by Concordium/);
    await desk.linkVerifiedConcordium(worker, concordium(1));
    expect((await desk.claimTask(worker, forPh)).status).toBe("claimed");
  });

  it("still checks the badge's attributes match", async () => {
    const forPh = await openTask([{ attribute: "residency", value: "PH" }]);
    const worker = asWorker(await desk.signInWithPayPal(paypal(1)));
    await desk.linkVerifiedConcordium(worker, concordium(1, "SG"));
    expect(await desk.browseOpenTasks(worker)).toEqual([]);
    await expectDeskError(desk.claimTask(worker, forPh), "forbidden", /haven't proven/);
  });

  it("lets any PayPal worker claim a task without required attributes off mainnet", async () => {
    const forAnyone = await openTask([]);
    const worker = asWorker(await desk.signInWithPayPal(paypal(1, false)));
    expect((await desk.claimTask(worker, forAnyone)).status).toBe("claimed");
  });

  it("on mainnet, needs PayPal's verified account (or Concordium ID) for a task without required attributes", async () => {
    useDesk({ requireVerifiedPayPal: true });
    const first = await openTask([]);
    const second = await openTask([]);
    const unverified = asWorker(await desk.signInWithPayPal(paypal(1, false)));
    await expectDeskError(desk.claimTask(unverified, first), "forbidden", /verify your PayPal account/);
    const verified = asWorker(await desk.signInWithPayPal(paypal(2, true)));
    expect((await desk.claimTask(verified, first)).status).toBe("claimed");
    // The badge counts as verification too.
    await desk.linkVerifiedConcordium(unverified, concordium(1));
    expect((await desk.claimTask(unverified, second)).status).toBe("claimed");
  });

  it("keeps test-mode rules: testers claim with their invite's attributes and no badge", async () => {
    desk = createDesk({ db, testInvite: "boreal-test-invite-1", requireVerifiedPayPal: true });
    const [testOwner] = await db.insert(owners).values({ kind: "individual", verifiedRef: "owner-test" }).returning();
    const [testAgent] = await db
      .insert(agents)
      .values({ ownerId: testOwner!.id, registryId: "registry-test", name: "Test", maxTaskBudget: 5_000, maxDailySpend: 50_000, testMode: true })
      .returning();
    requester = { role: "requester", agentId: testAgent!.id };
    const { task } = await desk.postTask(requester, {
      description: "Photograph the jeepney stop at Taft Avenue corner Vito Cruz, showing the route sign.",
      acceptanceCriteria: ["Photo shows the jeepney stop"],
      requiredAttributes: [{ attribute: "residency", value: "PH" }],
      resultFormat: "photo",
      budget: 500,
      deadline: new Date(Date.now() + 24 * 3600_000).toISOString(),
      reviewer: "requester",
    });
    await desk.fundTask(requester, task.id, { txHash: "test", amount: taskTotal(task) });
    const tester = asWorker(await desk.signInTestWorker("boreal-test-invite-1", "raldb", { residency: "PH" }));
    expect((await desk.claimTask(tester, task.id)).status).toBe("claimed");
  });
});

describe("owners", () => {
  it("lets a PayPal-signed-in worker approve an agent", async () => {
    const worker = await desk.signInWithPayPal(paypal(1));
    const link = await desk.requestAgentLink({ agentName: "Hermes 2" }, "client-a");
    await desk.approveAgentLink(worker.id, link.code, { name: "Hermes 2", maxTaskBudget: 1_000, maxDailySpend: 5_000 });
    const [owner] = await db.select().from(owners).where(eq(owners.verifiedRef, ref(1)));
    expect(owner).toBeDefined();
    expect((await desk.listOwnerAgents(worker.id)).map((a) => a.name)).toEqual(["Hermes 2"]);
  });
});
