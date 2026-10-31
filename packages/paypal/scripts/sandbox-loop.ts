// The PayPal rail end to end against the real PayPal sandbox: an agent funds a task (the
// payer approves, boreal authorizes), a worker completes it, review passes, boreal captures
// the hold and pays the worker with a Payout, then reads the payout's status back into the
// ledger. The database is a throwaway in-process one, and identity uses the stand-ins.
//
// Usage: put sandbox credentials in .env.paypal at the workspace root (never commit it):
//   PAYPAL_CLIENT_ID=…  PAYPAL_CLIENT_SECRET=…  PAYPAL_SANDBOX_WORKER_EMAIL=<sandbox personal account>
// then `pnpm --filter @boreal/paypal sandbox-loop`. Approve the printed link with a sandbox
// buyer account, or pass `--card` to pay with PayPal's sandbox test card instead.

import { createDevConcordium } from "@boreal/concordium";
import { agents, asc, eq, isNull, ledgerEntries, outbox, owners } from "@boreal/db";
import { createTestDb } from "@boreal/db/testing";
import { type Caller, createDesk, ledgerEscrowBalance } from "@boreal/desk";

import { loadPayPal, type PayPalOrder, payoutUpdateFrom, toValue } from "../src/index";

const workerEmail = process.env.PAYPAL_SANDBOX_WORKER_EMAIL;
if (!workerEmail) throw new Error("set PAYPAL_SANDBOX_WORKER_EMAIL to a sandbox personal account's email");
const reviewerEmail = process.env.PAYPAL_SANDBOX_REVIEWER_EMAIL || workerEmail;
const useCard = process.argv.includes("--card");

const { db, close } = await createTestDb();
const paypal = loadPayPal({ ...process.env, PAYMENTS_RAIL: "paypal" }, { escrowBalance: () => ledgerEscrowBalance(db) })!;
const concordium = createDevConcordium({ secret: "sandbox-loop-".padEnd(32, "x") });
const desk = createDesk({
  db,
  concordium,
  payments: paypal,
  addresses: { reviewers: { "boreal-ai-reviewer": reviewerEmail } },
});

const usd = (cents: number) => `$${toValue(cents)}`;
const step = (n: number, text: string) => console.log(`\n${n}. ${text}`);
const note = (text: string) => console.log(`   ${text}`);
const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

const [owner] = await db.insert(owners).values({ kind: "individual", verifiedRef: "sandbox-owner" }).returning();
const [agent] = await db
  .insert(agents)
  .values({ ownerId: owner!.id, registryId: "dev-hermes", name: "Hermes", maxTaskBudget: 5_000, maxDailySpend: 50_000 })
  .returning();
const hermes: Caller = { role: "requester", agentId: agent!.id };
const reviewer: Caller = { role: "reviewer", reviewerRef: "boreal-ai-reviewer" };

step(1, "Hermes posts a task and the reviewer screens it");
const { task, quote } = await desk.postTask(hermes, {
  description: "Visit the shop on Taft Avenue, Manila and photograph item X on the shelf with its price tag.",
  acceptanceCriteria: ["Photo shows item X on a shelf", "Price tag is readable"],
  requiredAttributes: [{ attribute: "residency", value: "PH" }],
  resultFormat: "photo",
  budget: 500,
  deadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
});
await desk.screenTask(reviewer, task.id, { outcome: "ok" });
note(`total ${usd(quote.total)} = ${usd(quote.budget)} worker + ${usd(quote.platformFee)} platform + ${usd(quote.reviewFee)} review`);

step(2, "Hermes funds it with PayPal: the money is held, not taken");
let orderId: string;
if (useCard) {
  // PayPal's sandbox test card: the order is ready to authorize with no approval page.
  const order = await paypal.client.request<PayPalOrder>("POST", "/v2/checkout/orders", {
    requestId: `${task.id}:card-order`,
    body: {
      intent: "AUTHORIZE",
      purchase_units: [{ custom_id: task.id, amount: { currency_code: "USD", value: toValue(quote.total) } }],
      payment_source: { card: { number: "4111111111111111", expiry: "2030-12", name: "Sandbox Payer" } },
    },
  });
  orderId = order.id;
  note(`paid with the sandbox test card, order ${orderId}`);
} else {
  const requirement = await paypal.createPaymentRequest(task.id, quote.total);
  orderId = requirement.nonce;
  note(`approve as a sandbox buyer: ${requirement.extra?.approveUrl}`);
  note("waiting for approval…");
  for (let i = 0; ; i++) {
    const order = await paypal.client.request<PayPalOrder>("GET", `/v2/checkout/orders/${orderId}`);
    if (order.status === "APPROVED") break;
    if (i > 120) throw new Error(`order ${orderId} is still ${order.status} after 10 minutes`);
    await sleep(5_000);
  }
}
const funded = await desk.fundTask(hermes, task.id, { confirm: () => paypal.confirmPayment(task.id, { orderId }) });
note(`task is ${funded.status}; PayPal authorization ${funded.fundingHold} holds ${usd(quote.total)}`);

step(3, "A verified worker claims it, submits, and the review passes");
const proof = await desk.workerProofRequest([{ attribute: "residency", value: "PH" }]);
const signedIn = await desk.signInWorker(proof, { pseudonym: "ph-maria", attributes: { residency: "PH" } });
const maria: Caller = { role: "worker", workerId: signedIn.id };
await desk.setPayoutAddress(maria, workerEmail);
await desk.claimTask(maria, task.id);
await desk.submitResult(maria, task.id, { fileUrls: [`submissions/${task.id}/shelf.jpg`] });
await desk.recordVerdict(reviewer, task.id, { outcome: "pass", ruleIds: ["R5.2"], reasoning: "Item and price tag visible" });
const final = await desk.acceptEarly(hermes, task.id);
note(`task is ${final.status}`);

step(4, "The outbox captures the hold, then pays out with PayPal Payouts");
for (let i = 0; i < 3; i++) {
  const sent = await desk.drainOutbox(100);
  if (sent.failed) {
    for (const row of await db.select().from(outbox).where(isNull(outbox.doneAt))) note(`${row.kind} failed: ${row.lastError}`);
    throw new Error("the outbox could not send everything");
  }
}
const payouts = (await db.select().from(ledgerEntries).where(eq(ledgerEntries.taskId, task.id)).orderBy(asc(ledgerEntries.id))).filter(
  (e) => e.toAccount === "worker" || e.toAccount === "reviewer",
);
for (const e of payouts) note(`${e.toAccount} ${usd(e.amount)} ${e.txHash}`);

step(5, "PayPal reports each payout; the outbox applies it to the ledger");
note("(on a deployed app this arrives as a webhook at /api/paypal/webhook; here we read the batch)");
for (const e of payouts) {
  const batchId = e.txHash?.replace(/^paypal:payout:/, "");
  for (let i = 0; batchId && i < 24; i++) {
    const batch = await paypal.client.request<{
      items: { transaction_id?: string; transaction_status: string; payout_item: { sender_item_id: string } }[];
    }>("GET", `/v1/payments/payouts/${batchId}`);
    const item = batch.items[0];
    if (item && item.transaction_status !== "PENDING") {
      const update = payoutUpdateFrom({
        id: `poll-${batchId}`,
        event_type: `PAYMENT.PAYOUTS-ITEM.${item.transaction_status === "SUCCESS" ? "SUCCEEDED" : item.transaction_status}`,
        resource: { transaction_id: item.transaction_id, payout_item: item.payout_item },
      });
      note(`${e.idempotencyKey}: ${item.transaction_status}`);
      if (update) await desk.queuePaymentUpdate(update);
      break;
    }
    await sleep(5_000);
  }
}
await desk.drainOutbox(100);

step(6, "The ledger");
for (const e of await db.select().from(ledgerEntries).where(eq(ledgerEntries.taskId, task.id)).orderBy(asc(ledgerEntries.id))) {
  note(`${e.fromAccount.padEnd(9)} -> ${e.toAccount.padEnd(9)} ${usd(e.amount).padStart(7)}  ${e.status.padEnd(8)} ${e.txHash ?? ""}`);
}
note(`escrow on the ledger: ${usd(await ledgerEscrowBalance(db))}`);
await close();
