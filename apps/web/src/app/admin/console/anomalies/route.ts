import { currentAdmin } from "@/server/admin";
import { anomalyReport } from "@/server/console";

// The anomaly agent's checks, run fresh: failed and stuck payouts, refund spikes, escrow against
// each rail. Read-only; admins only (the proxy gates /admin, and this checks again).
export async function GET() {
  if (!(await currentAdmin())) return new Response("Not found", { status: 404 });
  return Response.json(await anomalyReport(), { headers: { "Cache-Control": "no-store" } });
}
