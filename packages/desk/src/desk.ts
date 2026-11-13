import type { PrivateInferenceProof } from "@boreal/brain";
import { timingSafeEqual } from "node:crypto";

import {
  type Actor,
  postTaskInput,
  POLICY,
  quoteFees,
  type TaskEvent,
  type TaskStatus,
  transition,
  TransitionError,
} from "@boreal/core";
import type { Concordium, ConfirmedPayment, Payments, ProofRequest, PaymentRail, PaymentRails } from "@boreal/concordium";
import {
  agents,
  and,
  asc,
  type Database,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNull,
  ledgerEntries,
  lte,
  ne,
  or,
  owners,
  submissions,
  type Task,
  taskEvents,
  tasks,
  type Transaction,
  verificationRequests,
  walletSetups,
  workers,
  sql,
} from "@boreal/db";

import { adminCommands } from "./admin";
import { passkeyCommands } from "./passkeys";
import { controlCommands, railClosed } from "./controls";
import { adminViews } from "./admin-views";
import { consoleViews, findAnomalies, type ReconcileResult } from "./console-views";
import { insightsViews } from "./insights-views";
import { DeskError, fromTransitionError } from "./errors";
import { linkCommands } from "./links";
import { accountCommands } from "./accounts";
import { assertSavedPaymentAllowed, ownerCommands } from "./owner";
import { moneyViews } from "./money-views";
import { recordFunding, settle, taskTotal } from "./money";
import { drainOutbox, type PaymentStatusUpdate, type PayoutAddresses, queuePaymentUpdate, reconcileEscrow } from "./outbox";
import { issueWorkerKey } from "./keys";
import { appendEvent } from "./trail";

export type Caller =
  | { role: "requester"; agentId: string }
  | { role: "worker"; workerId: string }
  | { role: "reviewer"; reviewerRef: string }
  | { role: "panel"; reviewerRef: string }
  | { role: "system" };

export interface DeskOptions {
  db: Database;
  /** Invite code for test workers (TEST_WORKER_INVITE); unset = test sign-in off. */
  testInvite?: string;
  now?: () => Date;
  /** Concordium adapters. Without them the registry check, sign-in and the outbox stay off. */
  concordium?: Concordium | null;
  /** Payout accounts for the platform and reviewers; workers and agents carry their own. */
  addresses?: PayoutAddresses;
  /** The default payment rail. Defaults to `concordium.payments`. */
  payments?: Payments | null;
  /** Every configured rail; a task settles on the one it was funded on. */
  rails?: PaymentRails;
  /** Refuse posting without a Verified by Concordium badge. Off during the beta. */
  requireBadge?: boolean;
  /**
   * Screen every new task as passed, recorded in its trail, instead of waiting for a reviewer.
   * For the testnet only, where no reviewer runs; the web app refuses it on mainnet.
   */
  autoScreen?: boolean;
  /**
   * Only verified people work. A person claims only once verified: a PayPal account PayPal has
   * verified (`verified_account`), Concordium ID, or a Concordium account (every one is opened on
   * an identity a regulated identity provider checked). On by default, on every network; only
   * desk tests that aren't about verification turn it off.
   */
  requireVerifiedPayPal?: boolean;
  /**
   * How people and owners verify on this deployment. `concordiumId`: the Concordium add-on's
   * Concordium ID is on, so tasks may require proven attributes and Concordium ID lifts the
   * unverified caps. `paypal`: a PayPal account PayPal has verified lifts them too (on when
   * Concordium ID is off, so a PayPal-only deployment isn't stuck at the caps). Defaults to
   * Concordium ID only.
   */
  verification?: { concordiumId: boolean; paypal: boolean };
}

/**
 * Who posted a task, as workers see it: an agent (Verified by Concordium or not), a person
 * posting for themselves (with Concordium ID or not), or a NEAR Agent Market buyer.
 */
export type RequesterKind = "verified_agent" | "agent" | "verified_person" | "person" | "market";

/** A PayPal identity read from Log in with PayPal; `ref` is the keyed hash of the payer_id. */
export interface PayPalIdentity {
  ref: string;
  email: string;
  verified: boolean;
}

/** A Concordium ID identity read from a verified proof. */
export interface ConcordiumIdentity {
  pseudonym: string;
  provenAttributes: Record<string, string>;
  /** One person across documents (see VerifiedWorker.personRef); absent on older proofs. */
  personRef?: string;
}

/** Refused when a person who already has an account proves themselves again with another document. */
const SAME_PERSON =
  "this person already has a boreal.work account (one account per person). Sign in with that account instead, with PayPal or the document you used before";

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
/** NEAR account ids: named (`you.near`) or implicit (64 hex characters), 2–64 characters. */
const NEAR_ACCOUNT = /^(?=.{2,64}$)(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;

/**
 * A payment that has settled, one to settle once the task's checks pass, or `{ vault: true }`
 * to pay from the payment method the agent's owner saved, also only once the checks pass.
 */
export type FundingPayment = ConfirmedPayment | { confirm: () => Promise<ConfirmedPayment> } | { vault: true };

type TaskPatch = Partial<typeof tasks.$inferInsert>;

/** A reviewer's decision clears any AI retry state and takes the task off the human queue. */
const CLEAR_AI: TaskPatch = { needsHuman: false, humanReason: null, aiAttempts: 0, aiRetryAt: null };
const MAX_AI_ATTEMPTS = 3;
const TEST_SCREENER: Caller = { role: "reviewer", reviewerRef: "test-mode" };
const AUTO_SCREENER: Caller = { role: "reviewer", reviewerRef: "auto-screen" };

interface MutateOptions {
  /** Extra checks beyond the state machine, run on the locked row. */
  check?: (tx: Transaction, task: Task, at: Date) => Promise<void> | void;
  patch?: (task: Task, at: Date) => TaskPatch;
  after?: (tx: Transaction, task: Task, at: Date) => Promise<void>;
  /** Event payload; a function is read after `check`, so it can include what the check learned. */
  payload?: unknown | (() => unknown);
}

function actorOf(caller: Caller): Actor {
  return caller.role;
}

/** Requesters act only on their own tasks; workers only on tasks they hold (claiming aside). */
function authorize(caller: Caller, task: Task, event: TaskEvent): void {
  if (caller.role === "requester" && task.agentId !== caller.agentId) {
    throw new DeskError("forbidden", "this task belongs to another agent");
  }
  if (caller.role === "worker" && event.type !== "claim" && task.claimedBy !== caller.workerId) {
    throw new DeskError("forbidden", "this task is not claimed by you");
  }
}

function meetsAttributes(
  required: Task["requiredAttributes"],
  proven: Record<string, string>,
): boolean {
  return required.every(({ attribute, value }) =>
    value === undefined ? attribute in proven : proven[attribute] === value,
  );
}

export function createDesk({
  db,
  now = () => new Date(),
  concordium = null,
  addresses = {},
  testInvite,
  payments = concordium?.payments ?? null,
  rails = {},
  requireBadge = false,
  requireVerifiedPayPal = true,
  autoScreen = false,
  verification = { concordiumId: true, paypal: false },
}: DeskOptions) {
  // What lifts the unverified caps here, in words for refusals.
  const liftWith = [verification.concordiumId && "Concordium ID", verification.paypal && "a PayPal account PayPal has verified"]
    .filter(Boolean)
    .join(" or ");
  // The rail a task funds on when none is named: the default rail's name.
  const defaultRail: PaymentRail | null = payments
    ? ((Object.entries(rails) as [PaymentRail, Payments][]).find(([, r]) => r === payments)?.[0] ??
      (payments.holds ? "paypal" : "concordium"))
    : null;
  // Every rail by name, the default included.
  const allRails: PaymentRails = { ...(defaultRail && payments ? { [defaultRail]: payments } : {}), ...rails };
  function requireConcordium(): Concordium {
    if (!concordium) throw new DeskError("unavailable", "Concordium adapters are not configured");
    return concordium;
  }

  function requirePayments(rail?: PaymentRail | null): Payments {
    const found = rail ? allRails[rail] : payments;
    if (!found) throw new DeskError("unavailable", rail ? `the ${rail} payment rail is not enabled here` : "payments are not configured");
    return found;
  }

  async function mutate(
    taskId: string,
    caller: Caller,
    event: TaskEvent,
    options: MutateOptions = {},
  ): Promise<Task> {
    return db.transaction(async (tx) => {
      const at = now();
      const [task] = await tx.select().from(tasks).where(eq(tasks.id, taskId)).for("update");
      if (!task) throw new DeskError("not_found", "task not found");

      authorize(caller, task, event);

      let next: { status: TaskStatus; disputeUsed: boolean };
      try {
        // Take only the state fields, so they never overwrite the command's own patch.
        const { status, disputeUsed } = transition(task, event, actorOf(caller));
        next = { status, disputeUsed };
      } catch (error) {
        if (error instanceof TransitionError) throw fromTransitionError(error);
        throw error;
      }

      await options.check?.(tx, task, at);

      const [updated] = await tx
        .update(tasks)
        .set({ ...options.patch?.(task, at), ...next, updatedAt: at })
        .where(eq(tasks.id, taskId))
        .returning();

      await appendEvent(tx, {
        taskId,
        type: event.type,
        actor: actorOf(caller),
        payload: typeof options.payload === "function" ? options.payload() : (options.payload ?? event),
        at,
      });
      await options.after?.(tx, updated!, at);

      // Money moves only when a task reaches a final state.
      if (next.status === "final_pass") await settle(tx, updated!, "pass", at);
      if (next.status === "final_fail") await settle(tx, updated!, "fail", at);
      // Funded tasks only: since funding comes before screening, a refusal or a cancel during
      // screening releases the money in full, like an expiry or a cancel once open.
      if (next.status === "expired" || next.status === "refused" || (next.status === "cancelled" && (task.status === "open" || task.status === "posted"))) {
        await settle(tx, updated!, "refund", at);
      }

      return updated!;
    });
  }

  /**
   * The agents this person owns (their worker pseudonym is their owner identity). Test tasks
   * stay hidden from real workers, except an owner's own agents' test tasks, so an owner can
   * try their agent end to end from their own account.
   */
  async function ownedAgentIds(pseudonym: string, q: Database | Transaction = db): Promise<Set<string>> {
    const rows = await q
      .select({ id: agents.id })
      .from(agents)
      .innerJoin(owners, eq(owners.id, agents.ownerId))
      .where(eq(owners.verifiedRef, pseudonym));
    return new Set(rows.map((r) => r.id));
  }

  async function verifyProof(request: ProofRequest, presentation: unknown): Promise<ConcordiumIdentity> {
    try {
      return await requireConcordium().identity.verifyPresentation(request, presentation);
    } catch (error) {
      if (error instanceof DeskError) throw error;
      throw new DeskError("forbidden", error instanceof Error ? error.message : "proof was not accepted");
    }
  }

  /** One worker per Concordium identity; its proven attributes are refreshed from the latest proof. */
  /** Another open account that already belongs to this person, other than `workerId`'s. */
  async function samePerson(personRef: string | undefined, notWorker?: string, notConcordiumRef?: string) {
    if (!personRef) return null;
    const [other] = await db
      .select({ id: workers.id, concordiumRef: workers.concordiumRef })
      .from(workers)
      .where(and(eq(workers.personRef, personRef), isNull(workers.closedAt)));
    if (!other || other.id === notWorker || (notConcordiumRef && other.concordiumRef === notConcordiumRef)) return null;
    return other;
  }

  async function signInConcordium(verified: ConcordiumIdentity, payoutAddress?: string) {
    if (await samePerson(verified.personRef, undefined, verified.pseudonym)) throw new DeskError("conflict", SAME_PERSON);
    const at = now();
    const [worker] = await db
      .insert(workers)
      .values({
        pseudonym: verified.pseudonym,
        concordiumRef: verified.pseudonym,
        provenAttributes: verified.provenAttributes,
        personRef: verified.personRef ?? null,
        payoutAddress: payoutAddress ?? null,
        createdAt: at,
        updatedAt: at,
      })
      .onConflictDoUpdate({
        target: workers.concordiumRef,
        set: {
          provenAttributes: verified.provenAttributes,
          ...(verified.personRef ? { personRef: verified.personRef } : {}),
          ...(payoutAddress ? { payoutAddress } : {}),
          updatedAt: at,
        },
      })
      .returning();
    return worker!;
  }

  const WALLET_REF = /^cw:[0-9a-f]{64}$/;

  /**
   * Remembers the wallet account that answered a worker's proof, so a signed message signs
   * them in next time. An account answers for one worker: it moves off any other.
   */
  function checkWalletRef(walletRef: string | undefined) {
    if (walletRef !== undefined && !WALLET_REF.test(walletRef)) throw new DeskError("invalid", "that wallet isn't a keyed hash");
  }

  async function rememberWallet(workerId: string, walletRef: string) {
    await db.transaction(async (tx) => {
      await tx
        .update(workers)
        .set({ concordiumWalletRef: null })
        .where(and(eq(workers.concordiumWalletRef, walletRef), ne(workers.id, workerId)));
      await tx.update(workers).set({ concordiumWalletRef: walletRef }).where(eq(workers.id, workerId));
    });
  }

  function checkPayPalIdentity(identity: PayPalIdentity) {
    if (!/^pp:[0-9a-f]{64}$/.test(identity.ref)) throw new DeskError("invalid", "that PayPal identity isn't a keyed hash");
    if (!EMAIL.test(identity.email) || identity.email.length > 254) throw new DeskError("invalid", "PayPal didn't share a usable email");
  }

  /** Whether a worker has done anything: claimed a task, submitted, been paid or owns an agent. */
  async function hasHistory(tx: Pick<Database, "select">, worker: { id: string; pseudonym: string }) {
    const [claimed] = await tx.select({ id: tasks.id }).from(tasks).where(eq(tasks.claimedBy, worker.id)).limit(1);
    if (claimed) return true;
    const [submitted] = await tx.select({ id: submissions.id }).from(submissions).where(eq(submissions.workerId, worker.id)).limit(1);
    if (submitted) return true;
    const [paid] = await tx.select({ id: ledgerEntries.id }).from(ledgerEntries).where(eq(ledgerEntries.party, worker.id)).limit(1);
    if (paid) return true;
    const [owner] = await tx.select({ id: owners.id }).from(owners).where(eq(owners.verifiedRef, worker.pseudonym)).limit(1);
    return Boolean(owner);
  }

  /**
   * Adds an identity to a worker, so PayPal and Concordium ID both land in one account. Each
   * identity belongs to one worker. If it already belongs to another account and one of the
   * two has never done anything (no claims, submissions, money or agents), the empty one is
   * folded into the other: nobody's work or money can change hands this way. Two accounts
   * that both have history are never merged. Returns the account the person ends up in,
   * which is the other one when theirs was the empty one: sign them into it.
   */
  async function linkIdentity(
    workerId: string,
    kind: "paypal" | "concordium",
    ref: string,
    set: Partial<typeof workers.$inferInsert>,
  ) {
    const name = kind === "paypal" ? "PayPal account" : "Concordium ID";
    const column = kind === "paypal" ? workers.paypalRef : workers.concordiumRef;
    return db.transaction(async (tx) => {
      const [worker] = await tx.select().from(workers).where(eq(workers.id, workerId)).for("update");
      if (!worker) throw new DeskError("not_found", "sign in again");
      if (worker.testMode) throw new DeskError("forbidden", "tester accounts can't add a PayPal account or Concordium ID");
      const current = kind === "paypal" ? worker.paypalRef : worker.concordiumRef;
      if (current && current !== ref) {
        throw new DeskError("conflict", `your account already has a different ${name}; boreal.work never swaps one for another`);
      }
      const [other] = await tx
        .select()
        .from(workers)
        .where(and(or(eq(column, ref), eq(workers.pseudonym, ref)), ne(workers.id, workerId)))
        .for("update");
      const at = now();

      if (other && !(await hasHistory(tx, other))) {
        // The identity sits on an empty account (say, an accidental second sign-in): retire it.
        await tx.delete(workers).where(eq(workers.id, other.id));
      } else if (other && !(await hasHistory(tx, worker))) {
        // Theirs is the empty one: fold it into the account that holds the identity.
        const bring = kind === "paypal" ? "concordium" : "paypal";
        const mine = bring === "paypal" ? worker.paypalRef : worker.concordiumRef;
        const theirs = bring === "paypal" ? other.paypalRef : other.concordiumRef;
        if (mine && theirs && mine !== theirs) {
          throw new DeskError("conflict", `that account already has a different ${bring === "paypal" ? "PayPal account" : "Concordium ID"}; boreal.work never merges two of them`);
        }
        await tx.delete(workers).where(eq(workers.id, worker.id));
        const carried: Partial<typeof workers.$inferInsert> =
          !mine || theirs
            ? {}
            : bring === "paypal"
              ? { paypalRef: worker.paypalRef, paypalEmail: worker.paypalEmail, paypalVerified: worker.paypalVerified }
              : { concordiumRef: worker.concordiumRef, provenAttributes: worker.provenAttributes };
        const [merged] = await tx
          .update(workers)
          .set({ ...set, ...carried, updatedAt: at })
          .where(eq(workers.id, other.id))
          .returning();
        return merged!;
      } else if (other) {
        throw new DeskError(
          "conflict",
          `this ${name} already belongs to another boreal.work account that has its own tasks or money. Sign out and sign in with it to use that account; boreal.work never merges two accounts with history`,
        );
      }
      const [updated] = await tx
        .update(workers)
        .set({ ...set, updatedAt: at })
        .where(eq(workers.id, workerId))
        .returning();
      return updated!;
    });
  }

  /**
   * Whether a requester is verified: an agent by its Agent Registry badge, a person's own
   * requester by the Concordium ID on their account. Where PayPal verifies (see
   * `verification`), a person or an agent's owner with a PayPal account PayPal has verified counts too.
   */
  async function requesterVerified(
    agent: { kind: "agent" | "personal" | "market"; ownerId: string; badgeVerifiedAt: Date | null },
    q: Pick<Database, "select"> = db,
  ): Promise<boolean> {
    if (agent.kind !== "personal" && agent.badgeVerifiedAt !== null) return true;
    if (agent.kind !== "personal" && !verification.paypal) return false;
    const [person] = await q
      .select({ concordium: workers.concordiumRef, paypalVerified: workers.paypalVerified, paypalRef: workers.paypalRef })
      .from(owners)
      .innerJoin(workers, eq(workers.pseudonym, owners.verifiedRef))
      .where(eq(owners.id, agent.ownerId));
    if (!person) return false;
    const byPayPal = verification.paypal && person.paypalVerified && person.paypalRef !== null;
    return agent.kind === "personal" ? person.concordium !== null || byPayPal : byPayPal;
  }

  /** A requester's limits in force: its owner's, capped until it's verified (see requesterVerified). */
  function effectiveLimits(agent: { maxTaskBudget: number; maxDailySpend: number }, verified: boolean) {
    if (verified) return { maxTaskBudget: agent.maxTaskBudget, maxDailySpend: agent.maxDailySpend };
    return {
      maxTaskBudget: Math.min(agent.maxTaskBudget, POLICY.unverifiedTaskBudget),
      maxDailySpend: Math.min(agent.maxDailySpend, POLICY.unverifiedDailySpend),
    };
  }

  /**
   * Marks each task with who's behind it, for workers: a Verified by Concordium agent
   * (`agentVerified`), a person who posted it themselves with Concordium ID, a NEAR Agent Market
   * buyer, or none of these.
   */
  async function withAgentBadge<T extends { agentId: string; claimedBy?: string | null }>(
    rows: T[],
  ): Promise<(T & { agentVerified: boolean; requesterKind: RequesterKind; fulfilledBy: "person" | "agent" | null })[]> {
    const ids = [...new Set(rows.map((r) => r.agentId))];
    if (ids.length === 0) return [];
    // Who is doing (or did) each task: a verified person or an AI agent.
    const claimers = [...new Set(rows.flatMap((r) => (r.claimedBy ? [r.claimedBy] : [])))];
    const workerKinds = new Map(
      claimers.length === 0
        ? []
        : (await db.select({ id: workers.id, kind: workers.kind }).from(workers).where(inArray(workers.id, claimers))).map(
            (w): [string, "person" | "agent"] => [w.id, w.kind],
          ),
    );
    const found = await db
      .select({ id: agents.id, kind: agents.kind, badge: agents.badgeVerifiedAt, person: workers.concordiumRef, paypalVerified: workers.paypalVerified })
      .from(agents)
      .innerJoin(owners, eq(owners.id, agents.ownerId))
      .leftJoin(workers, eq(workers.pseudonym, owners.verifiedRef))
      .where(inArray(agents.id, ids));
    const kinds = new Map(
      found.map((a): [string, RequesterKind] => [
        a.id,
        a.kind === "market"
          ? "market"
          : a.kind === "personal"
            ? a.person || (verification.paypal && a.paypalVerified)
              ? "verified_person"
              : "person"
            : a.badge
              ? "verified_agent"
              : "agent",
      ]),
    );
    return rows.map((r) => {
      const requesterKind = kinds.get(r.agentId) ?? "agent";
      const fulfilledBy = r.claimedBy ? (workerKinds.get(r.claimedBy) ?? null) : null;
      return { ...r, agentVerified: requesterKind === "verified_agent", requesterKind, fulfilledBy };
    });
  }

  /** A batch's tasks: 1–10 distinct tasks of this requester, all awaiting funding, together under the daily cap. */
  async function batchTasks(caller: Extract<Caller, { role: "requester" }>, taskIds: string[]) {
    const ids = [...new Set(taskIds)];
    if (ids.length !== taskIds.length || ids.length < 1 || ids.length > 10) {
      throw new DeskError("invalid", "fund 1 to 10 different tasks at once");
    }
    const list = await db.select().from(tasks).where(inArray(tasks.id, ids));
    for (const id of ids) {
      const task = list.find((t) => t.id === id);
      if (!task || task.agentId !== caller.agentId) throw new DeskError("not_found", `task ${id} not found`);
      if (task.status !== "awaiting_funding") throw new DeskError("conflict", `task ${id} is ${task.status}, not awaiting funding`);
      if (task.test) throw new DeskError("invalid", `task ${id} uses test money; fund it on its own`);
    }
    const [agent] = await db.select().from(agents).where(eq(agents.id, caller.agentId));
    const since = new Date(now().getTime() - 24 * 60 * 60 * 1000);
    const [spent] = await db
      .select({ total: sql<number>`coalesce(sum(${ledgerEntries.amount}), 0)::int` })
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.party, caller.agentId), eq(ledgerEntries.fromAccount, "requester"), gte(ledgerEntries.createdAt, since)));
    const total = list.reduce((sum, t) => sum + taskTotal(t), 0);
    if ((spent?.total ?? 0) + total > effectiveLimits(agent!, await requesterVerified(agent!, db)).maxDailySpend) {
      throw new DeskError("limit", "together these tasks would pass the daily spending cap");
    }
    return ids.map((id) => list.find((t) => t.id === id)!);
  }

  /** An agent its owner paused can read and cancel, but not post, fund, accept or review. */
  async function requireNotPaused(agentId: string) {
    const [agent] = await db.select({ pausedAt: agents.pausedAt }).from(agents).where(eq(agents.id, agentId));
    if (agent?.pausedAt) throw new DeskError("forbidden", "your owner has paused you; they can resume you on My account");
  }

  function requireRole<R extends Caller["role"]>(
    caller: Caller,
    ...roles: R[]
  ): asserts caller is Extract<Caller, { role: R }> {
    if (!roles.includes(caller.role as R)) {
      throw new DeskError("forbidden", `${caller.role} cannot do this`);
    }
  }

  const commands = {
    ...linkCommands(db, now),
    ...moneyViews(db),

    /** post_task: validates, applies the agent's limits and quotes fees. Screening comes next. */
    async postTask(caller: Caller, input: unknown) {
      requireRole(caller, "requester");

      // Flow step 2 comes first: who is asking, before what they ask.
      const [agent] = await db.select().from(agents).where(eq(agents.id, caller.agentId));
      if (!agent) throw new DeskError("not_found", "agent not found");
      if (agent.status !== "active") throw new DeskError("forbidden", agent.kind === "personal" ? "posting is paused on your account" : "agent is frozen");
      if (agent.pausedAt) throw new DeskError("forbidden", "your owner has paused you; they can resume you on My account");
      const verified = await requesterVerified(agent);
      if (concordium && requireBadge) {
        // A person proves themselves with Concordium ID; an agent with its registry badge.
        const personal = agent.kind === "personal";
        if (personal && !verified) throw new DeskError("forbidden", "add Concordium ID on My account before posting");
        const entry = personal ? null : await concordium.registry.lookup(agent.registryId);
        if (!personal && !entry?.verified) {
          throw new DeskError("forbidden", "agent has no Verified by Concordium badge in the Agent Registry");
        }
      }

      const parsed = postTaskInput.safeParse(input);
      if (!parsed.success) {
        const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`);
        throw new DeskError("invalid", issues.join("; "));
      }
      const data = parsed.data;
      if (data.requiredAttributes.length > 0 && !verification.concordiumId) {
        throw new DeskError("invalid", "requiredAttributes need the Concordium integration (Concordium ID), which isn't on here; post without them");
      }
      // An agent can't prove an attribute, take a photo or go somewhere: those stay with people.
      if (data.fulfillers === "people_or_agents" && (data.requiredAttributes.length > 0 || data.resultFormat !== "text")) {
        throw new DeskError("invalid", "only text tasks with no required attributes can be open to agents; this one stays with verified people");
      }

      const at = now();
      if (new Date(data.deadline) <= at) throw new DeskError("invalid", "deadline is in the past");
      // The money is only held until the task is final, and a hold doesn't last forever.
      // A few minutes of grace, so "14 days from now" on a caller's slightly fast clock still posts.
      if (new Date(data.deadline).getTime() - at.getTime() > POLICY.maxDeadlineMs + 5 * 60 * 1000) {
        throw new DeskError("invalid", `deadline can be at most ${POLICY.maxDeadlineMs / (24 * 60 * 60 * 1000)} days away`);
      }
      if (data.budget > effectiveLimits(agent, verified).maxTaskBudget) {
        if (!verified && data.budget <= agent.maxTaskBudget) {
          throw new DeskError(
            "limit",
            agent.kind === "personal"
              ? `unverified, you can post up to ${POLICY.unverifiedTaskBudget} cents a task; add ${liftWith} on My account for more`
              : `unverified agents can post up to ${POLICY.unverifiedTaskBudget} cents a task; ${verification.paypal ? "your owner can verify their PayPal account with PayPal" : "ask your owner to add the Verified by Concordium badge"}`,
          );
        }
        throw new DeskError("limit", "budget exceeds this agent's per-task limit");
      }

      const quote = quoteFees(data.budget, { reviewer: data.reviewer });
      const [drafts] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(tasks)
        .where(and(eq(tasks.agentId, agent.id), eq(tasks.status, "awaiting_funding")));
      if ((drafts?.n ?? 0) >= POLICY.maxUnfundedTasks) {
        throw new DeskError("limit", `you have ${POLICY.maxUnfundedTasks} tasks waiting for funding; fund or cancel one before posting another`);
      }
      const posted = await db.transaction(async (tx) => {
        const [task] = await tx
          .insert(tasks)
          .values({
            agentId: agent.id,
            description: data.description,
            acceptanceCriteria: data.acceptanceCriteria,
            requiredAttributes: data.requiredAttributes,
            resultFormat: data.resultFormat,
            budget: quote.budget,
            platformFee: quote.platformFee,
            reviewFee: quote.reviewFee,
            rulebookVersion: POLICY.rulebookVersion,
            deadline: new Date(data.deadline),
            test: agent.testMode,
            reviewMode: data.reviewer,
            fulfillers: data.fulfillers,
            // A quote until it's funded; screening only starts once the money is held.
            status: "awaiting_funding",
            createdAt: at,
            updatedAt: at,
          })
          .returning();
        await appendEvent(tx, { taskId: task!.id, type: "posted", actor: "requester", payload: data, at });
        return { task: task!, quote };
      });
      return posted;
    },

    async screenTask(
      caller: Caller,
      taskId: string,
      result: ({ outcome: "ok"; reasoning?: string } | { outcome: "refused"; ruleIds: string[]; reasoning?: string }) & { proof?: PrivateInferenceProof },
    ) {
      requireRole(caller, "reviewer");
      if (result.outcome === "refused" && result.ruleIds.length === 0) {
        throw new DeskError("invalid", "a refusal must cite at least one rule");
      }
      return mutate(
        taskId,
        caller,
        result.outcome === "ok" ? { type: "screen_ok" } : { type: "screen_refused", ruleIds: result.ruleIds },
        { payload: { ...result, reviewerRef: caller.reviewerRef }, patch: () => CLEAR_AI },
      );
    },

    /**
     * fund_task. Holds the money, then the task goes to screening: nothing is screened until
     * it's funded. With `confirm`, the payment settles only after the task's own checks pass, and
     * a task screening then refuses has its money released in full. The amount must match the
     * quote exactly.
     */
    async fundTask(caller: Caller, taskId: string, payment: FundingPayment, options: { rail?: PaymentRail; approvalId?: string } = {}) {
      requireRole(caller, "requester");
      const funded = await commands.holdFunding(caller, taskId, payment, options);
      const [agent] = await db.select().from(agents).where(eq(agents.id, funded.agentId));
      if (!agent?.testMode && !autoScreen) return funded;
      // Test agents, and every task where auto-screening is on (testnet), skip the reviewer's
      // screening; the trail records who passed it and why.
      return mutate(funded.id, agent!.testMode ? TEST_SCREENER : AUTO_SCREENER, { type: "screen_ok" }, {
        payload: agent!.testMode
          ? { outcome: "ok", reasoning: "Test agent: screening skipped.", reviewerRef: "test-mode" }
          : { outcome: "ok", reasoning: "Auto-screened: this deployment passes every task without a reviewer.", reviewerRef: "auto-screen" },
      });
    },

    /** Holds a task's money and sends it to screening. With `confirm`, the payment settles inside the task's own checks. */
    async holdFunding(caller: Caller, taskId: string, payment: FundingPayment, options: { rail?: PaymentRail; approvalId?: string } = {}) {
      requireRole(caller, "requester");
      let settled: ConfirmedPayment | undefined;
      return mutate(taskId, caller, { type: "fund" }, {
        payload: () => settled,
        async check(tx, task, at) {
          const total = taskTotal(task);
          if ("amount" in payment && payment.amount !== total) {
            throw new DeskError("invalid", `payment must be exactly ${total}`);
          }
          // Locked, so two of this requester's tasks funding at once can't both fit under the
          // daily cap by each reading the spend before the other's is written.
          const [agent] = await tx.select().from(agents).where(eq(agents.id, task.agentId)).for("update");
          // What counts is what's in force now, not when the task was posted: a requester frozen
          // since, or a per-task cap lowered since, stops the payment.
          if (agent!.status !== "active") {
            throw new DeskError("forbidden", agent!.kind === "personal" ? "posting is paused on your account" : "agent is frozen");
          }
          if (agent!.pausedAt) throw new DeskError("forbidden", "your owner has paused you; they can resume you on My account");
          // A rail an operator closed takes no new money; tasks already on it still settle there.
          const rail = "vault" in payment ? "paypal" : (options.rail ?? defaultRail);
          if (rail && !task.test && (await railClosed(tx, rail))) {
            throw new DeskError("unavailable", `the ${rail} rail isn't taking new payments right now; fund on another rail`);
          }
          const limits = effectiveLimits(agent!, await requesterVerified(agent!, tx));
          if (task.budget > limits.maxTaskBudget) {
            throw new DeskError("limit", `this task pays $${(task.budget / 100).toFixed(2)}, over the per-task limit in force now ($${(limits.maxTaskBudget / 100).toFixed(2)}); cancel it and post one within the limit`);
          }
          const since = new Date(at.getTime() - 24 * 60 * 60 * 1000);
          const [spent] = await tx
            .select({ total: sql<number>`coalesce(sum(${ledgerEntries.amount}), 0)::int` })
            .from(ledgerEntries)
            .where(
              and(
                eq(ledgerEntries.party, task.agentId),
                eq(ledgerEntries.fromAccount, "requester"),
                gte(ledgerEntries.createdAt, since),
              ),
            );
          if ((spent?.total ?? 0) + total > limits.maxDailySpend) {
            throw new DeskError(
              "limit",
              agent!.kind === "personal"
                ? `this payment would pass your daily spending cap (add ${liftWith} on My account to raise it)`
                : "this payment would pass the agent's daily spending cap",
            );
          }
          if ("vault" in payment) {
            // "Ask me each time": the saved payment method moves only under the owner's approval.
            await assertSavedPaymentAllowed(tx, agent!, task, options.approvalId);
            const vault = requirePayments(options.rail ?? "paypal").vault;
            if (!vault) throw new DeskError("unavailable", "this payment rail can't save payment methods");
            if (!agent!.paymentVaultId) throw new DeskError("conflict", "your owner hasn't saved a payment method for you yet");
            try {
              settled = await vault.pay(task.id, total, agent!.paymentVaultId);
            } catch (error) {
              const reason = error instanceof Error ? error.message : "refused";
              throw new DeskError("invalid", `the saved payment method was refused (${reason}); fund with your owner's approval instead`);
            }
          } else {
            settled = "confirm" in payment ? await payment.confirm() : payment;
          }
          if (settled.amount !== total) {
            // Money moved but doesn't match: needs an operator, so it's loud.
            console.error(`[desk] task ${task.id} settled ${settled.amount}, expected ${total}`, settled);
            throw new DeskError("invalid", `payment must be exactly ${total}`);
          }
        },
        patch: (task, at) => ({
          fundedAt: at,
          fundingTxHash: settled!.txHash,
          fundingHold: settled!.hold ?? null,
          fundingPayer: settled!.payer ?? null,
          // Test money has no rail; real money settles where it came in.
          paymentRail: task.test ? null : ("vault" in payment ? "paypal" : (options.rail ?? defaultRail)),
        }),
        async after(tx, task, at) {
          await recordFunding(tx, task, settled!, at);
          // The owner approved saving the payment method: later tasks fund without asking.
          if (settled!.vaultId) {
            await tx.update(agents).set({ paymentVaultId: settled!.vaultId, updatedAt: at }).where(eq(agents.id, task.agentId));
          }
        },
      });
    },

    /**
     * One payer approval for several of this requester's tasks (fund_tasks): checks they are
     * all theirs and awaiting funding and that together they fit the daily cap, then asks the
     * rail for one payment that holds money separately per task.
     */
    async requestBatchFunding(caller: Caller, taskIds: string[], rail: PaymentRail = "paypal") {
      requireRole(caller, "requester");
      const list = await batchTasks(caller, taskIds);
      const batch = requirePayments(rail).batch;
      if (!batch) throw new DeskError("unavailable", `the ${rail} rail can't fund several tasks with one approval`);
      return batch.createBatchRequest(list.map((t) => ({ taskId: t.id, amount: taskTotal(t) })));
    },

    /**
     * Funds the tasks a batch approval covers. Each task then funds through fundTask, so every
     * check still runs per task; one that fails has its own hold released, the rest stand.
     */
    async fundTasks(caller: Caller, taskIds: string[], payment: unknown, rail: PaymentRail = "paypal") {
      requireRole(caller, "requester");
      await batchTasks(caller, taskIds);
      const payments = requirePayments(rail);
      if (!payments.batch) throw new DeskError("unavailable", `the ${rail} rail can't fund several tasks with one approval`);
      let confirmed: Map<string, ConfirmedPayment>;
      try {
        confirmed = await payments.batch.confirmBatch(taskIds, payment);
      } catch (error) {
        throw new DeskError("invalid", error instanceof Error ? error.message : "payment was not accepted");
      }
      const funded: Awaited<ReturnType<typeof commands.fundTask>>[] = [];
      const failed: { taskId: string; error: string }[] = [];
      for (const taskId of taskIds) {
        const held = confirmed.get(taskId);
        try {
          if (!held) throw new DeskError("invalid", "the payment holds nothing for this task");
          funded.push(await commands.fundTask(caller, taskId, { confirm: async () => held }, { rail }));
        } catch (error) {
          failed.push({ taskId, error: error instanceof Error ? error.message : "refused" });
          // Its money was held but the task didn't fund: give that one hold back.
          if (held?.hold && payments.holds) {
            await payments.holds.release(held.hold, `${taskId}:batch-release`).catch((e) => console.error(`[desk] couldn't release hold for ${taskId}`, e));
          }
        }
      }
      return { funded, failed };
    },

    /**
     * fund_tasks with the owner's saved payment method: no approval at all, each task paid on
     * its own through fundTask, so each check and hold is per task. A refused one is listed in
     * `failed` and the rest stand.
     */
    async fundTasksSaved(caller: Caller, taskIds: string[], rail: PaymentRail = "paypal") {
      requireRole(caller, "requester");
      await batchTasks(caller, taskIds);
      const funded: Awaited<ReturnType<typeof commands.fundTask>>[] = [];
      const failed: { taskId: string; error: string }[] = [];
      for (const taskId of taskIds) {
        try {
          funded.push(await commands.fundTask(caller, taskId, { vault: true }, { rail }));
        } catch (error) {
          failed.push({ taskId, error: error instanceof Error ? error.message : "refused" });
        }
      }
      return { funded, failed };
    },

    async cancelTask(caller: Caller, taskId: string) {
      requireRole(caller, "requester");
      return mutate(taskId, caller, { type: "cancel" });
    },

    async claimTask(caller: Caller, taskId: string) {
      requireRole(caller, "worker");
      let fulfiller: "person" | "agent" = "person";
      return mutate(taskId, caller, { type: "claim", workerId: caller.workerId }, {
        // The trail says who did the work: a verified person or an AI agent.
        payload: () => ({ type: "claim", workerId: caller.workerId, fulfiller }),
        async check(tx, task, at) {
          if (task.deadline <= at) throw new DeskError("conflict", "task deadline has passed");
          const [worker] = await tx.select().from(workers).where(eq(workers.id, caller.workerId));
          if (!worker || worker.closedAt) throw new DeskError("not_found", "sign in again");
          fulfiller = worker.kind;
          if (worker.kind === "agent") {
            if (task.fulfillers !== "people_or_agents") throw new DeskError("forbidden", "this task is for verified people only");
            if (task.paymentRail !== "near") throw new DeskError("forbidden", "agents are paid in USDC on NEAR, and this task pays on another rail");
          }
          const mine = (await ownedAgentIds(worker.pseudonym, tx)).has(task.agentId);
          // Nobody works their own task, posted themselves or by their agent. An owner may still
          // run their agent's test tasks end to end.
          if (mine && !task.test) throw new DeskError("forbidden", "you posted this task, so you can't claim it");
          if (task.test !== worker.testMode && !(task.test && mine)) {
            throw new DeskError("forbidden", task.test ? "this is a test task" : "test workers can only claim test tasks");
          }
          // Testers keep their invite's attributes; every other person proves them with Concordium ID.
          // (An agent proved its NEAR account instead, and only takes tasks with no attributes.)
          if (worker.kind === "person" && !worker.testMode && !worker.concordiumRef) {
            if (task.requiredAttributes.length > 0) {
              throw new DeskError(
                "forbidden",
                verification.concordiumId
                  ? "this task needs the Verified by Concordium badge: add Concordium ID on My account"
                  : "this task needs proven attributes, which need the Concordium integration; it isn't on here",
              );
            }
            // A Concordium account counts: the chain only opens accounts on an identity a
            // regulated identity provider has checked.
            if (requireVerifiedPayPal && !worker.paypalVerified && !worker.concordiumWalletRef) {
              throw new DeskError(
                "forbidden",
                verification.concordiumId
                  ? "only verified people can work here: verify your PayPal account with PayPal and log in again, or add Concordium ID on My account (free)"
                  : "only verified people can work here: verify your PayPal account with PayPal, then log in with PayPal again",
              );
            }
          }
          if (!meetsAttributes(task.requiredAttributes, worker.provenAttributes)) {
            throw new DeskError("forbidden", "you haven't proven the attributes this task requires");
          }
          if (task.paymentRail === "paypal" && !worker.paypalEmail) {
            throw new DeskError("forbidden", "this task pays with PayPal: add your PayPal email on My account first");
          }
          if (task.paymentRail === "concordium" && !worker.payoutAddress) {
            throw new DeskError("forbidden", "this task pays in tokens on Concordium: add your Concordium account on My account first");
          }
          if (task.paymentRail === "evm" && !worker.evmAddress) {
            throw new DeskError("forbidden", "this task pays in USDC to an EVM wallet: connect your wallet on My account first");
          }
          if (task.paymentRail === "near" && !worker.nearAccount) {
            throw new DeskError("forbidden", "this task pays in USDC on NEAR: add your NEAR account on My account first");
          }
          // An operator blocked this account (one person working through two): no new claims.
          if (worker.maxActiveClaims === 0) {
            throw new DeskError("forbidden", "boreal.work has stopped this account claiming tasks (one account per person). Contact us if you think that's a mistake");
          }
          const [active] = await tx
            .select({ n: sql<number>`count(*)::int` })
            .from(tasks)
            .where(and(eq(tasks.claimedBy, worker.id), eq(tasks.status, "claimed")));
          if ((active?.n ?? 0) >= worker.maxActiveClaims) {
            throw new DeskError("limit", "finish your current task before claiming another");
          }
        },
        patch: (task, at) => ({
          claimedBy: caller.workerId,
          claimExpiresAt: new Date(
            Math.min(at.getTime() + POLICY.claimDurationMs, task.deadline.getTime()),
          ),
        }),
      });
    },

    async releaseTask(caller: Caller, taskId: string) {
      requireRole(caller, "worker");
      return mutate(taskId, caller, { type: "release" }, {
        patch: () => ({ claimedBy: null, claimExpiresAt: null }),
      });
    },

    async submitResult(caller: Caller, taskId: string, result: { text?: string; fileUrls?: string[] }) {
      requireRole(caller, "worker");
      const text = result.text?.trim() || null;
      const fileUrls = result.fileUrls ?? [];
      return mutate(taskId, caller, { type: "submit" }, {
        payload: { text, fileUrls },
        check(_tx, task, at) {
          if (task.claimExpiresAt && task.claimExpiresAt <= at) {
            throw new DeskError("conflict", "your claim has expired");
          }
          if (task.resultFormat === "text" ? !text : fileUrls.length === 0) {
            throw new DeskError("invalid", `this task needs a ${task.resultFormat} result`);
          }
          // Files are stored per task; a submission can only point at its own task's files.
          if (fileUrls.some((path) => !path.startsWith(`submissions/${task.id}/`) || path.includes(".."))) {
            throw new DeskError("invalid", "files must be uploaded for this task");
          }
        },
        patch: () => ({ claimExpiresAt: null }),
        async after(tx, task, at) {
          await tx.insert(submissions).values({
            taskId: task.id,
            workerId: caller.workerId,
            text,
            fileUrls,
            createdAt: at,
          });
        },
      });
    },

    /** The reviewer's pass or fail. Every fail cites a rule (R5.3). */
    async recordVerdict(
      caller: Caller,
      taskId: string,
      verdict: { outcome: "pass" | "fail"; ruleIds: string[]; reasoning: string; model?: string; proof?: PrivateInferenceProof },
    ) {
      requireRole(caller, "reviewer");
      if (verdict.outcome === "fail" && verdict.ruleIds.length === 0) {
        throw new DeskError("invalid", "a fail must cite at least one rule");
      }
      return mutate(
        taskId,
        caller,
        verdict.outcome === "pass"
          ? { type: "verdict_pass", ruleIds: verdict.ruleIds }
          : { type: "verdict_fail", ruleIds: verdict.ruleIds },
        {
          payload: { ...verdict, reviewerRef: caller.reviewerRef },
          patch: (_task, at) => ({ ...CLEAR_AI, reviewerRef: caller.reviewerRef, verdictAt: at }),
        },
      );
    },

    async acceptEarly(caller: Caller, taskId: string) {
      requireRole(caller, "requester");
      await requireNotPaused(caller.agentId);
      return mutate(taskId, caller, { type: "accept_early" });
    },

    async disputeVerdict(caller: Caller, taskId: string, reason: string) {
      requireRole(caller, "requester", "worker");
      if (reason.trim().length < 10) throw new DeskError("invalid", "give a reason of at least 10 characters");
      return mutate(taskId, caller, { type: "dispute", by: caller.role, reason: reason.trim() }, {
        check(_tx, task, at) {
          if (task.verdictAt && at.getTime() - task.verdictAt.getTime() > POLICY.objectionWindowMs) {
            throw new DeskError("conflict", `the ${POLICY.objectionWindowMs / 3_600_000} hours to dispute this verdict have ended`);
          }
        },
      });
    },

    /**
     * The dispute panel has two members: boreal.work's AI reviewer and a person (R6.3). The AI
     * votes first; its vote is recorded in the trail and changes nothing. The person decides with
     * the vote in front of them, and their verdict stands when the two disagree. Only this moves
     * the task, so a panel decision is always a person's.
     */
    async decideDispute(
      caller: Caller,
      taskId: string,
      decision: { outcome: "pass" | "fail"; ruleIds: string[]; reasoning: string },
    ) {
      requireRole(caller, "panel");
      const vote = await this.panelAiVote(taskId);
      const aiVote = vote ? { outcome: vote.outcome, ruleIds: vote.ruleIds, model: vote.model } : null;
      return mutate(
        taskId,
        caller,
        decision.outcome === "pass"
          ? { type: "panel_pass", ruleIds: decision.ruleIds }
          : { type: "panel_fail", ruleIds: decision.ruleIds },
        {
          payload: {
            ...decision,
            panelRef: caller.reviewerRef,
            aiVote,
            // When the two agree it's unanimous; when they don't, the person's verdict stands.
            agreed: aiVote && aiVote.outcome !== "unsure" ? aiVote.outcome === decision.outcome : null,
          },
        },
      );
    },

    /** Disputed tasks the AI hasn't voted on yet, oldest first. */
    async disputeAiQueue(limit = 10) {
      return db
        .select()
        .from(tasks)
        .where(
          and(
            eq(tasks.status, "disputed"),
            sql`not exists (select 1 from ${taskEvents} where ${taskEvents.taskId} = ${tasks.id} and ${taskEvents.type} = 'panel_ai_vote')`,
          ),
        )
        .orderBy(asc(tasks.updatedAt))
        .limit(limit);
    },

    /** What the AI needs to vote: the disputed verdict and each side's statement (R6.2). */
    async disputeContext(taskId: string) {
      const events = await db
        .select()
        .from(taskEvents)
        .where(and(eq(taskEvents.taskId, taskId), inArray(taskEvents.type, ["verdict_pass", "verdict_fail", "dispute"])))
        .orderBy(asc(taskEvents.id));
      const verdictEvent = events.filter((e) => e.type !== "dispute").at(-1);
      const v = (verdictEvent?.payload ?? {}) as { ruleIds?: string[]; reasoning?: string; reviewerRef?: string };
      return {
        verdict: verdictEvent
          ? {
              outcome: verdictEvent.type === "verdict_pass" ? ("pass" as const) : ("fail" as const),
              ruleIds: v.ruleIds ?? [],
              reasoning: v.reasoning ?? "",
              by: v.reviewerRef ?? verdictEvent.actor,
            }
          : null,
        statements: events
          .filter((e) => e.type === "dispute")
          .map((e) => {
            const d = e.payload as { by?: string; reason?: string };
            return { party: d.by === "requester" ? ("requester" as const) : ("worker" as const), reason: d.reason ?? "" };
          }),
      };
    },

    /** Records the AI's panel vote in the trail. A vote, never a transition: the task doesn't move. */
    async recordPanelAiVote(
      caller: Caller,
      taskId: string,
      vote:
        | { outcome: "pass" | "fail"; ruleIds: string[]; reasoning: string; model: string; proof?: PrivateInferenceProof }
        | { outcome: "unsure"; reason: string },
    ) {
      requireRole(caller, "reviewer");
      return db.transaction(async (tx) => {
        const at = now();
        const [task] = await tx.select().from(tasks).where(eq(tasks.id, taskId)).for("update");
        if (!task) throw new DeskError("not_found", "task not found");
        if (task.status !== "disputed") throw new DeskError("conflict", "the dispute was already decided");
        await appendEvent(tx, { taskId, type: "panel_ai_vote", actor: caller.role, payload: { ...vote, reviewerRef: caller.reviewerRef }, at });
      });
    },

    /** The AI's latest panel vote on a task, for the person deciding the dispute. */
    async panelAiVote(taskId: string) {
      const [event] = await db
        .select()
        .from(taskEvents)
        .where(and(eq(taskEvents.taskId, taskId), eq(taskEvents.type, "panel_ai_vote")))
        .orderBy(desc(taskEvents.id))
        .limit(1);
      if (!event) return null;
      const p = event.payload as { outcome: "pass" | "fail" | "unsure"; ruleIds?: string[]; reasoning?: string; reason?: string; model?: string };
      return { outcome: p.outcome, ruleIds: p.ruleIds ?? [], reasoning: p.reasoning ?? p.reason ?? "", model: p.model ?? null, at: event.createdAt };
    },

    // Timers, run by the monitor loop. Each task moves in its own transaction, so one
    // failure or a race with a user action never blocks the rest.

    async expireClaims() {
      return sweep(
        and(eq(tasks.status, "claimed"), lte(tasks.claimExpiresAt, now())),
        { type: "claim_expired" },
        () => ({ claimedBy: null, claimExpiresAt: null }),
      );
    },

    async expireDeadlines() {
      // A funded task still in screening at its deadline expires too, and its money goes back.
      return sweep(and(inArray(tasks.status, ["posted", "open"]), lte(tasks.deadline, now())), {
        type: "deadline_passed",
      });
    },

    async closeObjectionWindows() {
      const cutoff = new Date(now().getTime() - POLICY.objectionWindowMs);
      return sweep(
        and(inArray(tasks.status, ["passed", "failed"]), lte(tasks.verdictAt, cutoff)),
        { type: "window_closed" },
      );
    },

    /**
     * A requester who reviews its own task has `POLICY.requesterReviewMs` to judge a submission.
     * After that it goes to boreal.work's reviewers (the human queue), recorded in the trail:
     * a silent requester never leaves a worker unpaid. The task's state doesn't change.
     */
    async escalateSilentReviews() {
      const cutoff = new Date(now().getTime() - POLICY.requesterReviewMs);
      const due = await db
        .select({ id: tasks.id })
        .from(tasks)
        .where(and(eq(tasks.status, "submitted"), eq(tasks.reviewMode, "requester"), eq(tasks.needsHuman, false), lte(tasks.updatedAt, cutoff)));
      const hours = POLICY.requesterReviewMs / (60 * 60 * 1000);
      let escalated = 0;
      for (const { id } of due) {
        const flagged = await db.transaction(async (tx) => {
          const at = now();
          const [task] = await tx.select().from(tasks).where(eq(tasks.id, id)).for("update");
          // The requester's verdict got there first.
          if (!task || task.status !== "submitted" || task.needsHuman || task.updatedAt > cutoff) return false;
          const reason = `the requester didn't review this within ${hours} hours`;
          await tx.update(tasks).set({ needsHuman: true, humanReason: reason, updatedAt: at }).where(eq(tasks.id, id));
          await appendEvent(tx, { taskId: id, type: "flagged_for_human", actor: "system", payload: { reason }, at });
          return true;
        });
        if (flagged) escalated++;
      }
      return escalated;
    },

    /**
     * Work that has waited on boreal.work's own people for too long: disputes past the time a
     * panel has to decide (`POLICY.disputeDecisionMs`), and anything in the human queue for
     * more than a day. Nothing decides itself; this is so it can't wait unnoticed (RS-18).
     */
    async overdueForPeople() {
      const at = now();
      const disputeCutoff = new Date(at.getTime() - POLICY.disputeDecisionMs);
      const queueCutoff = new Date(at.getTime() - 24 * 60 * 60 * 1000);
      const [row] = await db
        .select({
          disputes: sql<number>`count(*) filter (where ${tasks.status} = 'disputed' and ${tasks.updatedAt} <= ${disputeCutoff.toISOString()}::timestamptz)::int`,
          queued: sql<number>`count(*) filter (where ${tasks.needsHuman} and ${tasks.status} in ('posted', 'submitted') and ${tasks.updatedAt} <= ${queueCutoff.toISOString()}::timestamptz)::int`,
        })
        .from(tasks);
      return { disputes: row?.disputes ?? 0, queued: row?.queued ?? 0 };
    },

    /**
     * Whether this worker may hand in a result for the task right now: they hold its claim and
     * it hasn't run out. Checked before any file is stored, so files are only ever kept for a
     * task the uploader is doing.
     */
    async assertCanSubmit(caller: Caller, taskId: string) {
      requireRole(caller, "worker");
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(taskId)) throw new DeskError("not_found", "task not found");
      const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
      if (!task) throw new DeskError("not_found", "task not found");
      if (task.status !== "claimed" || task.claimedBy !== caller.workerId) throw new DeskError("forbidden", "this task is not claimed by you");
      if (task.claimExpiresAt && task.claimExpiresAt <= now()) throw new DeskError("conflict", "your claim has expired");
    },

    /** Starts Concordium ID sign-in: the proof the worker's wallet must answer. */
    async workerProofRequest(attributes: ProofRequest["attributes"] = []) {
      return requireConcordium().identity.createProofRequest(attributes);
    },

    /**
     * Finishes sign-in. One account per person: the same pseudonym always maps to the same
     * worker, and its proven attributes are refreshed from the latest proof.
     */
    async signInWorker(request: ProofRequest, presentation: unknown, payoutAddress?: string) {
      const verified = await verifyProof(request, presentation);
      return signInConcordium(verified, payoutAddress);
    },

    /** Tasks waiting on the AI reviewer: posted ones to screen, submitted ones to review. */
    async aiQueue(stage: "screen" | "review", limit = 10) {
      return db
        .select()
        .from(tasks)
        .where(
          and(
            eq(tasks.status, stage === "screen" ? "posted" : "submitted"),
            // Requester-reviewed tasks are judged by their requester, not the AI.
            stage === "review" ? eq(tasks.reviewMode, "boreal") : undefined,
            eq(tasks.needsHuman, false),
            or(isNull(tasks.aiRetryAt), lte(tasks.aiRetryAt, now())),
          ),
        )
        .orderBy(asc(tasks.updatedAt))
        .limit(limit);
    },

    /** Tasks a human reviewer must decide, oldest first. */
    async humanQueue(limit = 50) {
      return db.select().from(tasks).where(eq(tasks.needsHuman, true)).orderBy(asc(tasks.updatedAt)).limit(limit);
    },

    /** Hands a task to the human queue, recorded in the trail. The task's state doesn't change. */
    async flagForHuman(caller: Caller, taskId: string, reason: string) {
      requireRole(caller, "reviewer", "system");
      return db.transaction(async (tx) => {
        const at = now();
        const [task] = await tx.select().from(tasks).where(eq(tasks.id, taskId)).for("update");
        if (!task) throw new DeskError("not_found", "task not found");
        const [updated] = await tx
          .update(tasks)
          .set({ needsHuman: true, humanReason: reason, aiRetryAt: null, updatedAt: at })
          .where(eq(tasks.id, taskId))
          .returning();
        await appendEvent(tx, { taskId, type: "flagged_for_human", actor: caller.role, payload: { reason }, at });
        return updated!;
      });
    },

    /** Records a failed AI attempt; retries back off, and the third failure goes to a human. */
    async deferAi(taskId: string, reason: string) {
      const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
      if (!task) throw new DeskError("not_found", "task not found");
      const attempts = task.aiAttempts + 1;
      if (attempts >= MAX_AI_ATTEMPTS) {
        return this.flagForHuman({ role: "system" }, taskId, `AI reviewer failed ${attempts} times: ${reason}`);
      }
      const [updated] = await db
        .update(tasks)
        .set({ aiAttempts: attempts, aiRetryAt: new Date(now().getTime() + 2 ** attempts * 60_000) })
        .where(eq(tasks.id, taskId))
        .returning();
      return updated!;
    },

    /**
     * Stores a Concordium ID proof request until the wallet answers. Call
     * checkVerificationAllowed first: each request costs an on-chain anchor transaction.
     */
    async saveVerificationRequest(connectionId: string, request: unknown, clientHash: string) {
      const at = now();
      const [row] = await db
        .insert(verificationRequests)
        .values({ connectionId, request, clientHash, createdAt: at })
        .returning({ id: verificationRequests.id });
      return row!.id;
    },

    /** Checks a sign-in may start, before its anchor transaction is paid for. */
    async checkVerificationAllowed(clientHash: string) {
      const at = now();
      const [recent] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(verificationRequests)
        .where(and(eq(verificationRequests.clientHash, clientHash), gt(verificationRequests.createdAt, new Date(at.getTime() - 10 * 60_000))));
      if ((recent?.n ?? 0) >= 5) throw new DeskError("limit", "too many sign-in attempts; try again in a few minutes");
      const [today] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(verificationRequests)
        .where(gt(verificationRequests.createdAt, new Date(at.getTime() - 24 * 3600_000)));
      if ((today?.n ?? 0) >= 300) throw new DeskError("limit", "sign-in is busy right now; try again later");
    },

    /** Takes a pending request exactly once, within 15 minutes of its creation. */
    async takeVerificationRequest(id: string) {
      const at = now();
      const [row] = await db
        .update(verificationRequests)
        .set({ completedAt: at })
        .where(
          and(
            eq(verificationRequests.id, id),
            isNull(verificationRequests.completedAt),
            gt(verificationRequests.createdAt, new Date(at.getTime() - 15 * 60_000)),
          ),
        )
        .returning();
      if (!row) throw new DeskError("conflict", "this sign-in request has expired or was already used; start again");
      return row;
    },

    /**
     * Signs in a worker whose Concordium proof has been verified; one worker per Concordium
     * identity. With `walletRef`, the wallet account that answered is remembered for next time.
     */
    async signInVerifiedWorker(verified: ConcordiumIdentity, walletRef?: string) {
      checkWalletRef(walletRef);
      const worker = await signInConcordium(verified);
      if (walletRef) await rememberWallet(worker.id, walletRef);
      return worker;
    },

    /**
     * Signs in by a wallet account that answered an earlier proof, once the caller has checked
     * that account signed this sign-in's challenge. Null when no worker has it yet: prove first.
     */
    async signInWithWallet(walletRef: string, options: { create?: boolean } = {}) {
      checkWalletRef(walletRef);
      const [worker] = await db.select().from(workers).where(eq(workers.concordiumWalletRef, walletRef));
      if (worker || !options.create) return worker ?? null;
      // A new wallet signs in by its signature alone, like a new PayPal account: every Concordium
      // account sits on a verified identity, so nothing more is needed to sign in. The paid,
      // anchored identity proof waits until the worker adds the Concordium ID badge.
      const at = now();
      const [created] = await db
        .insert(workers)
        .values({ pseudonym: walletRef, concordiumWalletRef: walletRef, provenAttributes: {}, createdAt: at, updatedAt: at })
        .onConflictDoNothing({ target: workers.concordiumWalletRef })
        .returning();
      if (created) return created;
      const [raced] = await db.select().from(workers).where(eq(workers.concordiumWalletRef, walletRef));
      return raced ?? null;
    },

    /**
     * Log in with PayPal: one worker per PayPal account. A new worker's ID is the PayPal hash,
     * and their payout goes to the PayPal email in the same step.
     */
    /**
     * An AI agent signs in as a worker with a NEAR account it proved it controls (the caller
     * checks the signature). One worker per NEAR account, paid to that account. Each sign-in
     * issues a new `bw_` key; a signature no newer than the last one issued can't issue another.
     */
    async signInAgentWorker(nearAccount: string, signedAt: Date) {
      if (!NEAR_ACCOUNT.test(nearAccount)) throw new DeskError("invalid", "that isn't a NEAR account id");
      const at = now();
      return db.transaction(async (tx) => {
        const pseudonym = `near:${nearAccount}`;
        await tx
          .insert(workers)
          .values({ pseudonym, kind: "agent", nearAccount, provenAttributes: {}, createdAt: at, updatedAt: at })
          .onConflictDoNothing({ target: workers.pseudonym });
        const [worker] = await tx.select().from(workers).where(eq(workers.pseudonym, pseudonym)).for("update");
        if (!worker || worker.kind !== "agent") throw new DeskError("conflict", "that NEAR account belongs to a person's account");
        if (worker.apiKeyIssuedAt && signedAt <= worker.apiKeyIssuedAt) {
          throw new DeskError("conflict", "that signature was already used; sign a new sign-in message");
        }
        const key = await issueWorkerKey(tx, worker.id, signedAt);
        return { workerId: worker.id, key };
      });
    },

    async signInWithPayPal(identity: PayPalIdentity) {
      checkPayPalIdentity(identity);
      const at = now();
      const [worker] = await db
        .insert(workers)
        .values({
          pseudonym: identity.ref,
          paypalRef: identity.ref,
          paypalEmail: identity.email,
          paypalVerified: identity.verified,
          provenAttributes: {},
          createdAt: at,
          updatedAt: at,
        })
        .onConflictDoUpdate({
          target: workers.paypalRef,
          set: { paypalEmail: identity.email, paypalVerified: identity.verified, updatedAt: at },
        })
        .returning();
      return worker!;
    },

    /** Adds PayPal to the signed-in worker: their sign-in, payout email and verified status. */
    async linkPayPal(caller: Caller, identity: PayPalIdentity) {
      requireRole(caller, "worker");
      checkPayPalIdentity(identity);
      return linkIdentity(caller.workerId, "paypal", identity.ref, {
        paypalRef: identity.ref,
        paypalEmail: identity.email,
        paypalVerified: identity.verified,
      });
    },

    /** Adds Concordium ID to the signed-in worker (development wallet): the badge and proven attributes. */
    async linkConcordium(caller: Caller, request: ProofRequest, presentation: unknown) {
      requireRole(caller, "worker");
      return this.linkVerifiedConcordium(caller, await verifyProof(request, presentation));
    },

    /** Adds a verified Concordium ID to the signed-in worker: the badge and proven attributes. */
    async linkVerifiedConcordium(caller: Caller, verified: ConcordiumIdentity, walletRef?: string) {
      requireRole(caller, "worker");
      checkWalletRef(walletRef);
      if (await samePerson(verified.personRef, caller.workerId, verified.pseudonym)) throw new DeskError("conflict", SAME_PERSON);
      const kept = await linkIdentity(caller.workerId, "concordium", verified.pseudonym, {
        concordiumRef: verified.pseudonym,
        provenAttributes: verified.provenAttributes,
        ...(verified.personRef ? { personRef: verified.personRef } : {}),
      });
      if (walletRef) await rememberWallet(kept.id, walletRef);
      return kept;
    },

    /** Sends due anchors, payouts, refunds, captures and releases. Run by the monitor loop. */
    async drainOutbox(limit?: number, options: { pausedRails?: ReadonlySet<PaymentRail | "all"> } = {}) {
      return drainOutbox(db, { payments: requirePayments(), rails: allRails, anchor: concordium?.anchor ?? null }, { now, addresses, limit, pausedRails: options.pausedRails });
    },

    async reconcileEscrow(rail?: PaymentRail) {
      return reconcileEscrow(db, requirePayments(rail), rail);
    },

    /** Escrow against the ledger on every rail configured here; a rail that can't answer says why. */
    async adminReconcile(): Promise<ReconcileResult[]> {
      return Promise.all(
        (Object.entries(allRails) as [PaymentRail, Payments][]).map(async ([rail, payments]) => {
          try {
            return { rail, ...(await reconcileEscrow(db, payments, rail)) };
          } catch (error) {
            return { rail, error: error instanceof Error ? error.message : String(error) };
          }
        }),
      );
    },

    /** The anomaly agent's findings: failed and stuck payouts, refund spikes, escrow gaps. */
    async adminAnomalies() {
      const [data, reconciliation] = await Promise.all([consoleViews(db, now).adminConsole({ days: 30 }), commands.adminReconcile()]);
      return { anomalies: findAnomalies(data, reconciliation, now()), reconciliation };
    },

    /** The default payment rail, or null when payments are off. */
    payments,
    /** Every configured rail, by name. */
    rails: allRails,
    defaultRail,

    /** A provider's report on a payout (a verified PayPal webhook), applied to the ledger by the outbox. */
    async queuePaymentUpdate(update: PaymentStatusUpdate) {
      await queuePaymentUpdate(db, update, now());
    },

    /**
     * Where this worker is paid: a Concordium account, a NEAR account, or a PayPal email. The
     * account is always the worker's own: boreal never holds a wallet for anyone and never
     * converts between rails. With `guided`, a first account on a chain set up through boreal's
     * guided setup is counted (the chain only; nothing about the worker).
     */
    async setPayoutAddress(caller: Caller, address: string, rail: PaymentRail = "concordium", options: { guided?: boolean } = {}) {
      requireRole(caller, "worker");
      const value = address.trim();
      if (rail === "paypal" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) throw new DeskError("invalid", "enter the email address of your PayPal account");
      if (rail === "near" && !NEAR_ACCOUNT.test(value)) throw new DeskError("invalid", "enter a NEAR account id, such as you.near or a 64-character implicit account");
      if (rail === "evm" && !/^0x[0-9a-fA-F]{40}$/.test(value)) throw new DeskError("invalid", "that isn't an EVM address");
      if (value.length < 3 || value.length > 254 || /\s/.test(value)) throw new DeskError("invalid", "that payout address doesn't look right");
      const column = rail === "paypal" ? { paypalEmail: value } : rail === "near" ? { nearAccount: value } : rail === "evm" ? { evmAddress: value } : { payoutAddress: value };
      const field = rail === "paypal" ? workers.paypalEmail : rail === "near" ? workers.nearAccount : rail === "evm" ? workers.evmAddress : workers.payoutAddress;
      await db.transaction(async (tx) => {
        const [before] = await tx.select().from(workers).where(eq(workers.id, caller.workerId)).for("update");
        if (!before) throw new DeskError("not_found", "worker not found");
        // One person, one account: a payout destination pays one worker. (A closed account
        // releases its own, so someone coming back can connect the same wallet again.)
        const [taken] = await tx
          .select({ id: workers.id })
          .from(workers)
          .where(and(rail === "evm" ? sql`lower(${field}) = lower(${value})` : eq(field, value), ne(workers.id, caller.workerId), isNull(workers.closedAt)))
          .limit(1);
        if (taken) {
          throw new DeskError("conflict", "that payout account is already connected to another boreal.work account. One account per person: sign in with that account instead");
        }
        const at = now();
        await tx.update(workers).set({ ...column, updatedAt: at }).where(eq(workers.id, caller.workerId));
        const first = rail === "near" ? !before.nearAccount : rail === "concordium" ? !before.payoutAddress : false;
        if (options.guided && first && (rail === "near" || rail === "concordium")) {
          await tx.insert(walletSetups).values({ chain: rail, createdAt: at });
        }
      });
    },

    /** First wallet setups through boreal's guided setup, per chain: a headline, with nothing personal. */
    async walletSetupCounts(): Promise<{ near: number; concordium: number }> {
      const rows = await db.select({ chain: walletSetups.chain, n: sql<number>`count(*)::int` }).from(walletSetups).groupBy(walletSetups.chain);
      return { near: rows.find((r) => r.chain === "near")?.n ?? 0, concordium: rows.find((r) => r.chain === "concordium")?.n ?? 0 };
    },

    /** Whether this worker has a payout account on the task's rail, so a claim can go through. */
    async payoutReady(caller: Caller, rail: PaymentRail | null): Promise<boolean> {
      requireRole(caller, "worker");
      if (!rail) return true;
      const [worker] = await db.select().from(workers).where(eq(workers.id, caller.workerId));
      if (!worker) return false;
      return rail === "paypal" ? !!worker.paypalEmail : rail === "near" ? !!worker.nearAccount : rail === "evm" ? !!worker.evmAddress : !!worker.payoutAddress;
    },

    /** An owner moves one of their agents between test money and real (testnet or sandbox) money. */
    async setAgentTestMode(workerId: string, agentId: string, testMode: boolean) {
      const [worker] = await db.select().from(workers).where(eq(workers.id, workerId));
      if (!worker || worker.testMode) throw new DeskError("forbidden", "tester accounts can't manage agents");
      const mine = await ownedAgentIds(worker.pseudonym);
      if (!mine.has(agentId)) throw new DeskError("forbidden", "that agent isn't yours");
      await db.update(agents).set({ testMode, updatedAt: now() }).where(eq(agents.id, agentId));
    },

    async getTask(caller: Caller, taskId: string) {
      const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
      if (!task) throw new DeskError("not_found", "task not found");
      if (caller.role === "requester" && task.agentId !== caller.agentId) {
        throw new DeskError("not_found", "task not found");
      }
      if (caller.role === "worker" && task.status !== "open" && task.claimedBy !== caller.workerId) {
        throw new DeskError("not_found", "task not found");
      }
      return (await withAgentBadge([task]))[0]!;
    },

    /** The signed-in worker's own profile: pseudonym and proven attributes, nothing else is kept. */
    async getWorker(caller: Caller) {
      requireRole(caller, "worker");
      const [worker] = await db
        .select({
          pseudonym: workers.pseudonym,
          provenAttributes: workers.provenAttributes,
          testMode: workers.testMode,
          payoutAddress: workers.payoutAddress,
          paypalEmail: workers.paypalEmail,
          nearAccount: workers.nearAccount,
          evmAddress: workers.evmAddress,
          // Which identities sign this worker in; the hashes themselves stay in the database.
          hasPayPal: sql<boolean>`${workers.paypalRef} is not null`,
          paypalVerified: workers.paypalVerified,
          hasConcordium: sql<boolean>`${workers.concordiumRef} is not null`,
          hasConcordiumAccount: sql<boolean>`${workers.concordiumWalletRef} is not null`,
          kind: workers.kind,
          createdAt: workers.createdAt,
        })
        .from(workers)
        .where(eq(workers.id, caller.workerId));
      return worker ?? null;
    },

    /**
     * Open tasks this worker has proven the attributes for, newest first. Without Concordium ID
     * a worker also sees tasks that need it (marked on the card), so they know to add it. Tasks
     * they posted themselves (or their agents did) aren't theirs to claim, so they're left out.
     */
    async browseOpenTasks(caller: Caller) {
      requireRole(caller, "worker");
      const [worker] = await db.select().from(workers).where(eq(workers.id, caller.workerId));
      if (!worker) throw new DeskError("not_found", "worker not found");
      const open = await db
        .select()
        .from(tasks)
        .where(and(eq(tasks.status, "open"), gt(tasks.deadline, now())))
        .orderBy(desc(tasks.createdAt))
        .limit(100);
      const mine = await ownedAgentIds(worker.pseudonym);
      return withAgentBadge(open).then((rows) => rows.filter(
        (task) =>
          // An agent sees only tasks open to agents that pay on its rail (USDC on NEAR).
          (worker.kind === "person" || (task.fulfillers === "people_or_agents" && task.paymentRail === "near")) &&
          (task.test ? worker.testMode || mine.has(task.agentId) : !worker.testMode && !mine.has(task.agentId)) &&
          (meetsAttributes(task.requiredAttributes, worker.provenAttributes) ||
            (verification.concordiumId && !worker.testMode && !worker.concordiumRef)),
      ));
    },

    /** The worker's own tasks: claimed, submitted, under review and finished. */
    async listWorkerTasks(caller: Caller) {
      requireRole(caller, "worker");
      return withAgentBadge(
        await db.select().from(tasks).where(eq(tasks.claimedBy, caller.workerId)).orderBy(desc(tasks.updatedAt)).limit(50),
      );
    },

    /**
     * review_result for tasks posted with `reviewer: "requester"`: the requester judges its own
     * task. The same rules bind it: a fail cites a rule, and the worker can dispute once.
     */
    async requesterReview(
      caller: Caller,
      taskId: string,
      verdict: { outcome: "pass" | "fail"; ruleIds: string[]; reasoning: string },
    ) {
      requireRole(caller, "requester");
      await requireNotPaused(caller.agentId);
      const task = await this.getTask(caller, taskId);
      if (task.reviewMode !== "requester") {
        throw new DeskError("forbidden", "boreal.work's reviewer judges this task; you can accept a pass early or dispute");
      }
      if (verdict.outcome === "fail" && verdict.ruleIds.length === 0) {
        throw new DeskError("invalid", "a fail must cite at least one rule (R5.3)");
      }
      if (verdict.reasoning.trim().length < 5) throw new DeskError("invalid", "explain the verdict for the worker");
      const reviewer: Caller = { role: "reviewer", reviewerRef: `requester:${caller.agentId}` };
      const judged = await mutate(
        taskId,
        reviewer,
        verdict.outcome === "pass"
          ? { type: "verdict_pass", ruleIds: verdict.ruleIds }
          : { type: "verdict_fail", ruleIds: verdict.ruleIds },
        {
          payload: { ...verdict, reviewerRef: reviewer.reviewerRef },
          patch: (_task, at) => ({ ...CLEAR_AI, reviewerRef: reviewer.reviewerRef, verdictAt: at }),
        },
      );
      // The requester judged it themselves: a pass has no one left to object, so it is final
      // and the worker is paid now, not after the objection window. A fail keeps its window
      // for the worker's one dispute.
      if (verdict.outcome === "pass") return mutate(taskId, caller, { type: "accept_early" });
      return judged;
    },

    /**
     * Test sign-in for allowlisted testers while Concordium ID isn't live: an invite code
     * instead of a proof, and the worker is walled off to test tasks.
     */
    async signInTestWorker(invite: string, pseudonym: string, attributes: Record<string, string>) {
      const expected = Buffer.from(testInvite ?? "");
      const given = Buffer.from(invite);
      if (!testInvite || testInvite.length < 12 || expected.length !== given.length || !timingSafeEqual(expected, given)) {
        throw new DeskError("forbidden", "that invite code isn't valid");
      }
      const name = pseudonym.trim();
      if (!/^[a-z0-9-]{3,32}$/.test(name)) {
        throw new DeskError("invalid", "pseudonym: 3 to 32 lowercase letters, digits or dashes");
      }
      const at = now();
      const [worker] = await db
        .insert(workers)
        .values({ pseudonym: `test:${name}`, provenAttributes: attributes, testMode: true, createdAt: at, updatedAt: at })
        .onConflictDoUpdate({ target: workers.pseudonym, set: { provenAttributes: attributes, updatedAt: at } })
        .returning();
      return worker!;
    },

    /** The verdict that stands: the panel's if there was a dispute, else the reviewer's. Reviewers stay anonymous. */
    async getVerdict(caller: Caller, taskId: string) {
      await this.getTask(caller, taskId);
      const [event] = await db
        .select()
        .from(taskEvents)
        .where(
          and(
            eq(taskEvents.taskId, taskId),
            inArray(taskEvents.type, ["verdict_pass", "verdict_fail", "panel_pass", "panel_fail"]),
          ),
        )
        .orderBy(desc(taskEvents.id))
        .limit(1);
      if (!event) return null;
      const { outcome, ruleIds, reasoning, proof } = event.payload as {
        outcome: "pass" | "fail";
        ruleIds: string[];
        reasoning: string;
        proof?: PrivateInferenceProof;
      };
      // Reviewed privately in a TEE: enough to show it and to check it; the full proof is in the trail.
      const privateReview = proof
        ? { provider: proof.provider, model: proof.model, completionId: proof.completionId, signingAddress: proof.signingAddress, attestedAt: proof.attestation.checkedAt }
        : null;
      return { outcome, ruleIds, reasoning, by: event.actor as "reviewer" | "panel", at: event.createdAt, privateReview };
    },

    /**
     * The standing verdict's full private-review proof (signature, hashes, the TEE quote), so
     * anyone who can see the task can repeat the checks. Null when it wasn't reviewed privately.
     */
    async getReviewProof(caller: Caller, taskId: string): Promise<PrivateInferenceProof | null> {
      await this.getTask(caller, taskId);
      const [event] = await db
        .select({ payload: taskEvents.payload })
        .from(taskEvents)
        .where(
          and(
            eq(taskEvents.taskId, taskId),
            inArray(taskEvents.type, ["verdict_pass", "verdict_fail", "panel_pass", "panel_fail"]),
          ),
        )
        .orderBy(desc(taskEvents.id))
        .limit(1);
      return (event?.payload as { proof?: PrivateInferenceProof } | undefined)?.proof ?? null;
    },

    /** Why screening refused a task: the rules it broke and the screener's reasoning. */
    async getRefusal(caller: Caller, taskId: string) {
      await this.getTask(caller, taskId);
      const [event] = await db
        .select()
        .from(taskEvents)
        .where(and(eq(taskEvents.taskId, taskId), eq(taskEvents.type, "screen_refused")))
        .orderBy(desc(taskEvents.id))
        .limit(1);
      if (!event) return null;
      const { ruleIds = [], reasoning } = event.payload as { ruleIds?: string[]; reasoning?: string };
      return { ruleIds, reasoning: reasoning ?? null, at: event.createdAt };
    },

    /** The latest submission, for the worker who made it or the task's requester. */
    async getSubmission(caller: Caller, taskId: string) {
      const task = await this.getTask(caller, taskId);
      if (caller.role === "worker" && task.claimedBy !== caller.workerId) return null;
      const [submission] = await db
        .select()
        .from(submissions)
        .where(eq(submissions.taskId, taskId))
        .orderBy(desc(submissions.createdAt))
        .limit(1);
      return submission ?? null;
    },

    /** get_account: who the calling agent is to the desk, its limits and what it has left today. */
    async getAgentAccount(caller: Caller) {
      requireRole(caller, "requester");
      const [agent] = await db.select().from(agents).where(eq(agents.id, caller.agentId));
      if (!agent) throw new DeskError("not_found", "agent not found");
      const since = new Date(now().getTime() - 24 * 60 * 60 * 1000);
      const [spent] = await db
        .select({ total: sql<number>`coalesce(sum(${ledgerEntries.amount}), 0)::int` })
        .from(ledgerEntries)
        .where(
          and(
            eq(ledgerEntries.party, agent.id),
            eq(ledgerEntries.fromAccount, "requester"),
            gte(ledgerEntries.createdAt, since),
          ),
        );
      const spentLast24h = spent?.total ?? 0;
      // In force now: an unverified requester is capped below its owner's limits.
      const verified = await requesterVerified(agent);
      const limits = effectiveLimits(agent, verified);
      return {
        agentId: agent.id,
        name: agent.name,
        status: agent.status,
        testMode: agent.testMode,
        /** agent, market, or personal: a person's own requester (posting on the website). */
        kind: agent.kind,
        registryId: agent.registryId,
        refundAddress: agent.refundAddress,
        verifiedByConcordium: agent.badgeVerifiedAt
          ? { badge: agent.registryId, network: agent.badgeNetwork, ownerAccount: agent.ownerAccount, verifiedAt: agent.badgeVerifiedAt }
          : null,
        /** Verified (badge, Concordium ID, or a PayPal-verified owner where PayPal verifies): the owner's full limits apply. */
        verified,
        limits,
        /** The owner saved a payment method: fund_task pays without an approval page. */
        savedPaymentMethod: agent.paymentVaultId !== null,
        /**
         * `ask`: your owner approves each payment from the saved payment method (fund_task
         * returns an approval for them to open). `auto`: you pay on your own, within your limits.
         */
        spendingMode: agent.spendingMode,
        /** Your owner paused you: you can read and cancel, but not post, fund, accept or review. */
        paused: agent.pausedAt !== null,
        /** The agent's own NEAR account (set_near_account), which its owner funds and it pays tasks from. */
        nearAccount: agent.nearAccount,
        spentLast24h,
        leftToday: Math.max(0, limits.maxDailySpend - spentLast24h),
      };
    },

    /** list_tasks: the requester's own tasks, newest first. */
    async listTasks(caller: Caller, filter: { status?: TaskStatus; limit?: number } = {}) {
      requireRole(caller, "requester");
      const limit = Math.min(Math.max(filter.limit ?? 20, 1), 100);
      return db
        .select()
        .from(tasks)
        .where(
          filter.status
            ? and(eq(tasks.agentId, caller.agentId), eq(tasks.status, filter.status))
            : eq(tasks.agentId, caller.agentId),
        )
        .orderBy(desc(tasks.createdAt))
        .limit(limit);
    },

    async getTrail(caller: Caller, taskId: string) {
      await this.getTask(caller, taskId);
      return db
        .select({
          type: taskEvents.type,
          actor: taskEvents.actor,
          hash: taskEvents.hash,
          prevHash: taskEvents.prevHash,
          at: taskEvents.createdAt,
        })
        .from(taskEvents)
        .where(eq(taskEvents.taskId, taskId))
        .orderBy(asc(taskEvents.id));
    },
  };

  // Object.assign is typed for up to three sources, so the read-only views go in as one.
  const owner = ownerCommands(db, now, (caller, taskId, approvalId) => commands.fundTask(caller, taskId, { vault: true }, { rail: "paypal", approvalId }));
  return Object.assign(commands, { ...adminViews(db, now), ...consoleViews(db, now), ...insightsViews(db), ...owner }, { ...adminCommands(db, now, commands), ...controlCommands(db, now), ...passkeyCommands(db, now), ...accountCommands(db, now) });

  async function sweep(
    where: ReturnType<typeof and>,
    event: TaskEvent,
    patch?: () => TaskPatch,
  ): Promise<number> {
    const due = await db.select({ id: tasks.id }).from(tasks).where(where);
    let moved = 0;
    const failed: string[] = [];
    for (const { id } of due) {
      try {
        await mutate(id, { role: "system" }, event, patch ? { patch } : {});
        moved++;
      } catch (error) {
        // A user action got there first; the state machine refused the stale move.
        if (error instanceof DeskError && error.code === "conflict") continue;
        // One task that can't move never holds up the rest: they all get their turn first.
        console.error(`[desk] ${event.type} failed for task ${id}`, error);
        failed.push(`${id}: ${error instanceof Error ? error.message.split("\n")[0]!.slice(0, 200) : String(error)}`);
      }
    }
    if (failed.length > 0) {
      throw new Error(`${event.type}: ${failed.length} of ${due.length} tasks couldn't be moved (${moved} were): ${failed.slice(0, 3).join("; ")}`);
    }
    return moved;
  }
}

export type Desk = ReturnType<typeof createDesk>;
