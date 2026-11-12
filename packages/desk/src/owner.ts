import { POLICY } from "@boreal/core";

import {
  agents,
  and,
  type Database,
  desc,
  eq,
  fundingApprovals,
  gte,
  inArray,
  ledgerEntries,
  ne,
  ownerActions,
  owners,
  sql,
  type Task,
  tasks,
  type Transaction,
  workers,
} from "@boreal/db";

import { DeskError } from "./errors";
import { taskTotal } from "./money";

/** Money in a refusal a person reads: dollars, never cents. */
const dollars = (c: number) => `$${(c / 100).toFixed(2)}`;

// What an owner controls about their agents: whether each payment from the saved payment
// method needs their approval, the limits, pausing, taking the key back and disconnecting the
// payment method. Every change is written to `owner_actions`. The rules are enforced here and
// in the desk's funding checks, never in a client: MCP, REST, A2A and the plugin all meet them.

type Requester = { role: "requester"; agentId: string };
export type SpendingMode = "ask" | "auto";

/** Funds one task from the agent's saved payment method, under an approval. The desk's own fundTask. */
export type FundApproved = (caller: Requester, taskId: string, approvalId: string) => Promise<Task>;

const DAY = 24 * 60 * 60 * 1000;

/** The limits an owner may set, checked the same way at approval and when they change them later. */
export function checkLimits(maxTaskBudget: number, maxDailySpend: number): void {
  if (!Number.isSafeInteger(maxTaskBudget) || maxTaskBudget < 1 || maxTaskBudget > POLICY.maxTaskBudget) {
    throw new DeskError("invalid", `the most per task must be between $0.01 and ${dollars(POLICY.maxTaskBudget)}`);
  }
  if (!Number.isSafeInteger(maxDailySpend) || maxDailySpend < maxTaskBudget || maxDailySpend > POLICY.maxAgentDailySpend) {
    throw new DeskError("invalid", `the most per day must be at least the most per task, and at most ${dollars(POLICY.maxAgentDailySpend)}`);
  }
}

/**
 * Whether a payment from the saved payment method may go ahead for this task. In `ask` mode
 * only under an approval the owner gave for exactly this task; called inside the funding
 * transaction, on the locked agent.
 */
export async function assertSavedPaymentAllowed(
  tx: Transaction,
  agent: { id: string; kind: string; spendingMode: SpendingMode },
  task: Task,
  approvalId: string | undefined,
): Promise<void> {
  if (agent.kind !== "agent" || agent.spendingMode !== "ask") return;
  if (!approvalId) {
    throw new DeskError("forbidden", "your owner approves each payment: fund_task returns an approval for them to open");
  }
  const [approval] = await tx.select().from(fundingApprovals).where(eq(fundingApprovals.id, approvalId)).for("update");
  if (!approval || approval.agentId !== agent.id || approval.status !== "approved" || !approval.taskIds.includes(task.id)) {
    throw new DeskError("forbidden", "this payment isn't covered by an approval from your owner");
  }
}

export function ownerCommands(db: Database, now: () => Date, fundApproved: FundApproved) {
  /** The owner a signed-in person is, or a refusal. Testers never own agents. */
  async function ownerOf(workerId: string) {
    const [found] = await db
      .select({ owner: owners, testMode: workers.testMode })
      .from(workers)
      .innerJoin(owners, eq(owners.verifiedRef, workers.pseudonym))
      .where(eq(workers.id, workerId));
    if (!found || found.testMode) throw new DeskError("forbidden", "that agent isn't yours");
    return found.owner;
  }

  /** One of the owner's agents (never their own personal requester), locked when in a transaction. */
  async function ownedAgent(q: Database | Transaction, ownerId: string, agentId: string, lock = false) {
    if (!/^[0-9a-f-]{36}$/i.test(agentId)) throw new DeskError("forbidden", "that agent isn't yours");
    const query = q
      .select()
      .from(agents)
      .where(and(eq(agents.id, agentId), eq(agents.ownerId, ownerId), ne(agents.kind, "personal")));
    const [agent] = lock ? await query.for("update") : await query;
    if (!agent) throw new DeskError("forbidden", "that agent isn't yours");
    return agent;
  }

  async function record(tx: Transaction, ownerId: string, agentId: string, action: string, detail: unknown, at: Date) {
    await tx.insert(ownerActions).values({ ownerId, agentId, action, detail: detail ?? null, createdAt: at });
  }

  /** Runs a change on one of the owner's agents in one transaction, with its audit row. */
  async function change<T>(
    workerId: string,
    agentId: string,
    action: string,
    run: (tx: Transaction, agent: typeof agents.$inferSelect, at: Date) => Promise<{ detail?: unknown; result: T }>,
  ): Promise<T> {
    const owner = await ownerOf(workerId);
    return db.transaction(async (tx) => {
      const agent = await ownedAgent(tx, owner.id, agentId, true);
      const at = now();
      const { detail, result } = await run(tx, agent, at);
      await record(tx, owner.id, agent.id, action, detail, at);
      return result;
    });
  }

  const spentSince = (since: Date | null) =>
    sql<number>`coalesce(sum(case when ${since ? sql`${ledgerEntries.createdAt} >= ${since.toISOString()}::timestamptz` : sql`true`} then ${ledgerEntries.amount} else 0 end), 0)::int`;

  return {
    /** Pauses or resumes an agent. Paused, it can read and cancel, but not post, fund, accept or review. */
    async ownerSetPaused(workerId: string, agentId: string, paused: boolean) {
      return change(workerId, agentId, paused ? "pause" : "resume", async (tx, agent, at) => {
        if (Boolean(agent.pausedAt) === paused) throw new DeskError("conflict", paused ? "the agent is already paused" : "the agent isn't paused");
        await tx.update(agents).set({ pausedAt: paused ? at : null, updatedAt: at }).where(eq(agents.id, agent.id));
        return { result: { paused } };
      });
    },

    /** Takes the agent's key back. It gets a new one only through a new link its owner approves. */
    async ownerRevokeKey(workerId: string, agentId: string) {
      return change(workerId, agentId, "revoke_key", async (tx, agent, at) => {
        if (!agent.apiKeyHash) throw new DeskError("conflict", "the agent has no key");
        await tx.update(agents).set({ apiKeyHash: null, updatedAt: at }).where(eq(agents.id, agent.id));
        return { result: { revoked: true } };
      });
    },

    /** Changes the agent's limits and whether each payment needs approval. In force from the next payment. */
    async ownerSetLimits(workerId: string, agentId: string, input: { maxTaskBudget: number; maxDailySpend: number; spendingMode: SpendingMode }) {
      checkLimits(input.maxTaskBudget, input.maxDailySpend);
      if (input.spendingMode !== "ask" && input.spendingMode !== "auto") throw new DeskError("invalid", "spendingMode must be ask or auto");
      return change(workerId, agentId, "set_limits", async (tx, agent, at) => {
        const before = { maxTaskBudget: agent.maxTaskBudget, maxDailySpend: agent.maxDailySpend, spendingMode: agent.spendingMode };
        await tx.update(agents).set({ ...input, updatedAt: at }).where(eq(agents.id, agent.id));
        return { detail: { before, after: input }, result: input };
      });
    },

    /**
     * Forgets the payment method saved for the agent. Returns its id so the caller can also
     * delete it at the provider; from here on the agent needs a fresh approval to pay.
     */
    async ownerDisconnectPayment(workerId: string, agentId: string) {
      return change(workerId, agentId, "disconnect_payment", async (tx, agent, at) => {
        if (!agent.paymentVaultId) throw new DeskError("conflict", "no PayPal account is saved for this agent");
        await tx.update(agents).set({ paymentVaultId: null, updatedAt: at }).where(eq(agents.id, agent.id));
        return { result: { vaultId: agent.paymentVaultId } };
      });
    },

    /**
     * The owner's agents with what each may spend and has spent: live money funded into escrow
     * in the last day, the last week and in all, and what is still only held.
     */
    async ownerAgentsOverview(workerId: string) {
      const owner = await ownerOf(workerId).catch(() => null);
      if (!owner) return [];
      const mine = await db
        .select()
        .from(agents)
        .where(and(eq(agents.ownerId, owner.id), ne(agents.kind, "personal")))
        .orderBy(agents.createdAt);
      if (mine.length === 0) return [];
      const at = now();
      const money = await db
        .select({
          agentId: tasks.agentId,
          day: spentSince(new Date(at.getTime() - DAY)),
          week: spentSince(new Date(at.getTime() - 7 * DAY)),
          total: spentSince(null),
          held: sql<number>`coalesce(sum(case when ${ledgerEntries.status} = 'pending' then ${ledgerEntries.amount} else 0 end), 0)::int`,
        })
        .from(ledgerEntries)
        .innerJoin(tasks, eq(tasks.id, ledgerEntries.taskId))
        .where(and(inArray(tasks.agentId, mine.map((a) => a.id)), eq(ledgerEntries.fromAccount, "requester"), eq(tasks.test, false)))
        .groupBy(tasks.agentId);
      const waiting = await db
        .select({ id: fundingApprovals.id, agentId: fundingApprovals.agentId, total: fundingApprovals.total, expiresAt: fundingApprovals.expiresAt })
        .from(fundingApprovals)
        .where(and(inArray(fundingApprovals.agentId, mine.map((a) => a.id)), eq(fundingApprovals.status, "pending"), gte(fundingApprovals.expiresAt, at)));
      return mine.map((a) => {
        const m = money.find((row) => row.agentId === a.id);
        return {
          id: a.id,
          name: a.name,
          status: a.status,
          paused: a.pausedAt !== null,
          hasKey: a.apiKeyHash !== null,
          spendingMode: a.spendingMode,
          maxTaskBudget: a.maxTaskBudget,
          maxDailySpend: a.maxDailySpend,
          paymentSaved: a.paymentVaultId !== null,
          spent: { last24h: m?.day ?? 0, last7d: m?.week ?? 0, total: m?.total ?? 0 },
          /** Funded and still only held: not yet captured, released or refunded. */
          held: m?.held ?? 0,
          approvalsWaiting: waiting.filter((w) => w.agentId === a.id),
        };
      });
    },

    /** One agent's latest payments into escrow and the owner's own changes to it, newest first. */
    async ownerAgentActivity(workerId: string, agentId: string, limit = 20) {
      const owner = await ownerOf(workerId);
      const agent = await ownedAgent(db, owner.id, agentId);
      const payments = await db
        .select({ taskId: ledgerEntries.taskId, amount: ledgerEntries.amount, status: ledgerEntries.status, at: ledgerEntries.createdAt, taskStatus: tasks.status, test: tasks.test })
        .from(ledgerEntries)
        .innerJoin(tasks, eq(tasks.id, ledgerEntries.taskId))
        .where(and(eq(tasks.agentId, agent.id), eq(ledgerEntries.fromAccount, "requester")))
        .orderBy(desc(ledgerEntries.id))
        .limit(limit);
      const changes = await db
        .select({ action: ownerActions.action, detail: ownerActions.detail, at: ownerActions.createdAt })
        .from(ownerActions)
        .where(eq(ownerActions.agentId, agent.id))
        .orderBy(desc(ownerActions.id))
        .limit(limit);
      return { payments, changes };
    },

    /**
     * An agent in `ask` mode asks its owner to pay for 1 to 10 of its tasks from the saved
     * payment method. Nothing is held. Asking again for the same tasks returns the same request
     * while it waits; tasks the owner declined can't be asked for again.
     */
    async requestFundingApproval(caller: Requester, taskIds: string[]) {
      const ids = [...new Set(taskIds)];
      if (ids.length !== taskIds.length || ids.length < 1 || ids.length > 10) throw new DeskError("invalid", "ask for 1 to 10 different tasks at once");
      const [agent] = await db.select().from(agents).where(eq(agents.id, caller.agentId));
      if (!agent) throw new DeskError("not_found", "agent not found");
      if (agent.pausedAt) throw new DeskError("forbidden", "your owner has paused you");
      if (!agent.paymentVaultId) throw new DeskError("conflict", "your owner hasn't saved a payment method for you yet");
      const list = await db.select().from(tasks).where(inArray(tasks.id, ids));
      for (const id of ids) {
        const task = list.find((t) => t.id === id);
        if (!task || task.agentId !== agent.id) throw new DeskError("not_found", `task ${id} not found`);
        if (task.status !== "awaiting_funding") throw new DeskError("conflict", `task ${id} is ${task.status}, not awaiting funding`);
        if (task.test) throw new DeskError("invalid", `task ${id} uses test money; fund it on its own`);
      }
      const at = now();
      const earlier = await db
        .select()
        .from(fundingApprovals)
        .where(and(eq(fundingApprovals.agentId, agent.id), inArray(fundingApprovals.status, ["pending", "declined"])))
        .orderBy(desc(fundingApprovals.createdAt));
      const declined = earlier.find((a) => a.status === "declined" && a.taskIds.some((id) => ids.includes(id)));
      if (declined) throw new DeskError("forbidden", "your owner declined paying for this; cancel the task rather than asking again");
      const same = earlier.find((a) => a.status === "pending" && a.expiresAt > at && a.taskIds.length === ids.length && ids.every((id) => a.taskIds.includes(id)));
      if (same) return same;
      const [created] = await db
        .insert(fundingApprovals)
        .values({
          agentId: agent.id,
          taskIds: ids,
          total: list.reduce((sum, t) => sum + taskTotal(t), 0),
          expiresAt: new Date(at.getTime() + POLICY.fundingApprovalMs),
          createdAt: at,
          updatedAt: at,
        })
        .returning();
      return created!;
    },

    /** The agent's own view of a request it made: waiting, approved (with what was funded), declined or expired. */
    async getFundingApproval(caller: Requester, approvalId: string) {
      const [approval] = /^[0-9a-f-]{36}$/i.test(approvalId) ? await db.select().from(fundingApprovals).where(eq(fundingApprovals.id, approvalId)) : [];
      if (!approval || approval.agentId !== caller.agentId) throw new DeskError("not_found", "approval not found");
      const expired = approval.status === "pending" && approval.expiresAt <= now();
      return { id: approval.id, status: expired ? ("expired" as const) : approval.status, taskIds: approval.taskIds, total: approval.total, expiresAt: approval.expiresAt, result: approval.result };
    },

    /** What the owner is asked to approve: which agent, which tasks, how much. */
    async ownerFundingApproval(workerId: string, approvalId: string) {
      const owner = await ownerOf(workerId).catch(() => null);
      const [approval] = owner && /^[0-9a-f-]{36}$/i.test(approvalId) ? await db.select().from(fundingApprovals).where(eq(fundingApprovals.id, approvalId)) : [];
      if (!owner || !approval) throw new DeskError("not_found", "no payment request with that link");
      const agent = await ownedAgent(db, owner.id, approval.agentId).catch(() => null);
      if (!agent) throw new DeskError("not_found", "no payment request with that link");
      const list = await db.select().from(tasks).where(inArray(tasks.id, approval.taskIds));
      const expired = approval.status === "pending" && approval.expiresAt <= now();
      return {
        id: approval.id,
        status: expired ? ("expired" as const) : approval.status,
        total: approval.total,
        expiresAt: approval.expiresAt,
        result: approval.result,
        agent: { id: agent.id, name: agent.name },
        tasks: approval.taskIds.map((id) => list.find((t) => t.id === id)!).map((t) => ({ id: t.id, description: t.description, budget: t.budget, total: taskTotal(t), status: t.status, deadline: t.deadline })),
      };
    },

    /**
     * The owner approves or declines. Approving funds each task at once from the saved payment
     * method, through the desk's own funding checks: one a check refuses is listed in `failed`
     * and holds nothing. An approval is used once and covers only the tasks it showed.
     */
    async decideFundingApproval(workerId: string, approvalId: string, decision: "approve" | "decline") {
      const owner = await ownerOf(workerId);
      const at = now();
      const approval = await db.transaction(async (tx) => {
        const [found] = /^[0-9a-f-]{36}$/i.test(approvalId) ? await tx.select().from(fundingApprovals).where(eq(fundingApprovals.id, approvalId)).for("update") : [];
        if (!found) throw new DeskError("not_found", "no payment request with that link");
        await ownedAgent(tx, owner.id, found.agentId);
        if (found.status !== "pending") throw new DeskError("conflict", "this payment request was already decided");
        if (found.expiresAt <= at) throw new DeskError("conflict", "this payment request has expired; your agent can ask again");
        const status = decision === "approve" ? ("approved" as const) : ("declined" as const);
        await tx.update(fundingApprovals).set({ status, decidedAt: at, updatedAt: at }).where(eq(fundingApprovals.id, found.id));
        await record(tx, owner.id, found.agentId, decision === "approve" ? "approve_payment" : "decline_payment", { approvalId: found.id, taskIds: found.taskIds, total: found.total }, at);
        return { ...found, status };
      });
      if (approval.status === "declined") return { status: "declined" as const, funded: [] as string[], failed: [] as { taskId: string; error: string }[] };

      const result = { funded: [] as string[], failed: [] as { taskId: string; error: string }[] };
      for (const taskId of approval.taskIds) {
        try {
          await fundApproved({ role: "requester", agentId: approval.agentId }, taskId, approval.id);
          result.funded.push(taskId);
        } catch (error) {
          if (!(error instanceof DeskError)) console.error(`[desk] approved funding of ${taskId} failed`, error);
          result.failed.push({ taskId, error: error instanceof DeskError ? error.message : "couldn't be funded; try again" });
        }
      }
      await db.update(fundingApprovals).set({ status: "used", result, updatedAt: now() }).where(eq(fundingApprovals.id, approval.id));
      return { status: "used" as const, ...result };
    },
  };
}
