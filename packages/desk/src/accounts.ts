import { isTerminal, type TaskStatus } from "@boreal/core";
import {
  agents,
  and,
  type Database,
  eq,
  fundingApprovals,
  inArray,
  isNull,
  ledgerEntries,
  lt,
  ne,
  ownerActions,
  owners,
  sql,
  submissions,
  tasks,
  verificationRequests,
  workers,
} from "@boreal/db";

import { DeskError } from "./errors";

// Closing an account, and keeping data no longer than the privacy policy says.
//
// Closing is the person's own decision, made on My account after reading what it does. It is
// refused while anything is still moving for them: a task they are working on, a verdict not yet
// final, money not yet paid out or released. Then, in one transaction: every sign-in identity,
// email and payout address is removed, the pseudonym becomes `closed:<id>` (so signing in again
// starts a new, empty account), and every agent they own is frozen with its key and saved
// payment method gone. The task trail and the ledger are append-only and stay, as they are.
//
// Retention runs on the monitor's tick: a result's files are deleted 90 days after its task is
// final, and the hashed IPs kept for sign-in rate limits after 30 days.

const DAY = 24 * 60 * 60 * 1000;

export const RETENTION = {
  /** A result's photos and files, counted from when its task became final. */
  resultFilesMs: 90 * DAY,
  /** Hashed IPs kept to rate-limit sign-in requests. */
  clientHashesMs: 30 * DAY,
} as const;

/** Statuses where a task can no longer change: nothing more is owed to anyone on it. */
const done = (status: TaskStatus) => isTerminal(status);

export interface ClosingCheck {
  /** Why the account can't be closed yet, each as a sentence with what to do. Empty when it can. */
  blockers: string[];
  /** Agents the person owns (not their own personal requester), which closing freezes. */
  agents: number;
  /** Of those, how many have a saved PayPal account, which closing forgets. */
  savedPayPal: number;
  /** Tasks they worked on or posted, whose record stays. */
  history: number;
}

/** Deletes stored files by path; it must not fail on a path that is already gone. */
export type DeleteFiles = (paths: string[]) => Promise<void>;

export function accountCommands(db: Database, now: () => Date) {
  async function activeWorker(q: Pick<Database, "select">, workerId: string) {
    const [worker] = await q.select().from(workers).where(eq(workers.id, workerId));
    if (!worker || worker.closedAt) throw new DeskError("not_found", "sign in again");
    if (worker.testMode) throw new DeskError("forbidden", "test accounts are reset by boreal.work, not closed");
    return worker;
  }

  async function check(q: Pick<Database, "select">, worker: typeof workers.$inferSelect): Promise<ClosingCheck> {
    const blockers: string[] = [];

    // As a worker: tasks they hold, and verdicts not yet final.
    const worked = await q.select({ status: tasks.status }).from(tasks).where(eq(tasks.claimedBy, worker.id));
    const working = worked.filter((t) => !done(t.status)).length;
    if (working > 0) {
      blockers.push(
        `${working === 1 ? "A task you claimed is" : `${working} tasks you claimed are`} not final yet. Send or release ${working === 1 ? "it" : "them"}, and wait until the verdict is final.`,
      );
    }
    const [owed] = await q
      .select({ n: sql<number>`count(*)::int` })
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.party, worker.id), eq(ledgerEntries.status, "pending")));
    if ((owed?.n ?? 0) > 0) blockers.push("Pay is still on its way to you. Wait until it has been sent.");

    // As a requester or owner: tasks posted by them or their agents.
    const [owner] = await q.select().from(owners).where(eq(owners.verifiedRef, worker.pseudonym));
    const mine = owner ? await q.select().from(agents).where(eq(agents.ownerId, owner.id)) : [];
    const ids = mine.map((a) => a.id);
    const posted = ids.length ? await q.select({ id: tasks.id, status: tasks.status }).from(tasks).where(inArray(tasks.agentId, ids)) : [];
    const running = posted.filter((t) => !done(t.status)).length;
    if (running > 0) {
      blockers.push(
        `${running === 1 ? "A task you or your agents posted is" : `${running} tasks you or your agents posted are`} still running. Cancel ${running === 1 ? "it" : "them"} if no one has claimed ${running === 1 ? "it" : "them"}, or wait until ${running === 1 ? "it is" : "they are"} final.`,
      );
    }
    if (posted.length) {
      const [held] = await q
        .select({ n: sql<number>`count(*)::int` })
        .from(ledgerEntries)
        .where(and(inArray(ledgerEntries.taskId, posted.map((t) => t.id)), eq(ledgerEntries.status, "pending")));
      if ((held?.n ?? 0) > 0 && running === 0) blockers.push("Money from your finished tasks is still being paid out or released. Wait until it has settled.");
    }

    const theirAgents = mine.filter((a) => a.kind !== "personal");
    return {
      blockers,
      agents: theirAgents.length,
      savedPayPal: theirAgents.filter((a) => a.paymentVaultId).length,
      history: worked.length + posted.length,
    };
  }

  return {
    /** What closing this account would do, and what stops it today. */
    async closingCheck(workerId: string): Promise<ClosingCheck> {
      return check(db, await activeWorker(db, workerId));
    },

    /**
     * Closes the signed-in person's account, if nothing is still moving for them. Returns the
     * saved payment methods it forgot, for the caller to delete at the provider too.
     */
    async closeAccount(workerId: string): Promise<{ closedAt: Date; vaultIds: string[] }> {
      return db.transaction(async (tx) => {
        const [locked] = await tx.select().from(workers).where(eq(workers.id, workerId)).for("update");
        if (!locked) throw new DeskError("not_found", "sign in again");
        const worker = await activeWorker(tx, workerId);
        const { blockers } = await check(tx, worker);
        if (blockers.length) throw new DeskError("conflict", blockers.join(" "));

        const at = now();
        const closed = `closed:${worker.id}`;
        const [owner] = await tx.select().from(owners).where(eq(owners.verifiedRef, worker.pseudonym)).for("update");
        const vaultIds: string[] = [];
        if (owner) {
          const mine = await tx.select().from(agents).where(eq(agents.ownerId, owner.id)).for("update");
          for (const agent of mine) {
            if (agent.paymentVaultId) vaultIds.push(agent.paymentVaultId);
            await tx
              .update(agents)
              .set({ status: "frozen", apiKeyHash: null, paymentVaultId: null, pausedAt: agent.pausedAt ?? at, updatedAt: at })
              .where(eq(agents.id, agent.id));
            await tx.insert(ownerActions).values({ ownerId: owner.id, agentId: agent.id, action: "close_account", detail: null, createdAt: at });
          }
          if (mine.length) {
            await tx
              .update(fundingApprovals)
              .set({ status: "declined", decidedAt: at, updatedAt: at })
              .where(and(inArray(fundingApprovals.agentId, mine.map((a) => a.id)), eq(fundingApprovals.status, "pending")));
          }
          await tx.update(owners).set({ verifiedRef: closed, updatedAt: at }).where(eq(owners.id, owner.id));
        }
        await tx
          .update(workers)
          .set({
            pseudonym: closed,
            paypalRef: null,
            paypalEmail: null,
            paypalVerified: false,
            concordiumRef: null,
            concordiumWalletRef: null,
            personRef: null,
            provenAttributes: {},
            payoutAddress: null,
            nearAccount: null,
            evmAddress: null,
            apiKeyHash: null,
            closedAt: at,
            updatedAt: at,
          })
          .where(eq(workers.id, worker.id));
        return { closedAt: at, vaultIds };
      });
    },

    /**
     * Deletes what the privacy policy says boreal.work stops keeping: a result's files 90 days
     * after its task is final, and sign-in rate-limit hashes after 30 days. The files go first,
     * then the record says so; a run that stops halfway deletes the rest next time.
     */
    async applyRetention(deleteFiles: DeleteFiles, { limit = 50 }: { limit?: number } = {}) {
      const at = now();
      const before = new Date(at.getTime() - RETENTION.resultFilesMs);
      const due = await db
        .select({ id: submissions.id, fileUrls: submissions.fileUrls })
        .from(submissions)
        .innerJoin(tasks, eq(tasks.id, submissions.taskId))
        .where(
          and(
            isNull(submissions.filesDeletedAt),
            inArray(tasks.status, ["final_pass", "final_fail"]),
            lt(tasks.updatedAt, before),
            ne(sql`jsonb_array_length(${submissions.fileUrls})`, 0),
          ),
        )
        .limit(limit);
      let files = 0;
      for (const row of due) {
        await deleteFiles(row.fileUrls);
        await db.update(submissions).set({ fileUrls: [], filesDeletedAt: at }).where(and(eq(submissions.id, row.id), isNull(submissions.filesDeletedAt)));
        files += row.fileUrls.length;
      }
      const cleared = await db
        .delete(verificationRequests)
        .where(lt(verificationRequests.createdAt, new Date(at.getTime() - RETENTION.clientHashesMs)))
        .returning({ id: verificationRequests.id });
      return { results: due.length, files, clientHashes: cleared.length };
    },
  };
}
