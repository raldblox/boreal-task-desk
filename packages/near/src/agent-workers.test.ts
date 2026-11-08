import { generateKeyPairSync, randomBytes, sign } from "node:crypto";

import { createDevConcordium } from "@boreal/concordium";
import { agents, type Database, eq, owners, taskEvents } from "@boreal/db";
import { createTestDb } from "@boreal/db/testing";
import { type Caller, createDesk, type Desk, outboxTransferJournal, verifyWorkerKey } from "@boreal/desk";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createFakeNear, type FakeNear } from "./fake-near";
import { createNearPayments, fundingMemo, type NearPayments } from "./payments";
import { CONNECT_MESSAGE, nep413Digest, SIGN_IN_MESSAGE, signInNonce, verifyNearSignIn } from "./sign-in";
import { newNearKey } from "./testing";
import { base58Encode, nearSigner } from "./tx";

// AI agents as a second pool of workers: an agent proves a NEAR account, takes a task its
// requester opened to agents, goes through the same review, and is paid in USDC on NEAR.

const HOUR = 60 * 60 * 1000;
const USDC = "usdc.fakes.testnet";
const ESCROW = "escrow.boreal.testnet";
const RECIPIENT = "boreal.work";
const reviewer: Caller = { role: "reviewer", reviewerRef: "boreal-ai-reviewer" };

let db: Database;
let close: () => Promise<void>;
let clock: Date;
let chain: FakeNear;
let near: NearPayments;
let desk: Desk;
let requester: Caller;

/** An agent's NEAR account with one full-access key, able to sign NEP-413 messages. */
function agentAccount(accountId: string) {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const raw = Buffer.from(publicKey.export({ format: "jwk" }).x!, "base64url");
  const publicKeyText = `ed25519:${base58Encode(raw)}`;
  chain.keys.set(accountId, new Set([publicKeyText]));
  return {
    accountId,
    signIn(at = clock, message = SIGN_IN_MESSAGE) {
      const nonce = signInNonce(at, randomBytes(24));
      return {
        accountId,
        publicKey: publicKeyText,
        signature: sign(null, nep413Digest(message, nonce, RECIPIENT), privateKey).toString("base64"),
        nonce: Buffer.from(nonce).toString("base64"),
        message,
        recipient: RECIPIENT,
      };
    },
  };
}

async function signInAgent(account: ReturnType<typeof agentAccount>, at = clock) {
  const { accountId, signedAt } = await verifyNearSignIn(account.signIn(at), { chain, recipient: RECIPIENT, now: () => clock });
  return desk.signInAgentWorker(accountId, signedAt);
}

/** Posts, screens and funds a task on the NEAR rail, the way an agent pays: ft_transfer, then fund. */
async function fundedTask(input: Record<string, unknown>) {
  const { task, quote } = await desk.postTask(requester, {
    description: "Summarise the three main points of the attached public council minutes in plain English.",
    acceptanceCriteria: ["Three points, each one sentence, all from the minutes"],
    resultFormat: "text",
    budget: 500,
    deadline: new Date(clock.getTime() + 24 * HOUR).toISOString(),
    ...input,
  });
  await desk.screenTask(reviewer, task.id, { outcome: "ok" });
  const tx = chain.externalTransfer("hermes.testnet", ESCROW, BigInt(quote.total) * near.scale, fundingMemo(task.id));
  return desk.fundTask(requester, task.id, { confirm: () => near.confirmPayment(task.id, { txHash: tx, signerId: "hermes.testnet" }) }, { rail: "near" });
}

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  clock = new Date("2026-11-02T00:00:00Z");
  chain = createFakeNear(USDC);
  for (const account of [ESCROW, "hermes.testnet", "ops.boreal.testnet"]) chain.registered.add(account);
  chain.balances.set("hermes.testnet", 1_000_000_000n);
  near = createNearPayments({
    chain,
    network: "testnet",
    token: USDC,
    decimals: 6,
    escrow: nearSigner(ESCROW, newNearKey()),
    journal: outboxTransferJournal(db),
    now: () => clock,
  });
  desk = createDesk({
    db,
    now: () => clock,
    concordium: createDevConcordium({ secret: "s".repeat(32), now: () => clock }),
    rails: { near },
    addresses: { near: { operating: "ops.boreal.testnet" } },
  });
  const [owner] = await db.insert(owners).values({ kind: "individual", verifiedRef: "owner-hermes" }).returning();
  const [agent] = await db
    .insert(agents)
    .values({ ownerId: owner!.id, registryId: "dev-hermes", name: "Hermes", maxTaskBudget: 1_000, maxDailySpend: 5_000 })
    .returning();
  requester = { role: "requester", agentId: agent!.id };
});

afterEach(() => close());

describe("agent workers", () => {
  it("signs an agent in with a NEP-413 signature from a full-access key of its NEAR account", async () => {
    const account = agentAccount("summariser.testnet");
    const { workerId, key } = await signInAgent(account);
    expect(key).toMatch(/^bw_/);
    expect(await verifyWorkerKey(db, key)).toBe(workerId);
    expect(await desk.getWorker({ role: "worker", workerId })).toMatchObject({ nearAccount: "summariser.testnet" });

    // Signing in again later gives the same worker a new key; the old one stops working.
    clock = new Date(clock.getTime() + 60_000);
    const again = await signInAgent(account);
    expect(again.workerId).toBe(workerId);
    expect(await verifyWorkerKey(db, key)).toBeNull();
    // A signature no newer than the last one issued can't issue another key.
    await expect(signInAgent(account, new Date(clock.getTime() - 30_000))).rejects.toThrow(/already used/);
  });

  it("refuses sign-ins that aren't fresh, aren't boreal's message, or come from someone else's key", async () => {
    const account = agentAccount("summariser.testnet");
    const check = (input: ReturnType<typeof account.signIn>) => verifyNearSignIn(input, { chain, recipient: RECIPIENT, now: () => clock });
    await expect(check(account.signIn(new Date(clock.getTime() - 11 * 60_000)))).rejects.toThrow(/within 10 minutes/);
    await expect(check(account.signIn(clock, "Sign in to somewhere else"))).rejects.toThrow(/sign the message/);
    await expect(check({ ...account.signIn(), accountId: "victim.testnet" })).rejects.toThrow(/full-access key/);
    const forged = account.signIn();
    await expect(check({ ...forged, nonce: Buffer.from(signInNonce(clock, randomBytes(24))).toString("base64") })).rejects.toThrow(/signature/);
  });

  it("checks a person connecting a NEAR account against the connect message, never the agent sign-in one", async () => {
    const account = agentAccount("ana.testnet");
    const connect = (input: ReturnType<typeof account.signIn>) =>
      verifyNearSignIn(input, { chain, recipient: RECIPIENT, now: () => clock, message: CONNECT_MESSAGE });
    await expect(connect(account.signIn(clock, CONNECT_MESSAGE))).resolves.toMatchObject({ accountId: "ana.testnet" });
    // Neither signature stands in for the other.
    await expect(connect(account.signIn())).rejects.toThrow(/sign the message/);
    await expect(verifyNearSignIn(account.signIn(clock, CONNECT_MESSAGE), { chain, recipient: RECIPIENT, now: () => clock })).rejects.toThrow(
      /sign the message/,
    );
  });

  it("keeps photo tasks and tasks with required attributes for verified people", async () => {
    const base = {
      description: "Photograph the queue outside the Makati city hall at noon today, from the street.",
      acceptanceCriteria: ["The queue and the building are both visible"],
      budget: 500,
      deadline: new Date(clock.getTime() + 24 * HOUR).toISOString(),
      fulfillers: "people_or_agents",
    };
    await expect(desk.postTask(requester, { ...base, resultFormat: "photo" })).rejects.toThrow(/stays with verified people/);
    await expect(
      desk.postTask(requester, { ...base, resultFormat: "text", requiredAttributes: [{ attribute: "residency", value: "PH" }] }),
    ).rejects.toThrow(/stays with verified people/);
  });

  it("lets an agent take a task opened to agents, under the same review, and pays it in USDC on NEAR", async () => {
    const forAgents = await fundedTask({ fulfillers: "people_or_agents" });
    const peopleOnly = await fundedTask({});
    const { workerId } = await signInAgent(agentAccount("summariser.testnet"));
    const agentWorker: Caller = { role: "worker", workerId };

    // It sees only the task opened to agents, and can't claim the people-only one.
    expect((await desk.browseOpenTasks(agentWorker)).map((t) => t.id)).toEqual([forAgents.id]);
    await expect(desk.claimTask(agentWorker, peopleOnly.id)).rejects.toThrow(/verified people only/);

    await desk.claimTask(agentWorker, forAgents.id);
    await desk.submitResult(agentWorker, forAgents.id, { text: "1. Budget passed. 2. New bus lane. 3. Market hours extended." });
    await desk.recordVerdict(reviewer, forAgents.id, { outcome: "pass", ruleIds: [], reasoning: "Three points, all from the minutes." });
    await desk.acceptEarly(requester, forAgents.id);

    // Everyone sees an agent did it: on the task and in the trail.
    expect(await desk.getTask(requester, forAgents.id)).toMatchObject({ status: "final_pass", fulfilledBy: "agent" });
    const [claim] = await db.select().from(taskEvents).where(eq(taskEvents.type, "claim"));
    expect(claim!.payload).toMatchObject({ fulfiller: "agent" });

    await desk.drainOutbox();
    expect(chain.balances.get("summariser.testnet")).toBe(500n * near.scale);
  });

  it("marks a task done by a person as such", async () => {
    const task = await fundedTask({ fulfillers: "people_or_agents" });
    const request = await desk.workerProofRequest([]);
    const person = await desk.signInWorker(request, { pseudonym: "ph-maria", attributes: { residency: "PH" } });
    const worker: Caller = { role: "worker", workerId: person.id };
    await desk.setPayoutAddress(worker, "maria.testnet", "near");
    await desk.claimTask(worker, task.id);
    expect(await desk.getTask(requester, task.id)).toMatchObject({ fulfilledBy: "person" });
  });
});
