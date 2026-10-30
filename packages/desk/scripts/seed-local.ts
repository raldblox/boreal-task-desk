// Seeds the local database for `pnpm dev:local`: a badged requester agent and three funded,
// screened tasks for workers to pick up. Refuses to run against anything but localhost.

import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { loadConcordium, signDevPayment } from "@boreal/concordium";
import { agents, createDb, owners } from "@boreal/db";

import { type Caller, createDesk } from "../src/desk";
import { issueAgentKey } from "../src/keys";

const concordium = loadConcordium(); // throws unless CONCORDIUM_MODE=dev with a local database
if (!concordium) throw new Error("seed-local needs CONCORDIUM_MODE=dev; run `pnpm dev:local`");

const db = createDb();
const desk = createDesk({ db, concordium });
const secret = process.env.DEV_CONCORDIUM_SECRET!;

const [owner] = await db.insert(owners).values({ kind: "individual", verifiedRef: "dev-owner" }).returning();
const [agent] = await db
  .insert(agents)
  .values({
    ownerId: owner!.id,
    registryId: "dev-hermes",
    name: "dev-hermes",
    maxTaskBudget: 5_000,
    maxDailySpend: 50_000,
    refundAddress: "dev-acct-hermes",
  })
  .returning();
const hermes: Caller = { role: "requester", agentId: agent!.id };
const reviewer: Caller = { role: "reviewer", reviewerRef: "boreal-ai-reviewer" };

const inDays = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
const tasks = [
  {
    description: "Visit the shop on Taft Avenue, Manila and photograph item X on the shelf with its price tag.",
    acceptanceCriteria: ["Photo shows item X on a shelf", "Price tag is readable"],
    requiredAttributes: [{ attribute: "residency" as const, value: "PH" }],
    resultFormat: "photo" as const,
    budget: 250,
    deadline: inDays(2),
  },
  {
    description: "Read this Tagalog notice and summarise in English what it asks residents to do and by when.",
    acceptanceCriteria: ["Summary names the action residents must take", "Summary gives the deadline in the notice"],
    requiredAttributes: [{ attribute: "residency" as const, value: "PH" }],
    resultFormat: "text" as const,
    budget: 150,
    deadline: inDays(3),
  },
  {
    description: "Check whether the café at the given address is open today and photograph its posted opening hours.",
    acceptanceCriteria: ["Photo shows the café's posted opening hours", "Photo is taken today"],
    requiredAttributes: [],
    resultFormat: "photo" as const,
    budget: 300,
    deadline: inDays(1),
  },
];

for (const input of tasks) {
  const { task, quote } = await desk.postTask(hermes, input);
  await desk.screenTask(reviewer, task.id, { outcome: "ok" });
  const requirement = await concordium.payments.createPaymentRequest(task.id, quote.total);
  const payment = { requirement, signature: signDevPayment(secret, requirement) };
  await desk.fundTask(hermes, task.id, { confirm: () => concordium.payments.confirmPayment(task.id, payment) });
}

const key = await issueAgentKey(db, agent!.id);
writeFileSync(join(process.env.LOCAL_UPLOAD_DIR!, "..", "agent-key.txt"), key);
console.log(`[seed] dev-hermes agent with ${tasks.length} open tasks; its key is in .local/agent-key.txt`);
process.exit(0);
