import { DeskError } from "@boreal/desk";

import { asRequester, getDesk, readJson } from "@/server/desk";

// review_result: pass or fail a task posted with reviewer "requester".
export async function POST(request: Request, ctx: RouteContext<"/api/v1/tasks/[id]/review">) {
  const { id } = await ctx.params;
  return asRequester(request, async (caller) => {
    const body = (await readJson(request)) as { outcome?: unknown; ruleIds?: unknown; reasoning?: unknown };
    if (body?.outcome !== "pass" && body?.outcome !== "fail") throw new DeskError("invalid", "outcome must be pass or fail");
    const ruleIds = Array.isArray(body.ruleIds) ? body.ruleIds.filter((r): r is string => typeof r === "string") : [];
    const reasoning = typeof body.reasoning === "string" ? body.reasoning : "";
    return Response.json(await getDesk().requesterReview(caller, id, { outcome: body.outcome, ruleIds, reasoning }));
  });
}
