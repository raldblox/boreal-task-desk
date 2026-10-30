// Creates a requester agent with its owner and prints a one-time API key.
// Usage: pnpm --filter @boreal/desk create-agent <name> <owner-verified-ref>
// The owner ref is a Concordium ID pseudonym or LEI; real checks arrive with the registry adapter.

import { existsSync } from "node:fs";

import { POLICY } from "@boreal/core";
import { agents, createDb, owners } from "@boreal/db";

import { issueAgentKey } from "../src/keys";

const envFile = "../../.env.local";
if (existsSync(envFile)) process.loadEnvFile(envFile);

const [name, ownerRef] = process.argv.slice(2);
if (!name || !ownerRef) {
  console.error("usage: create-agent <name> <owner-verified-ref>");
  process.exit(1);
}

const db = createDb();
const [owner] = await db
  .insert(owners)
  .values({ kind: "individual", verifiedRef: ownerRef })
  .onConflictDoUpdate({ target: owners.verifiedRef, set: { updatedAt: new Date() } })
  .returning();
const [agent] = await db
  .insert(agents)
  .values({
    ownerId: owner!.id,
    registryId: `pending-${name}`,
    name,
    maxTaskBudget: POLICY.maxTaskBudget,
    maxDailySpend: POLICY.maxAgentDailySpend,
  })
  .returning();

console.error(`agent ${agent!.id} created; the key below is shown once`);
console.log(await issueAgentKey(db, agent!.id));
process.exit(0);
