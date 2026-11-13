import { agents, type Database, owners } from "@boreal/db";
import { createTestDb } from "@boreal/db/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type Caller, createDesk, type Desk, type PassportIdentity, type PayPalIdentity } from "./desk";
import { DeskError } from "./errors";
import { taskTotal } from "./money";

// ZKPassport: a worker proves 18+, nationality and a unique identifier for their passport from its
// chip. One passport makes one account, and the person code keeps one person to one account across
// passports and Concordium ID.

let db: Database;
let close: () => Promise<void>;
let desk: Desk;
let requester: Caller;
const reviewer: Caller = { role: "reviewer", reviewerRef: "boreal-ai-reviewer" };

const hex = (n: number, fill = "0") => n.toString(16).padStart(64, fill);
const paypal = (n: number, verified = true): PayPalIdentity => ({ ref: `pp:${hex(n)}`, email: `w${n}@personal.example.com`, verified });
const passport = (n: number, extra: Partial<PassportIdentity> = {}): PassportIdentity => ({
  ref: `zkp:${hex(n, "b")}`,
  provenAttributes: { age_over_18: "true", nationality: "PHL" },
  ...extra,
});
const concordium = (n: number) => ({ pseudonym: `ccdid:${hex(n, "a")}`, provenAttributes: { residency: "PH", age_over_18: "true" } });
const person = (c: string) => `ccdp:${c.repeat(64)}`;
const asWorker = (worker: { id: string }): Caller => ({ role: "worker", workerId: worker.id });

async function expectDeskError(promise: Promise<unknown>, code: DeskError["code"], message?: RegExp) {
  await expect(promise).rejects.toSatisfy(
    (e: unknown) => e instanceof DeskError && e.code === code && (!message || message.test(e.message)),
  );
}

async function openTask(requiredAttributes: { attribute: string; value?: string }[] = []) {
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

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  desk = createDesk({ db, verification: { concordiumId: false, paypal: true, zkPassport: true } });
  const [owner] = await db.insert(owners).values({ kind: "individual", verifiedRef: "owner-1" }).returning();
  const [agent] = await db
    .insert(agents)
    .values({ ownerId: owner!.id, registryId: "registry-1", name: "Hermes", maxTaskBudget: 5_000, maxDailySpend: 50_000 })
    .returning();
  requester = { role: "requester", agentId: agent!.id };
});

afterEach(() => close());

describe("signing in with ZKPassport", () => {
  it("makes one account per passport, verified at once", async () => {
    const first = await desk.signInWithPassport(passport(1));
    expect(first).toMatchObject({ pseudonym: passport(1).ref, passportRef: passport(1).ref, provenAttributes: { age_over_18: "true", nationality: "PHL" } });
    expect((await desk.signInWithPassport(passport(1))).id).toBe(first.id);
    expect((await desk.signInWithPassport(passport(2))).id).not.toBe(first.id);
    expect(await desk.getWorker(asWorker(first))).toMatchObject({ hasPassport: true, hasPayPal: false, hasConcordium: false });
  });

  it("lets a passport-verified worker claim, with no PayPal verification", async () => {
    const worker = asWorker(await desk.signInWithPassport(passport(1)));
    expect((await desk.claimTask(worker, await openTask())).status).toBe("claimed");
  });

  it("proves age with the passport, but residency still needs Concordium ID", async () => {
    // Tasks can require attributes only where Concordium ID is on.
    desk = createDesk({ db, verification: { concordiumId: true, paypal: false, zkPassport: true } });
    const adults = await openTask([{ attribute: "age_over_18" }]);
    const forPh = await openTask([{ attribute: "residency", value: "PH" }]);
    const worker = asWorker(await desk.signInWithPassport(passport(1)));
    await expectDeskError(desk.claimTask(worker, forPh), "forbidden", /haven't proven/);
    expect((await desk.claimTask(worker, adults)).status).toBe("claimed");
  });

  it("refuses an identity that isn't a keyed hash, or a proof without 18+", async () => {
    await expectDeskError(desk.signInWithPassport({ ...passport(1), ref: "zkp:raw-identifier" }), "invalid");
    await expectDeskError(desk.signInWithPassport({ ...passport(1), personRef: "ccdp:not-a-hash" }), "invalid");
    await expectDeskError(desk.signInWithPassport({ ...passport(1), provenAttributes: { nationality: "PHL" } }), "forbidden", /18 or older/);
  });

  it("tells an unverified PayPal worker that a passport works too", async () => {
    const worker = asWorker(await desk.signInWithPayPal(paypal(1, false)));
    await expectDeskError(desk.claimTask(worker, await openTask()), "forbidden", /ZKPassport/);
  });
});

describe("adding a passport to an account", () => {
  it("verifies a PayPal worker PayPal hasn't verified", async () => {
    const worker = asWorker(await desk.signInWithPayPal(paypal(1, false)));
    const task = await openTask();
    await expectDeskError(desk.claimTask(worker, task), "forbidden", /only verified people/);
    const kept = await desk.linkPassport(worker, passport(1));
    expect(kept).toMatchObject({ passportRef: passport(1).ref, paypalRef: paypal(1).ref });
    expect((await desk.claimTask(worker, task)).status).toBe("claimed");
    // The passport now signs in to the same account.
    expect((await desk.signInWithPassport(passport(1))).id).toBe(kept.id);
  });

  it("keeps Concordium ID's attributes and adds the passport's", async () => {
    const worker = asWorker(await desk.signInVerifiedWorker(concordium(1)));
    const kept = await desk.linkPassport(worker, passport(1));
    expect(kept.provenAttributes).toEqual({ residency: "PH", age_over_18: "true", nationality: "PHL" });
  });

  it("folds an empty passport account into the one with history, carrying PayPal along", async () => {
    const withHistory = await desk.signInWithPassport(passport(1));
    await desk.claimTask(asWorker(withHistory), await openTask());
    const fresh = asWorker(await desk.signInWithPayPal(paypal(2)));
    const kept = await desk.linkPassport(fresh, passport(1));
    expect(kept.id).toBe(withHistory.id);
    expect(kept.paypalRef).toBe(paypal(2).ref);
    expect((await desk.signInWithPayPal(paypal(2))).id).toBe(withHistory.id);
  });

  it("never swaps one passport for another, and never merges two accounts with history", async () => {
    const worker = asWorker(await desk.signInWithPayPal(paypal(1)));
    await desk.linkPassport(worker, passport(1));
    await expectDeskError(desk.linkPassport(worker, passport(2)), "conflict", /different ZKPassport document/);

    const a = await desk.signInWithPassport(passport(3));
    await desk.claimTask(asWorker(a), await openTask());
    const b = asWorker(await desk.signInWithPayPal(paypal(4)));
    await desk.claimTask(b, await openTask());
    await expectDeskError(desk.linkPassport(b, passport(3)), "conflict", /another boreal.work account/);
  });
});

describe("one person, one account, across passports and Concordium ID", () => {
  it("refuses a second passport of the same person", async () => {
    const first = await desk.signInWithPassport(passport(1, { personRef: person("e") }));
    expect((await desk.signInWithPassport(passport(1, { personRef: person("e") }))).id).toBe(first.id);
    await expectDeskError(desk.signInWithPassport(passport(2, { personRef: person("e") })), "conflict", /one account per person/);
    await desk.signInWithPassport(passport(3, { personRef: person("f") }));
  });

  it("refuses a passport account for someone who already proved themselves with Concordium ID, and the other way round", async () => {
    await desk.signInVerifiedWorker({ ...concordium(1), personRef: person("e") });
    await expectDeskError(desk.signInWithPassport(passport(1, { personRef: person("e") })), "conflict", /already has a boreal.work account/);

    await desk.signInWithPassport(passport(2, { personRef: person("d") }));
    await expectDeskError(desk.signInVerifiedWorker({ ...concordium(2), personRef: person("d") }), "conflict", /already has a boreal.work account/);
    const other = asWorker(await desk.signInWithPayPal(paypal(3)));
    await expectDeskError(desk.linkPassport(other, passport(4, { personRef: person("e") })), "conflict", /one account per person/);
  });

  it("lets the same person add their passport to the account their Concordium ID is on", async () => {
    const worker = asWorker(await desk.signInVerifiedWorker({ ...concordium(1), personRef: person("e") }));
    const kept = await desk.linkPassport(worker, passport(1, { personRef: person("e") }));
    expect(kept).toMatchObject({ passportRef: passport(1).ref, personRef: person("e") });
  });

  it("keeps an account's person code when a passport says otherwise", async () => {
    const worker = asWorker(await desk.signInVerifiedWorker({ ...concordium(1), personRef: person("e") }));
    expect((await desk.linkPassport(worker, passport(1, { personRef: person("c") }))).personRef).toBe(person("e"));
  });

  it("fills in a person code the passport account didn't have", async () => {
    const first = await desk.signInWithPassport(passport(1));
    expect((await desk.signInWithPassport(passport(1, { personRef: person("e") }))).personRef).toBe(person("e"));
    expect((await desk.signInWithPassport(passport(1, { personRef: person("c") }))).id).toBe(first.id);
    expect((await desk.getWorker(asWorker(first)))?.hasPassport).toBe(true);
  });

  it("releases the passport and person code when the account closes", async () => {
    const first = await desk.signInWithPassport(passport(1, { personRef: person("e") }));
    await desk.closeAccount(first.id);
    const again = await desk.signInWithPassport(passport(1, { personRef: person("e") }));
    expect(again.id).not.toBe(first.id);
  });
});
