import type { Reviewer } from "@boreal/brain";
import { agents, type Database, leases, owners, workers } from "@boreal/db";
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
    const report = await monitor(passAll).tick();
    expect(report.ai).toMatchObject({ screened: 1 });
    expect((await desk.getTask(requester, task.id)).status).toBe("awaiting_funding");

    await desk.fundTask(requester, task.id, { txHash: "t", amount: task.budget + task.platformFee + task.reviewFee });
    await desk.claimTask(worker, task.id);
    clock = new Date(clock.getTime() + 5 * 3600_000);
    const later = await monitor(passAll).tick();
    expect(later.expiredClaims).toBe(1);
    expect(describeTick(later)).toContain("1 claims expired");
  });

  it("keeps going when a step fails and reports the error", async () => {
    const broken: Reviewer = { ...passAll, screen: async () => { throw new Error("boom"); } };
    await desk.postTask(requester, {
      description: "Photograph item X on the shelf at the Manila shop, with its price tag visible.",
      acceptanceCriteria: ["Photo shows item X on a shelf"],
      resultFormat: "photo",
      budget: 500,
      deadline: new Date(clock.getTime() + 48 * 3600_000).toISOString(),
    });
    const report = await monitor(broken).tick();
    expect(report.ran).toBe(true);
    expect(report.errors).toEqual(["ai-review: boom"]);
  });
});
