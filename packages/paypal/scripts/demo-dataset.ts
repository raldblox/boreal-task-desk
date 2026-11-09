// The demo dataset for the admin money console (`pnpm dev:demo`): 30 days of plausible sandbox
// activity, generated through the desk's own commands on a simulated clock that ends now.
// Agents, people and a NEAR market buyer post tasks; workers and agent workers claim and submit;
// reviews pass and fail, a few are disputed; PayPal holds are captured or released and payouts
// sent (through the real PayPal rail code against an in-memory PayPal), with a few payouts
// returned by PayPal, a few stuck behind PayPal outages, and a burst of cancellations yesterday.
//
// It writes only to a local database: it refuses anything but localhost, and the stand-in
// Concordium adapters it needs refuse to load otherwise too.

import { quoteFees } from "@boreal/core";
import { createDevConcordium, type Payments, signDevPayment } from "@boreal/concordium";
import { agents, createDb, eq, owners, workers } from "@boreal/db";
import { type Caller, createDesk, ledgerEscrowBalance } from "@boreal/desk";

import { createFakePayPal } from "../src/fake-paypal";
import { createPayPalPayments } from "../src/payments";
import { payoutUpdateFrom } from "../src/webhooks";

const url = process.env.DATABASE_URL ?? "";
if (!/@(127\.0\.0\.1|localhost)[:/]/.test(url)) throw new Error("demo-dataset writes only to a local database; run `pnpm dev:demo`");
const secret = process.env.DEV_CONCORDIUM_SECRET;
if (!secret) throw new Error("demo-dataset needs DEV_CONCORDIUM_SECRET; run `pnpm dev:demo`");

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const END = Date.now();
const START = END - 30 * DAY;

// A seeded generator, so every demo database tells the same story.
let seed = 20261112;
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const between = (lo: number, hi: number) => lo + rand() * (hi - lo);
const chance = (p: number) => rand() < p;
const pick = <T>(items: readonly T[]) => items[Math.floor(rand() * items.length)]!;
function weighted<T>(items: readonly (readonly [T, number])[]): T {
  let r = rand() * items.reduce((s, [, w]) => s + w, 0);
  for (const [item, w] of items) if ((r -= w) <= 0) return item;
  return items[0]![0];
}
/** A long-tailed wait, like time to claim: mostly short, sometimes hours. */
const tail = (median: number, spread = 0.9) => median * Math.exp(spread * (rand() + rand() + rand() - 1.5) * 2);

let clock = new Date(START);
const now = () => clock;
const db = createDb();

// --- Rails ----------------------------------------------------------------------------
// PayPal: boreal's real PayPal rail code, against an in-memory PayPal. Some payouts hit a
// PayPal outage (503) near the end, so they're left retrying.
const paypal = createFakePayPal();
const outage = new Set<string>();
const paypalFetch: typeof fetch = async (input, init) => {
  if (String(input).includes("/v1/payments/payouts") && init?.method === "POST") {
    const batch = (JSON.parse(String(init.body)) as { sender_batch_header?: { sender_batch_id?: string } }).sender_batch_header?.sender_batch_id;
    if (batch && outage.has(batch)) {
      return Response.json({ name: "SERVICE_UNAVAILABLE", message: "Payouts is temporarily unavailable; try again later" }, { status: 503 });
    }
  }
  return paypal.fetch(input, init);
};
const paypalRail = createPayPalPayments({
  clientId: "demo",
  clientSecret: "demo",
  fetch: paypalFetch,
  now,
  returnUrl: "http://localhost:3000/paypal/approved",
  cancelUrl: "http://localhost:3000/paypal/cancelled",
  escrowBalance: () => ledgerEscrowBalance(db, "paypal"),
});
const concordium = createDevConcordium({ secret, now, escrowBalance: () => ledgerEscrowBalance(db, "concordium") });
// NEAR: USDC transfers that always land; the demo needs no chain.
let nearTx = 0;
const nearRail: Payments = {
  createPaymentRequest: () => Promise.reject(new Error("not used by the demo")),
  confirmPayment: () => Promise.reject(new Error("not used by the demo")),
  sponsoredTransfer: async () => ({ txHash: `near:demo${(++nearTx).toString(16).padStart(8, "0")}` }),
  escrowBalance: () => ledgerEscrowBalance(db, "near"),
};

const desk = createDesk({
  db,
  now,
  concordium,
  payments: paypalRail,
  rails: { paypal: paypalRail, concordium: concordium.payments, near: nearRail },
  addresses: {
    operating: "dev-acct-boreal",
    reviewers: { "boreal-ai-reviewer": "dev-acct-reviewer" },
    near: { operating: "boreal-demo.near" },
  },
});
const reviewer: Caller = { role: "reviewer", reviewerRef: "boreal-ai-reviewer" };
const panel: Caller = { role: "panel", reviewerRef: "boreal-panel" };

// --- Scheduler ------------------------------------------------------------------------
// Every step runs at its simulated time, in order. Steps due after now never run: that is
// how recent tasks end up still open, claimed, under review or with payouts on their way.
interface Job {
  at: number;
  seq: number;
  run: () => Promise<void>;
}
const queue: Job[] = [];
let seq = 0;
const at = (when: number, run: () => Promise<void>) => {
  if (when <= END) queue.push({ at: when, seq: seq++, run });
};
let refusedSteps = 0;
const attempt = async (run: () => Promise<unknown>) => {
  try {
    await run();
  } catch {
    refusedSteps++; // the desk refused a step (a race with a timer, a cap): the story moves on
  }
};
const drainSoon = (from: number) => {
  for (const delay of [1, 3, 6]) at(from + delay * MIN, () => attempt(() => desk.drainOutbox(50)));
};

// --- Requesters -----------------------------------------------------------------------
type Rail = "paypal" | "concordium" | "near";
interface Requester {
  caller: Caller;
  name: string;
  rails: readonly (readonly [Rail, number])[];
  budgets: readonly [number, number];
  weight: number;
  vaulted: boolean;
}

async function agentRequester(name: string, kind: "agent" | "market", options: { badge: boolean; rails: Requester["rails"]; budgets: Requester["budgets"]; weight: number }) {
  const [owner] = await db.insert(owners).values({ kind: kind === "market" ? "business" : "individual", verifiedRef: `demo-owner-${name}`, createdAt: clock }).returning();
  const [agent] = await db
    .insert(agents)
    .values({
      ownerId: owner!.id,
      registryId: `demo-${name}`,
      name,
      kind,
      maxTaskBudget: 5_000,
      maxDailySpend: 50_000,
      refundAddress: `dev-acct-${name}`,
      badgeVerifiedAt: options.badge ? clock : null,
      badgeNetwork: options.badge ? "testnet" : null,
      createdAt: clock,
      updatedAt: clock,
    })
    .returning();
  return { caller: { role: "requester", agentId: agent!.id } as Caller, name, vaulted: false, ...options };
}

const PEOPLE = ["PH", "PH", "PH", "PH", "ID", "VN", "PH", "MY", "PH", "TH", "PH", "PH", "ID", "PH", "VN", "PH", "PH", "MY", "PH", "PH", "PH", "ID", "PH", "PH"];

async function main() {
  const requesters: Requester[] = [
    await agentRequester("hermes-research", "agent", { badge: true, rails: [["paypal", 1]], budgets: [300, 2_500], weight: 30 }),
    await agentRequester("sable-shopper", "agent", { badge: true, rails: [["paypal", 0.8], ["concordium", 0.2]], budgets: [200, 1_800], weight: 20 }),
    await agentRequester("atlas-procurement", "agent", { badge: true, rails: [["concordium", 0.7], ["paypal", 0.3]], budgets: [800, 4_500], weight: 15 }),
    await agentRequester("kite-travel", "agent", { badge: true, rails: [["paypal", 1]], budgets: [150, 900], weight: 9 }),
    await agentRequester("pixel-scout", "agent", { badge: false, rails: [["paypal", 1]], budgets: [100, 800], weight: 4 }),
    await agentRequester("near-market", "market", { badge: true, rails: [["near", 1]], budgets: [200, 1_500], weight: 15 }),
  ];

  // Workers: people with Concordium ID (some also post their own tasks), and agent workers on NEAR.
  const people: { caller: Caller; country: string; busyUntil: number }[] = [];
  for (const [i, country] of PEOPLE.entries()) {
    clock = new Date(START - (PEOPLE.length - i) * HOUR);
    const request = await desk.workerProofRequest([]);
    const signedIn = await desk.signInWorker(request, { pseudonym: `ccdid:demo${(i * 7919 + 104729).toString(16)}`, attributes: { residency: country, age_over_18: "true" } }, `dev-acct-w${i}`);
    const caller: Caller = { role: "worker", workerId: signedIn.id };
    await desk.setPayoutAddress(caller, `worker${i}@personal.example.com`, "paypal");
    await desk.setPayoutAddress(caller, `demo-w${i}.testnet`, "near", { guided: chance(0.3) });
    people.push({ caller, country, busyUntil: 0 });
  }
  for (const i of [3, 8, 15, 19, 22]) {
    const agent = await desk.personalRequester((people[i]!.caller as { workerId: string }).workerId);
    requesters.push({ caller: { role: "requester", agentId: agent.id }, name: agent.name, rails: [["paypal", 1]], budgets: [200, 1_500], weight: 3, vaulted: false });
  }
  const agentWorkers: { caller: Caller; busyUntil: number }[] = [];
  for (const name of ["scout-7.near", "ledgerbot.near", "fieldkit.near"]) {
    const { workerId } = await desk.signInAgentWorker(name, clock);
    agentWorkers.push({ caller: { role: "worker", workerId }, busyUntil: 0 });
  }

  const JOBS = [
    { description: "Photograph the 500 ml Nature's Spring bottles on the shelf at the 7-Eleven on Taft Avenue, Malate, with the price tag, and say how many are in stock.", criteria: ["Bottles and price tag are readable", "Stock count given"], format: "photo", local: true },
    { description: "Before a deposit is paid, confirm the supplier operates a warehouse at the given Valenzuela address: photograph the storefront with its business sign and street number.", criteria: ["Business sign matches the supplier's name", "Street number visible", "Says whether it is operating"], format: "photo", local: true },
    { description: "Read this Tagalog notice and summarise in English what it asks residents to do and by when.", criteria: ["Summary names the action", "Summary gives the deadline"], format: "text", local: true },
    { description: "Call the clinic and confirm whether they take walk-in patients on Saturdays.", criteria: ["Answer is yes or no", "Gives the hours if yes"], format: "text", local: true },
    { description: "From the public road, photograph construction progress at the pre-selling project on the given lot in Pasig, for a buyer paying instalments from abroad.", criteria: ["Whole building front in frame", "Project signboard readable", "Photo taken today"], format: "photo", local: true },
    { description: "Verify that the listed apartment building exists at the address and photograph its entrance.", criteria: ["Entrance and street number visible"], format: "photo", local: false },
    { description: "Transcribe the handwritten receipt in the attached photo into a table of items and amounts.", criteria: ["Every line item transcribed", "Total matches the receipt"], format: "text", local: false },
    { description: "Check the price per 40 kg bag of Portland cement at the hardware store on the given Quezon City street, and whether 50 bags are available this week.", criteria: ["Price per bag given", "Availability answered", "Photo of the price board"], format: "photo", local: true },
  ] as const;

  let posted = 0;
  const owner = new Map<string, Caller>();
  const flakyFinal = { from: END - 7 * HOUR, to: END - 2.5 * HOUR, left: 3 };
  let returned = 0;

  /** One task's whole life, scheduled step by step from its posting time. */
  function lifecycle(t0: number, requester: Requester, burst = false) {
    at(t0, async () => {
      const job = pick(JOBS);
      const rail = weighted(requester.rails);
      const budget = Math.round(between(...requester.budgets) / 25) * 25;
      const forAgents = rail === "near" && job.format === "text" && chance(0.7);
      const deadlineMs = t0 + between(30, 96) * HOUR;
      let id: string;
      try {
        const out = await desk.postTask(requester.caller, {
          description: job.description,
          acceptanceCriteria: [...job.criteria],
          requiredAttributes: job.local && !forAgents && chance(0.6) ? [{ attribute: "residency", value: "PH" }] : [],
          resultFormat: job.format,
          budget,
          deadline: new Date(deadlineMs).toISOString(),
          ...(forAgents ? { fulfillers: "people_or_agents" } : {}),
        });
        id = out.task.id;
        owner.set(id, requester.caller);
        posted++;
      } catch {
        refusedSteps++;
        return;
      }
      const total = quoteFees(budget).total;

      const screenAt = t0 + between(2, 20) * MIN;
      if (chance(0.03)) {
        at(screenAt, () => attempt(() => desk.screenTask(reviewer, id, { outcome: "refused", ruleIds: ["R1.3"], reasoning: "Asks the worker to enter private property" })));
        return;
      }
      at(screenAt, () => attempt(() => desk.screenTask(reviewer, id, { outcome: "ok" })));
      if (chance(0.04)) return; // screened, never funded
      const fundAt = screenAt + tail(25 * MIN);
      at(fundAt, () => attempt(() => fund(requester, id, rail, total)));

      // Kite's bad deploy yesterday: it cancels what it just funded.
      if (burst || chance(0.03)) {
        at(fundAt + (burst ? between(20, 90) * MIN : between(1, 8) * HOUR), () => attempt(() => desk.cancelTask(requester.caller, id)).then(() => drainSoon(clock.getTime())));
        return;
      }
      if (chance(0.025)) {
        at(deadlineMs + MIN, () => attempt(() => desk.expireDeadlines()).then(() => drainSoon(clock.getTime())));
        return;
      }
      claimLoop(id, rail, forAgents, fundAt + tail(1.6 * HOUR), deadlineMs);
    });
  }

  async function fund(requester: Requester, id: string, rail: Rail, total: number) {
    if (rail === "near") {
      await desk.fundTask(requester.caller, id, { txHash: `near:fund-${id.slice(0, 8)}`, amount: total }, { rail: "near" });
    } else if (rail === "concordium") {
      const requirement = await concordium.payments.createPaymentRequest(id, total);
      const payment = { requirement, signature: signDevPayment(secret!, requirement) };
      await desk.fundTask(requester.caller, id, { confirm: () => concordium.payments.confirmPayment(id, payment) }, { rail: "concordium" });
    } else if (requester.vaulted) {
      // The owner saved PayPal at the first checkout: later tasks fund with no approval page.
      await desk.fundTask(requester.caller, id, { vault: true }, { rail: "paypal" });
    } else {
      const requirement = await paypalRail.createPaymentRequest(id, total);
      paypal.approve(requirement.nonce);
      await desk.fundTask(requester.caller, id, { confirm: () => paypalRail.confirmPayment(id, { orderId: requirement.nonce }) }, { rail: "paypal" });
      const [agent] = await db.select({ vault: agents.paymentVaultId, kind: agents.kind }).from(agents).where(eq(agents.id, (requester.caller as { agentId: string }).agentId));
      requester.vaulted = !!agent?.vault && agent.kind === "agent";
    }
  }

  function claimLoop(id: string, rail: Rail, forAgents: boolean, when: number, deadline: number) {
    at(when, async () => {
      if (when >= deadline) return;
      const pool = forAgents && chance(0.75) ? agentWorkers : people;
      const free = pool.filter((w) => w.busyUntil <= when);
      if (free.length === 0) return claimLoop(id, rail, forAgents, when + 30 * MIN, deadline);
      const worker = pick(free);
      try {
        await desk.claimTask(worker.caller, id);
      } catch {
        // Not eligible (an attribute, their own task): someone else tries a little later.
        return claimLoop(id, rail, forAgents, when + between(10, 40) * MIN, deadline);
      }
      if (chance(0.03)) {
        // Claimed and abandoned: the claim expires and the task opens again.
        worker.busyUntil = when + 4 * HOUR;
        at(when + 4 * HOUR + MIN, () => attempt(() => desk.expireClaims()));
        return claimLoop(id, rail, forAgents, when + 4 * HOUR + tail(HOUR), deadline);
      }
      const submitAt = when + between(0.4, 3.4) * HOUR;
      worker.busyUntil = submitAt;
      at(submitAt, () =>
        attempt(() => desk.submitResult(worker.caller, id, { text: "Done: see the notes for what I found.", fileUrls: [`submissions/${id}/result.jpg`] })),
      );
      review(id, rail, worker.caller, submitAt + tail(14 * MIN, 0.6));
    });
  }

  function review(id: string, rail: Rail, worker: Caller, when: number) {
    const pass = chance(0.83);
    at(when, () =>
      attempt(() =>
        desk.recordVerdict(reviewer, id, pass
          ? { outcome: "pass", ruleIds: ["R5.2"], reasoning: "Every criterion is met and the result matches the task." }
          : { outcome: "fail", ruleIds: [pick(["R4.1", "R4.2", "R4.3"])], reasoning: "A criterion is not met: the photo doesn't show what the task asks for." }),
      ),
    );
    if (!pass && chance(0.35)) {
      const disputeAt = when + between(1, 20) * HOUR;
      at(disputeAt, () => attempt(() => desk.disputeVerdict(worker, id, "The photo shows the price tag; it's at the bottom right of the shelf.")));
      const overturn = chance(0.5);
      const decideAt = disputeAt + between(4, 30) * HOUR;
      at(decideAt, () =>
        attempt(() =>
          desk.decideDispute(panel, id, overturn
            ? { outcome: "pass", ruleIds: ["R5.2"], reasoning: "On a second look the tag is readable; the result meets the criteria." }
            : { outcome: "fail", ruleIds: ["R4.2"], reasoning: "The panel agrees the tag isn't readable." }),
        ).then(() => payouts(id, rail, decideAt)),
      );
      return;
    }
    if (pass && chance(0.65)) {
      const acceptAt = when + tail(1.5 * HOUR);
      at(acceptAt, async () => {
        await attempt(() => desk.acceptEarly(owner.get(id)!, id));
        payouts(id, rail, acceptAt);
      });
      return;
    }
    const closeAt = when + 48 * HOUR + MIN;
    at(closeAt, () => attempt(() => desk.closeObjectionWindows()).then(() => payouts(id, rail, closeAt)));
  }

  function payouts(id: string, rail: Rail, final: number) {
    if (rail === "paypal" && final >= flakyFinal.from && final <= flakyFinal.to && flakyFinal.left > 0) {
      flakyFinal.left--;
      outage.add(`${id}:pay-worker`);
    }
    drainSoon(final);
    // Now and then PayPal returns a payout a few hours later (the receiver couldn't take it).
    if (rail === "paypal" && final > END - 9 * DAY && returned < 5 && chance(0.09)) {
      returned++;
      const when = final + between(2, 10) * HOUR;
      at(when, async () => {
        const update = payoutUpdateFrom({
          id: `WH-DEMO-${id.slice(0, 8)}`,
          event_type: pick(["PAYMENT.PAYOUTS-ITEM.RETURNED", "PAYMENT.PAYOUTS-ITEM.FAILED", "PAYMENT.PAYOUTS-ITEM.UNCLAIMED"]),
          resource: { payout_item: { sender_item_id: `${id}:pay-worker` } },
        });
        if (update) await attempt(() => desk.queuePaymentUpdate(update));
        drainSoon(when);
      });
    }
  }

  // Posting volume grows over the month, busier on weekdays and in Manila's daytime.
  for (let day = 0; day <= 30; day++) {
    // Midnight UTC is 8am in Manila; posts due after now are simply never made.
    const dayStart = Math.floor((START + day * DAY) / DAY) * DAY;
    const weekday = new Date(dayStart + 8 * HOUR).getUTCDay();
    const n = Math.round((2 + day * 0.28) * (weekday === 0 || weekday === 6 ? 0.7 : 1.1) + between(-1, 2));
    for (let i = 0; i < n; i++) {
      const manilaHour = weighted([[8, 1], [10, 2], [12, 2], [14, 3], [16, 2], [19, 2], [22, 1]] as const);
      const t0 = dayStart + (manilaHour - 8) * HOUR + between(0, 120) * MIN;
      lifecycle(t0, weighted(requesters.map((r) => [r, r.weight] as const)));
    }
  }
  const kite = requesters.find((r) => r.name === "kite-travel")!;
  for (let i = 0; i < 9; i++) lifecycle(END - 30 * HOUR + i * 35 * MIN, kite, true);
  // In the last hours the outbox runs every 10 minutes, as the monitor does, so retries show.
  for (let t = END - 8 * HOUR; t < END; t += 10 * MIN) at(t, () => attempt(() => desk.drainOutbox(50)));

  while (queue.length > 0) {
    queue.sort((a, b) => a.at - b.at || a.seq - b.seq);
    const job = queue.shift()!;
    clock = new Date(job.at);
    await job.run();
  }

  const people_ = await db.select({ n: workers.id }).from(workers);
  console.log(
    `[demo] ${posted} tasks over 30 days from ${requesters.length} requesters, ${people_.length} workers; ${refusedSteps} steps refused by the desk along the way (as they would be live)`,
  );
}

await main();
process.exit(0);
