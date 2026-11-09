import { createHash, randomBytes, randomInt } from "node:crypto";

import { POLICY } from "@boreal/core";
import { agentLinks, agents, and, type Database, eq, gt, ne, owners, sql, workers } from "@boreal/db";

import { DeskError } from "./errors";
import { issueAgentKey } from "./keys";

// Agent linking: an agent gets its own key, and its owner only approves. The agent asks for
// a link and receives a short code plus a secret poll token; the owner signs in on
// boreal.work, opens the code and approves; the agent's next poll collects its key, once.

const LINK_TTL_MS = 15 * 60 * 1000;

// NEAR account ids: named (alice.near, hermes.testnet) or implicit (64 hex). Same rule as @boreal/near,
// which the desk can't import.
const NEAR_ACCOUNT_ID = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;

/** A NEAR account id the agent says it pays from, checked; null when none was given. */
export function agentNearAccount(value: string | null | undefined): string | null {
  const account = value?.trim().toLowerCase();
  if (!account) return null;
  if (account.length < 2 || account.length > 64 || !NEAR_ACCOUNT_ID.test(account)) {
    throw new DeskError("invalid", "nearAccount must be a NEAR account id, like hermes.testnet or a 64-character implicit account");
  }
  return account;
}
// No 0/O, 1/I/L, so a code read aloud or retyped survives.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

function newCode(): string {
  const pick = () => Array.from({ length: 4 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
  return `${pick()}-${pick()}`;
}

/** Normalises what an owner typed: case, spaces and a missing dash. */
export function normaliseLinkCode(input: string): string {
  const raw = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return raw.length === 8 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw;
}

/** A registry badge the web layer has already checked against the Agent Registry and the owner's signature. */
export interface VerifiedBadge {
  registryId: string;
  network: "testnet" | "mainnet";
  ownerAccount: string;
}

export interface ApproveLinkInput {
  name: string;
  maxTaskBudget: number;
  maxDailySpend: number;
  /** Give a new key to one of this owner's agents instead of creating one. */
  replaceAgentId?: string;
  badge?: VerifiedBadge;
}

export function linkCommands(db: Database, now: () => Date) {
  /** The signed-in person approving: any real worker (PayPal or Concordium ID), never a tester. */
  async function ownerFor(workerId: string) {
    const [worker] = await db.select().from(workers).where(eq(workers.id, workerId));
    if (!worker) throw new DeskError("not_found", "sign in again");
    if (worker.testMode) throw new DeskError("forbidden", "sign in with PayPal or Concordium ID to own an agent; tester accounts can't");
    const at = now();
    const [owner] = await db
      .insert(owners)
      .values({ kind: "individual", verifiedRef: worker.pseudonym, createdAt: at, updatedAt: at })
      .onConflictDoUpdate({ target: owners.verifiedRef, set: { updatedAt: at } })
      .returning();
    return owner!;
  }

  async function pendingLink(code: string) {
    const [link] = await db.select().from(agentLinks).where(eq(agentLinks.code, normaliseLinkCode(code)));
    if (!link) throw new DeskError("not_found", "no link request with that code");
    if (link.status !== "pending") throw new DeskError("conflict", "this link request was already decided");
    if (link.expiresAt <= now()) throw new DeskError("conflict", "this link request has expired; ask your agent for a new one");
    return link;
  }

  return {
    /** An agent asks to be linked. Returns the code to show its owner and the token to poll with. */
    async requestAgentLink(input: { agentName: string; agentDescription?: string; nearAccount?: string }, clientHash: string) {
      const agentName = input.agentName?.trim();
      if (!agentName || agentName.length > 80) throw new DeskError("invalid", "agentName must be 1 to 80 characters");
      const agentDescription = input.agentDescription?.trim().slice(0, 500) || null;
      const nearAccount = agentNearAccount(input.nearAccount);
      const at = now();
      const [recent] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(agentLinks)
        .where(and(eq(agentLinks.clientHash, clientHash), gt(agentLinks.createdAt, new Date(at.getTime() - 10 * 60_000))));
      if ((recent?.n ?? 0) >= 5) throw new DeskError("limit", "too many link requests; try again in a few minutes");

      const pollToken = `bl_${randomBytes(32).toString("base64url")}`;
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = newCode();
        const [row] = await db
          .insert(agentLinks)
          .values({
            code,
            pollTokenHash: sha256(pollToken),
            agentName,
            agentDescription,
            nearAccount,
            clientHash,
            expiresAt: new Date(at.getTime() + LINK_TTL_MS),
            createdAt: at,
            updatedAt: at,
          })
          .onConflictDoNothing({ target: agentLinks.code })
          .returning();
        if (row) return { code: row.code, pollToken, expiresAt: row.expiresAt };
      }
      throw new DeskError("unavailable", "couldn't create a link code; try again");
    },

    /** The agent polls with its token. An approved link hands over the key exactly once. */
    async pollAgentLink(pollToken: string) {
      const [link] = await db.select().from(agentLinks).where(eq(agentLinks.pollTokenHash, sha256(pollToken ?? "")));
      if (!link) throw new DeskError("not_found", "unknown poll token");
      if (link.status === "pending") {
        return link.expiresAt <= now() ? { status: "expired" as const } : { status: "pending" as const, expiresAt: link.expiresAt };
      }
      if (link.status === "denied") return { status: "denied" as const };
      if (link.status === "collected") return { status: "collected" as const };

      // Only one poll wins the key, even if two arrive together.
      const [won] = await db
        .update(agentLinks)
        .set({ status: "collected", updatedAt: now() })
        .where(and(eq(agentLinks.id, link.id), eq(agentLinks.status, "approved")))
        .returning();
      if (!won) return { status: "collected" as const };
      const key = await issueAgentKey(db, link.agentId!);
      const [agent] = await db.select().from(agents).where(eq(agents.id, link.agentId!));
      return {
        status: "approved" as const,
        key,
        agent: { id: agent!.id, name: agent!.name, testMode: agent!.testMode, badgeVerified: agent!.badgeVerifiedAt !== null },
      };
    },

    /** What the owner sees before deciding. */
    async getAgentLink(code: string) {
      const link = await pendingLink(code);
      return { code: link.code, agentName: link.agentName, agentDescription: link.agentDescription, nearAccount: link.nearAccount, expiresAt: link.expiresAt };
    },

    /**
     * The signed-in person's own requester, made on their first post: an agent owned by them,
     * marked personal, named after their pseudonym. It never gets a key; their web session
     * acts as it. Its limits are boreal's ceilings, capped like any requester's until the
     * person adds Concordium ID.
     */
    async personalRequester(workerId: string) {
      const owner = await ownerFor(workerId);
      const at = now();
      // One per owner: the registry id comes from the owner, so a second insert does nothing.
      await db
        .insert(agents)
        .values({
          ownerId: owner.id,
          registryId: `personal-${owner.id}`,
          name: owner.verifiedRef.slice(0, 80),
          maxTaskBudget: POLICY.maxTaskBudget,
          maxDailySpend: POLICY.maxAgentDailySpend,
          testMode: false,
          kind: "personal",
          createdAt: at,
          updatedAt: at,
        })
        .onConflictDoNothing({ target: agents.registryId });
      const [agent] = await db.select().from(agents).where(eq(agents.registryId, `personal-${owner.id}`));
      return agent!;
    },

    /** The person's own requester if they have posted before, else null. Never makes one. */
    async findPersonalRequester(workerId: string) {
      const [found] = await db
        .select({ agent: agents })
        .from(agents)
        .innerJoin(owners, eq(owners.id, agents.ownerId))
        .innerJoin(workers, eq(workers.pseudonym, owners.verifiedRef))
        .where(and(eq(workers.id, workerId), eq(agents.kind, "personal")));
      return found?.agent ?? null;
    },

    /** The owner's agents, to replace a lost key instead of creating a duplicate. Their own requester isn't one. */
    async listOwnerAgents(workerId: string) {
      const owner = await ownerFor(workerId);
      return db
        .select({
          id: agents.id,
          name: agents.name,
          testMode: agents.testMode,
          badgeVerifiedAt: agents.badgeVerifiedAt,
          paypalConnected: sql<boolean>`${agents.paymentVaultId} is not null`,
          nearAccount: agents.nearAccount,
        })
        .from(agents)
        .where(and(eq(agents.ownerId, owner.id), ne(agents.kind, "personal")));
    },

    /** One of the owner's agents, or a refusal: for pages that act on an agent. */
    async ownerAgent(workerId: string, agentId: string) {
      const owner = await ownerFor(workerId);
      const [agent] = await db
        .select({ id: agents.id, name: agents.name })
        .from(agents)
        .where(and(eq(agents.id, agentId), eq(agents.ownerId, owner.id), ne(agents.kind, "personal")));
      if (!agent) throw new DeskError("forbidden", "that agent isn't yours");
      return agent;
    },

    /** The owner saved a PayPal account for the agent: its tasks fund from it with no approval page. */
    async savePaymentMethod(workerId: string, agentId: string, vaultId: string) {
      const owner = await ownerFor(workerId);
      const [agent] = await db
        .select({ id: agents.id, name: agents.name })
        .from(agents)
        .where(and(eq(agents.id, agentId), eq(agents.ownerId, owner.id), ne(agents.kind, "personal")));
      if (!agent) throw new DeskError("forbidden", "that agent isn't yours");
      if (!vaultId) throw new DeskError("invalid", "PayPal returned no saved account");
      await db.update(agents).set({ paymentVaultId: vaultId, updatedAt: now() }).where(eq(agents.id, agent.id));
      return agent;
    },

    /** The owner approves: creates the agent (or picks one of theirs), and marks the link ready to collect. */
    async approveAgentLink(workerId: string, code: string, input: ApproveLinkInput) {
      const owner = await ownerFor(workerId);
      const link = await pendingLink(code);
      const name = input.name.trim();
      if (!name || name.length > 80) throw new DeskError("invalid", "the agent's name must be 1 to 80 characters");
      const { maxTaskBudget, maxDailySpend } = input;
      if (!Number.isSafeInteger(maxTaskBudget) || maxTaskBudget < 1 || maxTaskBudget > POLICY.maxTaskBudget) {
        throw new DeskError("invalid", `the per-task limit must be between 1 and ${POLICY.maxTaskBudget} cents`);
      }
      if (!Number.isSafeInteger(maxDailySpend) || maxDailySpend < maxTaskBudget || maxDailySpend > POLICY.maxAgentDailySpend) {
        throw new DeskError("invalid", `the daily limit must be at least the per-task limit and at most ${POLICY.maxAgentDailySpend} cents`);
      }
      const at = now();
      const badge = input.badge
        ? { registryId: input.badge.registryId, badgeNetwork: input.badge.network, ownerAccount: input.badge.ownerAccount, badgeVerifiedAt: at }
        : {};

      return db.transaction(async (tx) => {
        let agentId: string;
        if (input.replaceAgentId) {
          const [mine] = await tx
            .select({ id: agents.id })
            .from(agents)
            // A person's own requester never gets a key.
            .where(and(eq(agents.id, input.replaceAgentId), eq(agents.ownerId, owner.id), ne(agents.kind, "personal")));
          if (!mine) throw new DeskError("forbidden", "that agent isn't yours");
          // A fresh approval by its verified owner makes the agent live, like a new one.
          await tx
            .update(agents)
            .set({ name, maxTaskBudget, maxDailySpend, testMode: false, ...badge, ...(link.nearAccount ? { nearAccount: link.nearAccount } : {}), updatedAt: at })
            .where(eq(agents.id, mine.id));
          agentId = mine.id;
        } else {
          if (input.badge) {
            const [taken] = await tx.select({ id: agents.id }).from(agents).where(eq(agents.registryId, input.badge.registryId));
            if (taken) throw new DeskError("conflict", "that badge already belongs to an agent here; replace its key instead");
          }
          const [created] = await tx
            .insert(agents)
            .values({
              ownerId: owner.id,
              registryId: `unbadged-${crypto.randomUUID()}`,
              name,
              maxTaskBudget,
              maxDailySpend,
              // Approved by a verified owner, with limits: ready for real tasks at once.
              testMode: false,
              ...badge,
              nearAccount: link.nearAccount,
              createdAt: at,
              updatedAt: at,
            })
            .returning({ id: agents.id });
          agentId = created!.id;
        }
        const [decided] = await tx
          .update(agentLinks)
          .set({ status: "approved", ownerId: owner.id, agentId, decidedAt: at, updatedAt: at })
          .where(and(eq(agentLinks.id, link.id), eq(agentLinks.status, "pending")))
          .returning();
        if (!decided) throw new DeskError("conflict", "this link request was already decided");
        return { agentId, agentName: name, nearAccount: link.nearAccount };
      });
    },

    /** The agent names (or changes, or clears) the NEAR account it pays from, for its owner to fund. */
    async setAgentNearAccount(agentId: string, nearAccount: string | null) {
      const account = agentNearAccount(nearAccount);
      await db.update(agents).set({ nearAccount: account, updatedAt: now() }).where(eq(agents.id, agentId));
      return { nearAccount: account };
    },

    /** One of the owner's agents with its NEAR account, for the page where they fund it. */
    async ownerAgentWallet(workerId: string, agentId: string) {
      const owner = await ownerFor(workerId);
      const [agent] = await db
        .select({ id: agents.id, name: agents.name, nearAccount: agents.nearAccount })
        .from(agents)
        .where(and(eq(agents.id, agentId), eq(agents.ownerId, owner.id), ne(agents.kind, "personal")));
      if (!agent) throw new DeskError("forbidden", "that agent isn't yours");
      return agent;
    },

    async denyAgentLink(workerId: string, code: string) {
      const owner = await ownerFor(workerId);
      const link = await pendingLink(code);
      await db
        .update(agentLinks)
        .set({ status: "denied", ownerId: owner.id, decidedAt: now(), updatedAt: now() })
        .where(and(eq(agentLinks.id, link.id), eq(agentLinks.status, "pending")));
    },
  };
}
