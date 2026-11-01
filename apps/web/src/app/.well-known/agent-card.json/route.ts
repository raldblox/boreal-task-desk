import { connection } from "next/server";

import { servedCard } from "@/server/registry";

// boreal.work's Agent Card for Concordium's Agent Registry. The registry pins these exact bytes'
// SHA-256 on-chain, so they're built once per process and served as is (src/content/agent-card.ts).
// Built at request time: x402Support follows the payment rails, which load with the database.
export async function GET() {
  await connection();
  const { body, sha256 } = servedCard();
  return new Response(body, {
    headers: { "content-type": "application/json", "x-card-sha256": sha256, "access-control-allow-origin": "*" },
  });
}
