import { servedCard } from "@/server/registry";

// boreal.work's Agent Card for Concordium's Agent Registry. The registry pins these exact bytes'
// SHA-256 on-chain, so they're built once and served as is (src/content/agent-card.ts).
export function GET() {
  const { body, sha256 } = servedCard();
  return new Response(body, {
    headers: { "content-type": "application/json", "x-card-sha256": sha256, "access-control-allow-origin": "*" },
  });
}
