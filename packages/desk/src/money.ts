import { ledgerEntries, outbox, type Task, type Transaction } from "@boreal/db";

type Account = (typeof ledgerEntries.$inferInsert)["toAccount"];

interface Movement {
  key: string;
  to: Exclude<Account, "escrow">;
  party: string | null;
  amount: number;
}

export function taskTotal(task: Task): number {
  return task.budget + task.platformFee + task.reviewFee;
}

export const fundingKey = (taskId: string) => `${taskId}:fund`;

/**
 * Funding has already settled on-chain (x402 confirmed it), so the entry is settled at once.
 * A held payment (a PayPal authorization) stays pending until it is captured or released.
 */
export async function recordFunding(
  tx: Transaction,
  task: Task,
  payment: { txHash: string; hold?: string },
  at: Date,
): Promise<void> {
  await tx.insert(ledgerEntries).values({
    taskId: task.id,
    idempotencyKey: fundingKey(task.id),
    fromAccount: "requester",
    toAccount: "escrow",
    party: task.agentId,
    amount: taskTotal(task),
    status: payment.hold ? "pending" : "settled",
    txHash: payment.txHash,
    createdAt: at,
    updatedAt: at,
  });
}

export type Settlement = "pass" | "fail" | "refund";

/**
 * Moves a final task's money out of escrow. Pass pays the worker, the reviewer and boreal.
 * Fail returns the budget and platform fee but still pays the reviewer. Refund (cancelled
 * or expired before review) returns everything.
 */
export function settlementMovements(task: Task, outcome: Settlement): Movement[] {
  const requester = { to: "requester" as const, party: task.agentId };
  switch (outcome) {
    case "pass":
      return [
        { key: `${task.id}:pay-worker`, to: "worker", party: task.claimedBy, amount: task.budget },
        { key: `${task.id}:pay-reviewer`, to: "reviewer", party: task.reviewerRef, amount: task.reviewFee },
        { key: `${task.id}:platform-fee`, to: "operating", party: null, amount: task.platformFee },
      ];
    case "fail":
      return [
        { key: `${task.id}:refund`, ...requester, amount: task.budget + task.platformFee },
        { key: `${task.id}:pay-reviewer`, to: "reviewer", party: task.reviewerRef, amount: task.reviewFee },
      ];
    case "refund":
      return [{ key: `${task.id}:refund`, ...requester, amount: taskTotal(task) }];
  }
}

/** Writes pending ledger entries and queues each transfer; the worker sends them with retries. */
export async function settle(
  tx: Transaction,
  task: Task,
  outcome: Settlement,
  at: Date,
): Promise<void> {
  const movements = settlementMovements(task, outcome).filter((m) => m.amount > 0);
  if (movements.length === 0) return;

  const inserted = await tx
    .insert(ledgerEntries)
    .values(
      movements.map((m) => ({
        taskId: task.id,
        idempotencyKey: m.key,
        fromAccount: "escrow" as const,
        toAccount: m.to,
        party: m.party,
        amount: m.amount,
        // Test money never moves on-chain: settled on the spot, with nothing sent.
        ...(task.test ? { status: "settled" as const, txHash: `test:${m.key}` } : {}),
        createdAt: at,
        updatedAt: at,
      })),
    )
    .onConflictDoNothing({ target: ledgerEntries.idempotencyKey })
    .returning({ key: ledgerEntries.idempotencyKey });

  // Only queue transfers for entries written now, so a repeat can never send twice.
  const fresh = new Set(inserted.map((row) => row.key));
  const queued = movements.filter((m) => fresh.has(m.key));
  if (queued.length === 0 || task.test) return;

  if (task.fundingHold) {
    // The money is still only held: take what leaves for others, and the rest goes back to
    // the payer with the hold. Payouts are queued once the capture has gone through.
    const amount = queued.filter((m) => m.to !== "requester").reduce((sum, m) => sum + m.amount, 0);
    await tx.insert(outbox).values({
      kind: amount > 0 ? ("capture" as const) : ("release" as const),
      payload: { taskId: task.id, hold: task.fundingHold, amount, key: `${task.id}:${amount > 0 ? "capture" : "release"}` },
      nextAttemptAt: at,
      createdAt: at,
    });
    return;
  }

  await tx.insert(outbox).values(
    queued.map((m) => ({
      kind: m.to === "requester" ? ("refund" as const) : ("payout" as const),
      payload: { ledgerKey: m.key, to: m.to, party: m.party, amount: m.amount },
      nextAttemptAt: at,
      createdAt: at,
    })),
  );
}
