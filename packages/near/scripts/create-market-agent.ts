// Creates boreal's own requester agent for NEAR Agent Market jobs and prints its id for
// NEAR_MARKET_AGENT_ID. Refunds of market tasks go back to the treasury that funded them.
// Usage: pnpm --filter @boreal/near create-market-agent <treasury.near>

import { existsSync } from "node:fs";

import { POLICY } from "@boreal/core";
import { agents, createDb, owners } from "@boreal/db";

import { isNearAccountId } from "../src/payments";

const envFile = "../../.env.local";
if (existsSync(envFile)) process.loadEnvFile(envFile);

const [treasury] = process.argv.slice(2);
if (!treasury || !isNearAccountId(treasury)) {
  console.error("usage: create-market-agent <treasury NEAR account>");
  process.exit(1);
}

const db = createDb();
const [owner] = await db
  .insert(owners)
  .values({ kind: "business", verifiedRef: "boreal" })
  .onConflictDoUpdate({ target: owners.verifiedRef, set: { updatedAt: new Date() } })
  .returning();
const [agent] = await db
  .insert(agents)
  .values({
    ownerId: owner!.id,
    registryId: "boreal-near-agent-market",
    name: "boreal on NEAR Agent Market",
    maxTaskBudget: POLICY.maxTaskBudget,
    maxDailySpend: POLICY.maxAgentDailySpend,
    refundAddress: treasury,
  })
  .returning();

console.log(agent!.id);
process.exit(0);
