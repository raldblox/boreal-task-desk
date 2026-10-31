import type { Concordium, SentTransfer, TransferJournal } from "@boreal/concordium";
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
  outbox,
  sql,
  taskEvents,
  tasks,
  workers,
} from "@boreal/db";

/** Where payouts go for accounts that aren't stored per person. */
export interface PayoutAddresses {
  operating?: string;
  /** Reviewer ref to Concordium account. */
  reviewers?: Record<string, string>;
}

type OutboxRow = typeof outbox.$inferSelect;
type Transfer = { ledgerKey: string; to: string; party: string | null; amount: number };

const LEASE_MS = 5 * 60 * 1000;
const MAX_BACKOFF_MS = 60 * 60 * 1000;

async function addressFor(db: Database, addresses: PayoutAddresses, t: Transfer): Promise<string> {
  let address: string | null | undefined;
  if (t.to === "worker" && t.party) {
    [{ address } = { address: null }] = await db
      .select({ address: workers.payoutAddress })
      .from(workers)
      .where(eq(workers.id, t.party));
  } else if (t.to === "requester" && t.party) {
    [{ address } = { address: null }] = await db
      .select({ address: agents.refundAddress })
      .from(agents)
      .where(eq(agents.id, t.party));
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
  concordium: Concordium,
  options: { now: () => Date; addresses: PayoutAddresses; limit?: number },
): Promise<{ sent: number; failed: number }> {
  const at = options.now();
  const leased = await db.transaction(async (tx) => {
    const due = await tx
      .select({ id: outbox.id })
      .from(outbox)
      .where(and(isNull(outbox.doneAt), lte(outbox.nextAttemptAt, at)))
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
  for (const row of leased) {
    try {
      await send(db, concordium, options.addresses, row, options.now());
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
  return { sent, failed };
}

async function send(
  db: Database,
  concordium: Concordium,
  addresses: PayoutAddresses,
  row: OutboxRow,
  at: Date,
): Promise<void> {
  switch (row.kind) {
    case "anchor": {
      const { eventId, hash } = row.payload as { eventId: number; hash: string };
      const { txHash } = await concordium.anchor.anchor(hash);
      await db.update(taskEvents).set({ anchorTxHash: txHash }).where(eq(taskEvents.id, eventId));
      return;
    }
    case "payout":
    case "refund": {
      const transfer = row.payload as Transfer;
      const to = await addressFor(db, addresses, transfer);
      const { txHash } = await concordium.payments.sponsoredTransfer({
        to,
        amount: transfer.amount,
        idempotencyKey: transfer.ledgerKey,
      });
      await db
        .update(ledgerEntries)
        .set({ status: "settled", txHash, updatedAt: at })
        .where(eq(ledgerEntries.idempotencyKey, transfer.ledgerKey));
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

/** What escrow should hold on-chain: money settled in, minus money settled out. */
export async function ledgerEscrowBalance(db: Database): Promise<number> {
  const [row] = await db
    .select({
      balance: sql<number>`coalesce(sum(case
        when ${ledgerEntries.toAccount} = 'escrow' then ${ledgerEntries.amount}
        when ${ledgerEntries.fromAccount} = 'escrow' then -${ledgerEntries.amount}
        else 0 end), 0)::int`,
    })
    .from(ledgerEntries)
    .innerJoin(tasks, eq(tasks.id, ledgerEntries.taskId))
    // Test money never reaches the chain, so it stays out of the escrow comparison.
    .where(and(eq(ledgerEntries.status, "settled"), eq(tasks.test, false)));
  return row?.balance ?? 0;
}

/** Compares the on-chain escrow balance with the ledger. Any gap must pause money movement. */
export async function reconcileEscrow(
  db: Database,
  concordium: Concordium,
): Promise<{ expected: number; actual: number; gap: number }> {
  const [expected, actual] = await Promise.all([ledgerEscrowBalance(db), concordium.payments.escrowBalance()]);
  return { expected, actual, gap: actual - expected };
}

/** Reads `OPERATING_ACCOUNT_ADDRESS` and `REVIEWER_ADDRESSES` ("ref=address,ref=address"). */
export function addressesFromEnv(env: Record<string, string | undefined> = process.env): PayoutAddresses {
  const reviewers = Object.fromEntries(
    (env.REVIEWER_ADDRESSES ?? "")
      .split(",")
      .map((pair) => pair.split("=").map((part) => part.trim()))
      .filter((pair): pair is [string, string] => pair.length === 2 && !!pair[0] && !!pair[1]),
  );
  return { operating: env.OPERATING_ACCOUNT_ADDRESS || undefined, reviewers };
}
