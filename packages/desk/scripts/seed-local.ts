// Seeds the local database for `pnpm dev:local`: a badged requester agent and three funded,
// screened tasks for workers to pick up. Refuses to run against anything but localhost.

import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { loadConcordium, signDevPayment } from "@boreal/concordium";
import { readAddons } from "@boreal/core";
import { agents, createDb, eq, owners } from "@boreal/db";

import { type Caller, createDesk } from "../src/desk";
import { issueAgentKey } from "../src/keys";

const concordium = loadConcordium(); // throws unless CONCORDIUM_MODE=dev with a local database
if (!concordium?.payments) throw new Error("seed-local needs CONCORDIUM_MODE=dev; run `pnpm dev:local`");
const payments = concordium.payments;

const db = createDb();
const desk = createDesk({ db, concordium });
const secret = process.env.DEV_CONCORDIUM_SECRET!;

// Safe to run again: the owner and agent are reused, and each run adds three more tasks.
const [owner] =
  (await db.select().from(owners).where(eq(owners.verifiedRef, "dev-owner"))).length > 0
    ? await db.select().from(owners).where(eq(owners.verifiedRef, "dev-owner"))
    : await db.insert(owners).values({ kind: "individual", verifiedRef: "dev-owner" }).returning();
const [existingAgent] = await db.select().from(agents).where(eq(agents.registryId, "dev-hermes"));
const [agent] = existingAgent
  ? [existingAgent]
  : await db
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
    description: "Photograph the 500 ml Nature's Spring bottles on the shelf at the 7-Eleven on Taft Avenue, Malate, with the price tag, and say how many are in stock.",
    acceptanceCriteria: ["Bottles and price tag are readable", "Stock count given"],
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
    description: "Before a deposit is paid, confirm the supplier operates a warehouse at the given Valenzuela address: photograph the storefront with its business sign and street number.",
    acceptanceCriteria: ["Business sign matches the supplier's name", "Street number visible", "Says whether it is operating"],
    requiredAttributes: [],
    resultFormat: "photo" as const,
    budget: 300,
    deadline: inDays(1),
  },
];

// Without the Concordium add-on (PayPal only) the tasks wait for funding, so the agent funds them
// through PayPal, and they ask for no proven attributes, which need Concordium ID.
const concordiumOn = readAddons(process.env).on("concordium");
const paypal = process.env.PAYMENTS_RAIL === "paypal" || !concordiumOn;
for (const input of tasks) {
  const { task, quote } = await desk.postTask(hermes, concordiumOn ? input : { ...input, requiredAttributes: [] });
  // Funded before it is screened: nothing is checked until its money is held.
  if (paypal) continue;
  const requirement = await payments.createPaymentRequest(task.id, quote.total);
  const payment = { requirement, signature: signDevPayment(secret, requirement) };
  await desk.fundTask(hermes, task.id, { confirm: () => payments.confirmPayment(task.id, payment) });
  await desk.screenTask(reviewer, task.id, { outcome: "ok" });
}

const key = await issueAgentKey(db, agent!.id);
writeFileSync(join(process.env.LOCAL_UPLOAD_DIR!, "..", "agent-key.txt"), key);
console.log(
  `[seed] dev-hermes agent with ${tasks.length} ${paypal ? "tasks awaiting PayPal funding" : "open tasks"}; its key is in .local/agent-key.txt`,
);
process.exit(0);
