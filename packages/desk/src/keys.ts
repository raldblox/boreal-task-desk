import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { agents, and, type Database, eq, ne } from "@boreal/db";

// Agent API keys look like `bk_<agent id>.<secret>`. Only a hash of the secret is stored.

const PREFIX = "bk_";

function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

/**
 * Issues a new key for an agent, replacing any old one. Show the result once; it can't be
 * recovered. A person's own requester never gets one: their web session acts as it.
 */
export async function issueAgentKey(db: Database, agentId: string): Promise<string> {
  const secret = randomBytes(32).toString("base64url");
  const [agent] = await db
    .update(agents)
    .set({ apiKeyHash: hashSecret(secret), updatedAt: new Date() })
    .where(and(eq(agents.id, agentId), ne(agents.kind, "personal")))
    .returning({ id: agents.id });
  if (!agent) throw new Error(`agent ${agentId} not found, or it's a person's own requester`);
  return `${PREFIX}${agent.id}.${secret}`;
}

/** Returns the agent id for a valid, active key, or null. */
export async function verifyAgentKey(db: Database, key: string): Promise<string | null> {
  if (!key.startsWith(PREFIX)) return null;
  const [agentId, secret] = key.slice(PREFIX.length).split(".", 2);
  if (!agentId || !secret || !/^[0-9a-f-]{36}$/.test(agentId)) return null;

  const [agent] = await db
    .select({ id: agents.id, apiKeyHash: agents.apiKeyHash, status: agents.status })
    .from(agents)
    .where(eq(agents.id, agentId));
  if (!agent?.apiKeyHash || agent.status !== "active") return null;

  const expected = Buffer.from(agent.apiKeyHash, "hex");
  const actual = Buffer.from(hashSecret(secret), "hex");
  return timingSafeEqual(expected, actual) ? agent.id : null;
}
