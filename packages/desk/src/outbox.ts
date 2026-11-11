import type { Anchor, Concordium, PaymentRail, PaymentRails, Payments, SentTransfer, TransferJournal } from "@boreal/concordium";
import {
  agents,
  and,
  asc,
  type Database,
  eq,
  inArray,
  isNull,
  ledgerEntries,
  lte,
  ne,
  outbox,
  sql,
  taskEvents,
  tasks,
  workers,
} from "@boreal/db";

import { fundingKey } from "./money";

/** Where payouts go for accounts that aren't stored per person. */
export interface PayoutAddresses {
  operating?: string;
  /** Reviewer ref to Concordium account. */
  reviewers?: Record<string, string>;
  /** The same on the PayPal rail: PayPal emails. */
  paypal?: { operating?: string; reviewers?: Record<string, string> };
  /** The same on the NEAR rail: NEAR account ids. */
  near?: { operating?: string; reviewers?: Record<string, string> };
}

type OutboxRow = typeof outbox.$inferSelect;
/** `attempt` is set on a payout an operator sent again after the provider reported the last one failed. */
type Transfer = { ledgerKey: string; to: string; party: string | null; amount: number; attempt?: number };

/**
 * What the provider knows a transfer by. The first send uses the ledger key itself; a resend
 * adds `:r<attempt>`, because a provider (PayPal's sender_batch_id) refuses a key it has seen.
 */
export const sendKey = (ledgerKey: string, attempt = 0) => (attempt > 0 ? `${ledgerKey}:r${attempt}` : ledgerKey);

/** The ledger key and attempt behind a key the provider reported on. */
export function parseSendKey(key: string): { ledgerKey: string; attempt: number } {
  const match = /^(.*):r(\d+)$/.exec(key);
  return match ? { ledgerKey: match[1]!, attempt: Number(match[2]) } : { ledgerKey: key, attempt: 0 };
}
type HoldAction = { taskId: string; hold: string; amount: number; key: string };

/** A payment provider's report on a transfer, such as a PayPal payout webhook. */
export interface PaymentStatusUpdate {
  ledgerKey: string;
  status: "settled" | "failed";
  txHash?: string;
  detail: string;
}

/** What the outbox sends with: each task's money on its own rail, the anchor for event hashes. */
export interface OutboxAdapters {
  /** The rail for items whose task has none recorded (funded before rails were per task). */
  payments: Payments | null;
  rails?: PaymentRails;
  anchor: Anchor | null;
}

/** The rail a task settles on; tasks funded before rails were recorded count as Concordium. */
async function railOfTask(db: Database, taskId: string | null | undefined): Promise<PaymentRail | null> {
  if (!taskId) return null;
  const [row] = await db.select({ rail: tasks.paymentRail }).from(tasks).where(eq(tasks.id, taskId));
  return row?.rail ?? null;
}

async function railOfLedgerKey(db: Database, key: string): Promise<PaymentRail | null> {
  const [row] = await db
    .select({ rail: tasks.paymentRail })
    .from(ledgerEntries)
    .innerJoin(tasks, eq(tasks.id, ledgerEntries.taskId))
    .where(eq(ledgerEntries.idempotencyKey, key));
  return row?.rail ?? null;
}

const LEASE_MS = 5 * 60 * 1000;
const MAX_BACKOFF_MS = 60 * 60 * 1000;

async function addressFor(db: Database, addresses: PayoutAddresses, t: Transfer, rail: PaymentRail | null): Promise<string> {
  let address: string | null | undefined;
  const paypal = rail === "paypal";
  if (t.to === "worker" && t.party) {
    [{ address } = { address: null }] = await db
      .select({ address: paypal ? workers.paypalEmail : rail === "near" ? workers.nearAccount : workers.payoutAddress })
      .from(workers)
      .where(eq(workers.id, t.party));
  } else if (paypal && t.to === "reviewer" && t.party) {
    address = addresses.paypal?.reviewers?.[t.party];
  } else if (paypal && t.to === "operating") {
    address = addresses.paypal?.operating;
  } else if (rail === "near" && (t.to === "reviewer" || t.to === "operating")) {
    // A review fee with no NEAR account for its reviewer (boreal's own reviewer) goes to boreal.
    address = (t.to === "reviewer" && t.party && addresses.near?.reviewers?.[t.party]) || addresses.near?.operating;
  } else if (t.to === "requester" && t.party) {
    // Back to the account the funding came from; the agent's refund address only for tasks
    // funded before the payer was recorded.
    const [funding] = await db
      .select({ payer: tasks.fundingPayer })
      .from(ledgerEntries)
      .innerJoin(tasks, eq(tasks.id, ledgerEntries.taskId))
      .where(eq(ledgerEntries.idempotencyKey, t.ledgerKey));
    address = funding?.payer;
    if (!address) {
      [{ address } = { address: null }] = await db
        .select({ address: agents.refundAddress })
        .from(agents)
        .where(eq(agents.id, t.party));
    }
  } else if (t.to === "reviewer" && t.party) {
    address = addresses.reviewers?.[t.party];
  } else if (t.to === "operating") {
    address = addresses.operating;
  }
  if (!address) throw new Error(`no payout address for ${t.to} ${t.party ?? ""}`.trim());
  return address;
}

/**
 * Sends due outbox items: anchors event hashes and makes payouts and refunds. Rows are
 * leased first, so several workers never send the same item; failures back off and retry.
 */
export async function drainOutbox(
  db: Database,
  adapters: OutboxAdapters,
  options: {
    now: () => Date;
    addresses: PayoutAddresses;
    limit?: number;
    /** Rails whose money must not move now (escrow is short of the ledger); `all` holds every rail. */
    pausedRails?: ReadonlySet<PaymentRail | "all">;
  },
): Promise<{ sent: number; failed: number; held: number }> {
  const at = options.now();
  const leased = await db.transaction(async (tx) => {
    const due = await tx
      .select({ id: outbox.id })
      .from(outbox)
      .where(
        and(
          isNull(outbox.doneAt),
          lte(outbox.nextAttemptAt, at),
          // With no anchor configured (PayPal without Concordium), anchors wait rather than fail.
          adapters.anchor ? undefined : ne(outbox.kind, "anchor"),
        ),
      )
      .orderBy(asc(outbox.id))
      .limit(options.limit ?? 20)
      .for("update", { skipLocked: true });
    if (due.length === 0) return [];
    return tx
      .update(outbox)
      .set({ nextAttemptAt: new Date(at.getTime() + LEASE_MS) })
      .where(inArray(outbox.id, due.map((d) => d.id)))
      .returning();
  });

  let sent = 0;
  let failed = 0;
  let held = 0;
  const paused = options.pausedRails;
  for (const row of leased) {
    // Money on a paused rail waits, untouched, for the next pass; everything else goes on.
    if (paused && paused.size > 0 && (await movesMoneyOn(db, row, paused))) {
      await db.update(outbox).set({ nextAttemptAt: at }).where(eq(outbox.id, row.id));
      held++;
      continue;
    }
    try {
      await send(db, adapters, options.addresses, row, options.now());
      await db.update(outbox).set({ doneAt: options.now(), lastError: null }).where(eq(outbox.id, row.id));
      sent++;
    } catch (error) {
      failed++;
      const attempts = row.attempts + 1;
      const backoff = Math.min(MAX_BACKOFF_MS, 2 ** attempts * 60 * 1000);
      await db
        .update(outbox)
        .set({
          attempts,
          nextAttemptAt: new Date(options.now().getTime() + backoff),
          lastError: error instanceof Error ? error.message : String(error),
        })
        .where(eq(outbox.id, row.id));
    }
  }
  return { sent, failed, held };
}

/** Whether sending this row would move money on one of the paused rails. */
async function movesMoneyOn(db: Database, row: OutboxRow, paused: ReadonlySet<PaymentRail | "all">): Promise<boolean> {
  let rail: PaymentRail | null;
  if (row.kind === "payout" || row.kind === "refund") rail = await railOfLedgerKey(db, (row.payload as Transfer).ledgerKey);
  else if (row.kind === "capture" || row.kind === "release") rail = await railOfTask(db, (row.payload as HoldAction).taskId);
  else return false;
  // Tasks funded before rails were recorded count as Concordium, as in the escrow comparison.
  return paused.has("all") || paused.has(rail ?? "concordium");
}

async function send(
  db: Database,
  { payments, rails, anchor }: OutboxAdapters,
  addresses: PayoutAddresses,
  row: OutboxRow,
  at: Date,
): Promise<void> {
  const needPayments = (rail: PaymentRail | null) => {
    const found = (rail && rails?.[rail]) || (rail ? null : payments);
    if (!found) throw new Error(`the ${rail ?? "default"} payment rail is not configured`);
    return found;
  };
  switch (row.kind) {
    case "anchor": {
      const { eventId, hash } = row.payload as { eventId: number; hash: string };
      if (!anchor) throw new Error("anchoring is not configured");
      const { txHash } = await anchor.anchor(hash);
      await db.update(taskEvents).set({ anchorTxHash: txHash }).where(eq(taskEvents.id, eventId));
      return;
    }
    case "payout":
    case "refund": {
      const transfer = row.payload as Transfer;
      const rail = await railOfLedgerKey(db, transfer.ledgerKey);
      // A PayPal review fee with no payee set is boreal's own (boreal reviewed it): it already
      // sits in boreal's PayPal account from the capture, so record it there instead of sending.
      if (rail === "paypal" && transfer.to === "reviewer" && !(transfer.party && addresses.paypal?.reviewers?.[transfer.party])) {
        await db
          .update(ledgerEntries)
          .set({ status: "settled", txHash: "paypal:kept-by-boreal", updatedAt: at })
          .where(eq(ledgerEntries.idempotencyKey, transfer.ledgerKey));
        return;
      }
      const to = await addressFor(db, addresses, transfer, rail);
      const { txHash } = await needPayments(rail).sponsoredTransfer({
        to,
        amount: transfer.amount,
        idempotencyKey: sendKey(transfer.ledgerKey, transfer.attempt),
      });
      await db
        .update(ledgerEntries)
        .set({ status: "settled", txHash, updatedAt: at })
        .where(eq(ledgerEntries.idempotencyKey, transfer.ledgerKey));
      return;
    }
    case "capture":
    case "release": {
      const action = row.payload as HoldAction;
      const holds = needPayments(await railOfTask(db, action.taskId)).holds;
      if (!holds) throw new Error("this payment rail can't capture or release holds");
      let txHash: string;
      if (row.kind === "capture") {
        ({ txHash } = await holds.capture(action.hold, action.amount, action.key));
      } else {
        await holds.release(action.hold, action.key);
        txHash = `released:${action.hold}`;
      }
      await settleHold(db, action.taskId, txHash, at, addresses);
      return;
    }
    case "reconcile": {
      const update = row.payload as PaymentStatusUpdate;
      // The provider reports on the key it was sent, which names the attempt after a resend.
      const { ledgerKey, attempt } = parseSendKey(update.ledgerKey);
      const [latest] = await db
        .select({ attempt: sql<number>`coalesce(max((${outbox.payload}->>'attempt')::int), 0)::int` })
        .from(outbox)
        .where(and(eq(outbox.kind, "payout"), sql`${outbox.payload}->>'ledgerKey' = ${ledgerKey}`));
      // A late report about an attempt that has since been sent again says nothing about the new one.
      if (attempt < (latest?.attempt ?? 0)) return;
      const [entry] = await db
        .update(ledgerEntries)
        .set({ status: update.status, ...(update.txHash ? { txHash: update.txHash } : {}), updatedAt: at })
        .where(eq(ledgerEntries.idempotencyKey, ledgerKey))
        .returning({ amount: ledgerEntries.amount, toAccount: ledgerEntries.toAccount });
      if (!entry) throw new Error(`no ledger entry ${ledgerKey}`);
      // The money is back in escrow; sending it again is an operator's call, so it's loud.
      if (update.status === "failed") {
        console.error(`[outbox] ${entry.toAccount} transfer ${ledgerKey} of ${entry.amount} failed: ${update.detail}`);
      }
      return;
    }
    case "webhook":
      // No webhook subscribers yet; nothing to deliver.
      return;
  }
}

/**
 * Journals payouts and refunds on their outbox row (`payload.sent`), so a retry after a crash
 * between sending and recording knows the transaction it already sent.
 */
export function outboxTransferJournal(db: Database): TransferJournal {
  const row = (key: string) =>
    and(inArray(outbox.kind, ["payout", "refund"]), sql`${outbox.payload}->>'ledgerKey' = ${key}`);
  return {
    async find(key) {
      const [found] = await db.select({ payload: outbox.payload }).from(outbox).where(row(key)).limit(1);
      return (found?.payload as { sent?: SentTransfer } | undefined)?.sent ?? null;
    },
    async save(key, sent) {
      const updated = await db
        .update(outbox)
        .set({ payload: sql`${outbox.payload} || ${JSON.stringify({ sent })}::jsonb` })
        .where(row(key))
        .returning({ id: outbox.id });
      // Never send a transfer that isn't journaled.
      if (updated.length !== 1) throw new Error(`no outbox row to journal transfer ${key}`);
    },
  };
}

/**
 * After a hold is captured or released, in one transaction: the funding entry settles, the
 * entries the hold itself settled (refunds back to the payer, boreal's fee kept in its own
 * account) settle with it, and payouts to workers and reviewers are queued. A review fee
 * for a reviewer with no PayPal email set (boreal reviewing itself) also stays in boreal's
 * account, like the platform fee. Only the first run does any of this, so a repeated
 * capture never queues a payout twice.
 */
async function settleHold(db: Database, taskId: string, txHash: string, at: Date, addresses: PayoutAddresses): Promise<void> {
  await db.transaction(async (tx) => {
    const [funding] = await tx
      .update(ledgerEntries)
      .set({ status: "settled", txHash, updatedAt: at })
      .where(and(eq(ledgerEntries.idempotencyKey, fundingKey(taskId)), eq(ledgerEntries.status, "pending")))
      .returning({ id: ledgerEntries.id });
    if (!funding) return;

    const pending = await tx
      .select()
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.taskId, taskId), eq(ledgerEntries.fromAccount, "escrow"), eq(ledgerEntries.status, "pending")));
    const keptByBoreal = (e: (typeof pending)[number]) =>
      e.toAccount === "reviewer" && !(e.party && addresses.paypal?.reviewers?.[e.party]);
    const inPlace = pending.filter((e) => e.toAccount === "requester" || e.toAccount === "operating" || keptByBoreal(e));
    if (inPlace.length > 0) {
      await tx
        .update(ledgerEntries)
        .set({ status: "settled", txHash, updatedAt: at })
        .where(inArray(ledgerEntries.id, inPlace.map((e) => e.id)));
    }
    const payouts = pending.filter((e) => e.toAccount === "worker" || (e.toAccount === "reviewer" && !keptByBoreal(e)));
    if (payouts.length > 0) {
      await tx.insert(outbox).values(
        payouts.map((e) => ({
          kind: "payout" as const,
          payload: { ledgerKey: e.idempotencyKey, to: e.toAccount, party: e.party, amount: e.amount },
          nextAttemptAt: at,
          createdAt: at,
        })),
      );
    }
  });
}

/** Queues a provider's report on a transfer; the outbox applies it to the ledger. */
export async function queuePaymentUpdate(db: Database, update: PaymentStatusUpdate, at: Date): Promise<void> {
  await db.insert(outbox).values({ kind: "reconcile", payload: update, nextAttemptAt: at, createdAt: at });
}

/** What escrow should hold on-chain: money settled in, minus money settled out. */
export async function ledgerEscrowBalance(db: Database, rail?: PaymentRail): Promise<number> {
  const [row] = await db
    .select({
      balance: sql<number>`coalesce(sum(case
        when ${ledgerEntries.toAccount} = 'escrow' then ${ledgerEntries.amount}
        when ${ledgerEntries.fromAccount} = 'escrow' then -${ledgerEntries.amount}
        else 0 end), 0)::int`,
    })
    .from(ledgerEntries)
    .innerJoin(tasks, eq(tasks.id, ledgerEntries.taskId))
    // Test money never reaches the chain, so it stays out of the escrow comparison. With a
    // rail, only that rail's tasks (unrecorded rails count as Concordium).
    .where(
      and(
        eq(ledgerEntries.status, "settled"),
        eq(tasks.test, false),
        rail ? sql`coalesce(${tasks.paymentRail}, 'concordium') = ${rail}` : undefined,
      ),
    );
  return row?.balance ?? 0;
}

/**
 * Money that may already have left escrow without the ledger saying so yet: payouts and refunds
 * journaled as sent (`payload.sent`) whose outbox row isn't done. A crash between sending and
 * recording leaves exactly this, and the retry that settles it must be allowed to run.
 */
export async function inFlightTransfers(db: Database, rail?: PaymentRail): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum((${outbox.payload}->>'amount')::int), 0)::int` })
    .from(outbox)
    .innerJoin(ledgerEntries, sql`${ledgerEntries.idempotencyKey} = ${outbox.payload}->>'ledgerKey'`)
    .innerJoin(tasks, eq(tasks.id, ledgerEntries.taskId))
    .where(
      and(
        inArray(outbox.kind, ["payout", "refund"]),
        isNull(outbox.doneAt),
        sql`${outbox.payload} ? 'sent'`,
        ne(ledgerEntries.status, "settled"),
        rail ? sql`coalesce(${tasks.paymentRail}, 'concordium') = ${rail}` : undefined,
      ),
    );
  return row?.total ?? 0;
}

/**
 * Compares the escrow balance with the ledger. `short` is how much escrow is missing beyond
 * what is in flight: any of it must pause that rail's money. More than the ledger expects
 * (`gap` above zero) is money nobody has matched to a task yet, such as a transfer whose
 * `fund_task` hasn't come: it is reported, and never a reason to stop paying people.
 */
export async function reconcileEscrow(
  db: Database,
  payments: Payments,
  rail?: PaymentRail,
): Promise<{ expected: number; actual: number; gap: number; inFlight: number; short: number }> {
  const [expected, actual, inFlight] = await Promise.all([ledgerEscrowBalance(db, rail), payments.escrowBalance(), inFlightTransfers(db, rail)]);
  const gap = actual - expected;
  return { expected, actual, gap, inFlight, short: Math.max(0, -gap - inFlight) };
}

/**
 * Reads `OPERATING_ACCOUNT_ADDRESS` and `REVIEWER_ADDRESSES` ("ref=address,ref=address"), their
 * PayPal counterparts, and `NEAR_OPERATING_ACCOUNT`.
 */
export function addressesFromEnv(env: Record<string, string | undefined> = process.env): PayoutAddresses {
  const reviewers = Object.fromEntries(
    (env.REVIEWER_ADDRESSES ?? "")
      .split(",")
      .map((pair) => pair.split("=").map((part) => part.trim()))
      .filter((pair): pair is [string, string] => pair.length === 2 && !!pair[0] && !!pair[1]),
  );
  const paypalReviewers = Object.fromEntries(
    (env.PAYPAL_REVIEWER_EMAILS ?? "")
      .split(",")
      .map((pair) => pair.split("=").map((part) => part.trim()))
      .filter((pair): pair is [string, string] => pair.length === 2 && !!pair[0] && !!pair[1]),
  );
  return {
    operating: env.OPERATING_ACCOUNT_ADDRESS || undefined,
    reviewers,
    paypal: { operating: env.PAYPAL_OPERATING_EMAIL || undefined, reviewers: paypalReviewers },
    near: { operating: env.NEAR_OPERATING_ACCOUNT || undefined },
  };
}
