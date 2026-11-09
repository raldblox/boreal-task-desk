import { agents, type Database, eq, ledgerEntries, outbox, owners, taskEvents, workers } from "@boreal/db";
import { createTestDb } from "@boreal/db/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type Caller, createDesk, type Desk } from "./desk";
import { DeskError } from "./errors";
import { ledgerEscrowBalance } from "./outbox";

const INVITE = "boreal-test-invite-1";
let db: Database;
let close: () => Promise<void>;
let desk: Desk;
let hermes: Caller; // test agent
let realAgent: Caller;
let realWorker: Caller;

const isDeskError = (code: string) => (e: unknown) => e instanceof DeskError && e.code === code;

async function agent(name: string, testMode: boolean) {
  const [owner] = await db.insert(owners).values({ kind: "individual", verifiedRef: `o-${name}` }).returning();
  const [row] = await db
    .insert(agents)
    .values({ ownerId: owner!.id, registryId: name, name, maxTaskBudget: 5_000, maxDailySpend: 50_000, testMode })
    .returning();
  return { role: "requester", agentId: row!.id } as Caller;
}

const input = (reviewer: "boreal" | "requester" = "requester") => ({
  description: "Photograph the jeepney stop at Taft Avenue corner Vito Cruz, showing the route sign.",
  acceptanceCriteria: ["Photo shows the jeepney stop", "Route sign is readable"],
  resultFormat: "photo",
  budget: 300,
  deadline: new Date(Date.now() + 24 * 3600_000).toISOString(),
  reviewer,
});

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  desk = createDesk({ db, testInvite: INVITE });
  hermes = await agent("hermes", true);
  realAgent = await agent("real", false);
  const [w] = await db.insert(workers).values({ pseudonym: "real-w", provenAttributes: {} }).returning();
  realWorker = { role: "worker", workerId: w!.id };
});

afterEach(() => close());

async function fund(caller: Caller, id: string) {
  const task = await desk.getTask(caller, id);
  return desk.fundTask(caller, id, { txHash: `test-fund-${id}`, amount: task.budget + task.platformFee + task.reviewFee });
}

describe("test agents and workers", () => {
  it("skips screening for a test agent, recorded in the trail", async () => {
    const { task } = await desk.postTask(hermes, input());
    expect(task).toMatchObject({ status: "awaiting_funding", test: true, reviewMode: "requester" });
    // Funding a test agent's task opens it straight away: screening is skipped, on the record.
    expect((await fund(hermes, task.id)).status).toBe("open");
    const [screen] = await db.select().from(taskEvents).where(eq(taskEvents.type, "screen_ok"));
    expect(screen?.payload).toMatchObject({ reviewerRef: "test-mode" });
  });

  it("walls test tasks off from real workers, and test workers off from real tasks", async () => {
    const { task: testTask } = await desk.postTask(hermes, input());
    await fund(hermes, testTask.id);
    const { task: realTask } = await desk.postTask(realAgent, input("boreal"));
    await fund(realAgent, realTask.id);
    await desk.screenTask({ role: "reviewer", reviewerRef: "r" }, realTask.id, { outcome: "ok" });

    const tester = await desk.signInTestWorker(INVITE, "raldb", { residency: "PH" });
    const testWorker: Caller = { role: "worker", workerId: tester.id };
    expect((await desk.browseOpenTasks(testWorker)).map((t) => t.id)).toEqual([testTask.id]);
    expect((await desk.browseOpenTasks(realWorker)).map((t) => t.id)).toEqual([realTask.id]);
    await expect(desk.claimTask(realWorker, testTask.id)).rejects.toSatisfy(isDeskError("forbidden"));
    await expect(desk.claimTask(testWorker, realTask.id)).rejects.toSatisfy(isDeskError("forbidden"));
  });

  it("refuses a wrong invite code", async () => {
    await expect(desk.signInTestWorker("nope", "raldb", {})).rejects.toSatisfy(isDeskError("forbidden"));
    await expect(createDesk({ db }).signInTestWorker(INVITE, "raldb", {})).rejects.toSatisfy(isDeskError("forbidden"));
  });
});

describe("requester review", () => {
  async function submitted() {
    const { task } = await desk.postTask(hermes, input());
    await fund(hermes, task.id);
    const tester = await desk.signInTestWorker(INVITE, "raldb", {});
    const worker: Caller = { role: "worker", workerId: tester.id };
    await desk.claimTask(worker, task.id);
    await desk.submitResult(worker, task.id, { fileUrls: [`submissions/${task.id}/stop.jpg`] });
    return { id: task.id, worker };
  }

  it("lets Hermes pass its own task, which is final at once, settling test money with nothing sent", async () => {
    const { id, worker } = await submitted();
    expect((await desk.aiQueue("review")).map((t) => t.id)).not.toContain(id);

    const passed = await desk.requesterReview(hermes, id, { outcome: "pass", ruleIds: [], reasoning: "Stop and sign are clear." });
    // The requester was the judge, so there's no one left to object: final now, no window.
    expect(passed.status).toBe("final_pass");
    expect((await desk.getVerdict(worker, id))?.reasoning).toBe("Stop and sign are clear.");
    await expect(desk.acceptEarly(hermes, id)).rejects.toThrow();
    const entries = await db.select().from(ledgerEntries).where(eq(ledgerEntries.taskId, id));
    expect(entries.every((e) => e.status === "settled" && e.txHash?.startsWith("test"))).toBe(true);
    expect(entries.find((e) => e.toAccount === "worker")?.amount).toBe(300);
    // No review fee on requester-reviewed tasks, so nothing goes to a reviewer.
    expect(entries.find((e) => e.toAccount === "reviewer")).toBeUndefined();
    expect(entries.find((e) => e.fromAccount === "requester")?.amount).toBe(300 + 30 + 50);
    expect(await db.select().from(outbox).where(eq(outbox.kind, "payout"))).toHaveLength(0);
    expect(await ledgerEscrowBalance(db)).toBe(0);
  });

  it("holds Hermes to the rules and lets the worker dispute", async () => {
    const { id, worker } = await submitted();
    await expect(desk.requesterReview(hermes, id, { outcome: "fail", ruleIds: [], reasoning: "bad photo" })).rejects.toSatisfy(
      isDeskError("invalid"),
    );
    await desk.requesterReview(hermes, id, { outcome: "fail", ruleIds: ["R4.2"], reasoning: "Sign not readable." });
    expect((await desk.disputeVerdict(worker, id, "The sign is readable at full size.")).status).toBe("disputed");
  });

  it("only works on tasks posted for requester review, by their own requester", async () => {
    const { task } = await desk.postTask(hermes, input("boreal"));
    await expect(desk.requesterReview(hermes, task.id, { outcome: "pass", ruleIds: [], reasoning: "fine ok" })).rejects.toSatisfy(
      isDeskError("forbidden"),
    );
    const { id } = await submitted();
    await expect(desk.requesterReview(realAgent, id, { outcome: "pass", ruleIds: [], reasoning: "fine ok" })).rejects.toSatisfy(
      isDeskError("not_found"),
    );
  });
});
