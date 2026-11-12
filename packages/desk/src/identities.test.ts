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
  await desk.fundTask(requester, task.id, { txHash: `tx-${task.id}`, amount: taskTotal(task) });
  await desk.screenTask(reviewer, task.id, { outcome: "ok" });
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

describe("quick sign-in with a remembered wallet", () => {
  const wallet = (n: number) => `cw:${n.toString(16).padStart(64, "b")}`;

  it("signs in by the wallet account that answered the last proof, without a new proof", async () => {
    expect(await desk.signInWithWallet(wallet(1))).toBeNull();
    const worker = await desk.signInVerifiedWorker(concordium(1), wallet(1));
    expect((await desk.signInWithWallet(wallet(1)))?.id).toBe(worker.id);
    expect(await desk.signInWithWallet(wallet(2))).toBeNull();
  });

  it("moves a wallet account to the worker whose identity it last proved", async () => {
    const first = await desk.signInVerifiedWorker(concordium(1), wallet(1));
    const second = await desk.signInVerifiedWorker(concordium(2), wallet(1));
    expect((await desk.signInWithWallet(wallet(1)))?.id).toBe(second.id);
    const [old] = await db.select().from(workers).where(eq(workers.id, first.id));
    expect(old?.concordiumWalletRef).toBeNull();
  });

  it("remembers the wallet when Concordium ID is added to a PayPal worker", async () => {
    const worker = await desk.signInWithPayPal(paypal(1));
    const kept = await desk.linkVerifiedConcordium(asWorker(worker), concordium(1), wallet(3));
    expect((await desk.signInWithWallet(wallet(3)))?.id).toBe(kept.id);
  });

  it("signs a new wallet in free with its own account; the badge waits for a proof", async () => {
    const worker = await desk.signInWithWallet(wallet(4), { create: true });
    expect(worker).toMatchObject({ pseudonym: wallet(4), concordiumRef: null, provenAttributes: {} });
    expect((await desk.signInWithWallet(wallet(4), { create: true }))?.id).toBe(worker!.id);
    expect(await desk.getWorker(asWorker(worker!))).toMatchObject({ hasConcordium: false });

    // Adding Concordium ID later is the one paid step: it brings the badge and attributes.
    const kept = await desk.linkVerifiedConcordium(asWorker(worker!), concordium(4), wallet(4));
    expect(kept.id).toBe(worker!.id);
    expect(await desk.getWorker(asWorker(kept))).toMatchObject({ hasConcordium: true, provenAttributes: { residency: "PH" } });
    expect((await desk.signInWithWallet(wallet(4)))?.id).toBe(worker!.id);
  });

  it("refuses a wallet that isn't a keyed hash", async () => {
    await expectDeskError(desk.signInWithWallet("3kBx2h5Y2veb4hZgAJWPrr8RyQESKm5TjzF3ti1QQ4VSYLwK1G"), "invalid");
    await expectDeskError(desk.signInVerifiedWorker(concordium(1), "cw:nope"), "invalid");
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

  it("folds an empty account holding the identity into the current one", async () => {
    await desk.signInVerifiedWorker(concordium(1)); // accidental second account, never used
    const paypalWorker = asWorker(await desk.signInWithPayPal(paypal(1)));
    const kept = await desk.linkVerifiedConcordium(paypalWorker, concordium(1));
    expect(kept.id).toBe((paypalWorker as { workerId: string }).workerId);
    expect((await desk.signInVerifiedWorker(concordium(1))).id).toBe(kept.id);
  });

  it("folds the current empty account into the one with history that holds the identity", async () => {
    const paypalWorker = await desk.signInWithPayPal(paypal(1));
    await desk.claimTask(asWorker(paypalWorker), await openTask([]));
    const ccdWorker = asWorker(await desk.signInVerifiedWorker(concordium(1)));
    const kept = await desk.linkPayPal(ccdWorker, paypal(1));
    expect(kept.id).toBe(paypalWorker.id);
    expect((await desk.signInVerifiedWorker(concordium(1))).id).toBe(paypalWorker.id);
  });

  it("never merges two accounts that both have history", async () => {
    const paypalWorker = await desk.signInWithPayPal(paypal(1));
    await desk.claimTask(asWorker(paypalWorker), await openTask([]));
    const ccdWorker = asWorker(await desk.signInVerifiedWorker(concordium(1)));
    await desk.claimTask(ccdWorker, await openTask([]));
    await expectDeskError(desk.linkPayPal(ccdWorker, paypal(1)), "conflict", /another boreal.work account/);
    expect((await desk.signInWithPayPal(paypal(1))).id).toBe(paypalWorker.id);
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

  it("refuses an unverified person by default, on every network", async () => {
    const forAnyone = await openTask([]);
    const worker = asWorker(await desk.signInWithPayPal(paypal(1, false)));
    await expectDeskError(desk.claimTask(worker, forAnyone), "forbidden", /only verified people can work here/);
  });

  it("counts a Concordium account as verified: the chain opens accounts only on a checked identity", async () => {
    const forAnyone = await openTask([]);
    const needsAttributes = await openTask([{ attribute: "residency", value: "PH" }]);
    const worker = asWorker((await desk.signInWithWallet(`cw:${"c".repeat(64)}`, { create: true }))!);
    expect((await desk.claimTask(worker, forAnyone)).status).toBe("claimed");
    // Proven attributes still need the Concordium ID proof itself.
    await expectDeskError(desk.claimTask(worker, needsAttributes), "forbidden", /Verified by Concordium badge/);
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
