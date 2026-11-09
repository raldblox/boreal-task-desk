import { asRequester } from "@/server/desk";
import { reviewProofFor } from "@/server/mcp";

// get_review_proof: the standing verdict's private-review proof and its checks, or null.
export async function GET(request: Request, ctx: RouteContext<"/api/v1/tasks/[id]/proof">) {
  const { id } = await ctx.params;
  return asRequester(request, async (caller) => Response.json(await reviewProofFor(caller, id)));
}
