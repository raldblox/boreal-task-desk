import { asRequester, getDesk, readJson } from "@/server/desk";

// dispute_verdict: once per task, inside the 48-hour objection window.
export async function POST(request: Request, ctx: RouteContext<"/api/v1/tasks/[id]/dispute">) {
  const { id } = await ctx.params;
  return asRequester(request, async (caller) => {
    const body = (await readJson(request)) as { reason?: unknown };
    const reason = typeof body?.reason === "string" ? body.reason : "";
    return Response.json(await getDesk().disputeVerdict(caller, id, reason));
  });
}
