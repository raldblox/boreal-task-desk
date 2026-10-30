// The demo video's flow, end to end, on a throwaway in-process database with the stand-in
// Concordium adapters. Touches no real database and no chain.
// Usage: pnpm --filter @boreal/desk demo

import { createDevConcordium, signDevPayment } from "@boreal/concordium";
import { POLICY } from "@boreal/core";
import { agents, asc, eq, ledgerEntries, owners, taskEvents } from "@boreal/db";
import { createTestDb } from "@boreal/db/testing";

import { type Caller, createDesk } from "../src/desk";
import { DeskError } from "../src/errors";
import { ledgerEscrowBalance } from "../src/outbox";

const secret = "demo-secret-".padEnd(32, "x");
const { db, close } = await createTestDb();
let clock = new Date("2026-12-01T09:00:00Z");
const concordium = createDevConcordium({ secret, now: () => clock, escrowBalance: () => ledgerEscrowBalance(db) });
const desk = createDesk({
  db,
  now: () => clock,
  concordium,
  addresses: { operating: "acct-boreal", reviewers: { "boreal-ai-reviewer": "acct-ai-reviewer" } },
});

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const step = (n: number, text: string) => console.log(`\n${n}. ${text}`);
const note = (text: string) => console.log(`   ${text}`);

async function agent(registryId: string) {
  const [owner] = await db.insert(owners).values({ kind: "individual", verifiedRef: `owner-${registryId}` }).returning();
  const [row] = await db
    .insert(agents)
    .values({ ownerId: owner!.id, registryId, name: registryId, maxTaskBudget: 5_000, maxDailySpend: 50_000, refundAddress: `acct-${registryId}` })
    .returning();
  return { role: "requester", agentId: row!.id } as Caller;
}

const hermes = await agent("dev-hermes");
const reviewer: Caller = { role: "reviewer", reviewerRef: "boreal-ai-reviewer" };
const human: Caller = { role: "panel", reviewerRef: "human-reviewer-1" };

step(1, "Hermes hits a step it can't do and posts a task");
const { task, quote } = await desk.postTask(hermes, {
  description: "Visit the shop on Taft Avenue, Manila and photograph item X on the shelf with its price tag.",
  acceptanceCriteria: ["Photo shows item X on a shelf", "Price tag is readable", "Photo includes the task's challenge word"],
  requiredAttributes: [{ attribute: "residency", value: "PH" }],
  resultFormat: "photo",
  budget: 200,
  deadline: new Date(clock.getTime() + 24 * 60 * 60 * 1000).toISOString(),
});
note(`badge checked; quote ${usd(quote.budget)} + ${usd(quote.platformFee)} platform + ${usd(quote.reviewFee)} review = ${usd(quote.total)}`);

step(2, "The reviewer screens it and Hermes funds it over x402");
await desk.screenTask(reviewer, task.id, { outcome: "ok" });
const requirement = await concordium.payments.createPaymentRequest(task.id, quote.total);
note(`402 Payment Required: pay ${usd(requirement.amount)} to ${requirement.payTo}`);
const payment = { requirement, signature: signDevPayment(secret, requirement) };
const funded = await desk.fundTask(hermes, task.id, { confirm: () => concordium.payments.confirmPayment(task.id, payment) });
note(`funded, tx ${funded.fundingTxHash?.slice(0, 18)}…; task is ${funded.status}`);

step(3, "A worker signs in with Concordium ID, proves residency, claims and submits");
const proof = await desk.workerProofRequest([{ attribute: "residency", value: "PH" }]);
const worker = await desk.signInWorker(proof, { pseudonym: "ph-maria", attributes: { residency: "PH" } }, "acct-ph-maria");
const maria: Caller = { role: "worker", workerId: worker.id };
note(`signed in as pseudonym ${worker.pseudonym}; boreal never sees a name`);
await desk.claimTask(maria, task.id);
clock = new Date(clock.getTime() + 90 * 60 * 1000);
await desk.submitResult(maria, task.id, { fileUrls: [`submissions/${task.id}/shelf-photo.jpg`] });
note("photo submitted");

step(4, "The AI reviewer fails it citing a rule; the worker disputes; a human overturns it");
await desk.recordVerdict(reviewer, task.id, { outcome: "fail", ruleIds: ["R4.2"], reasoning: "Price tag not readable" });
note("verdict: fail, cites R4.2");
await desk.disputeVerdict(maria, task.id, "The tag is readable when zoomed in; second shelf, left side.");
const decided = await desk.decideDispute(human, task.id, { outcome: "pass", ruleIds: ["R4.2", "R5.2"], reasoning: "Readable at full size" });
note(`panel: pass; task is ${decided.status}`);
const sent = await desk.drainOutbox(100);
note(`outbox sent ${sent.sent} items (payouts and anchors), ${sent.failed} failed; nobody saw a fee prompt`);
const payouts = await db.select().from(ledgerEntries).where(eq(ledgerEntries.taskId, task.id)).orderBy(asc(ledgerEntries.id));
for (const e of payouts.filter((p) => p.fromAccount === "escrow")) {
  note(`  ${e.toAccount.padEnd(9)} ${usd(e.amount).padStart(6)}  ${e.status}`);
}

step(5, "The trail, every event hash-chained and anchored");
const events = await db.select().from(taskEvents).where(eq(taskEvents.taskId, task.id)).orderBy(asc(taskEvents.id));
for (const e of events) note(`${e.type.padEnd(13)} ${e.actor.padEnd(9)} ${e.hash.slice(0, 12)}  anchored ${e.anchorTxHash?.slice(0, 14)}…`);
const recon = await desk.reconcileEscrow();
note(`escrow vs ledger gap: ${recon.gap}`);

step(6, "A script with no badge tries to post and is refused");
const script = await agent("random-script");
try {
  await desk.postTask(script, {
    description: "Do something for me right now please, it is urgent work.",
    acceptanceCriteria: ["The work is done"],
    resultFormat: "text",
    budget: 100,
    deadline: new Date(clock.getTime() + 60 * 60 * 1000).toISOString(),
  });
  note("UNEXPECTED: accepted");
} catch (error) {
  note(`refused: ${error instanceof DeskError ? error.message : String(error)}`);
}

console.log(`\nObjection window ${POLICY.objectionWindowMs / 3_600_000}h, rulebook v${POLICY.rulebookVersion}.`);
await close();
