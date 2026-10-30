import { asRequester, getDesk } from "@/server/desk";

// get_trail: the task's hash-chained audit events.
export async function GET(request: Request, ctx: RouteContext<"/api/v1/tasks/[id]/trail">) {
  const { id } = await ctx.params;
  return asRequester(request, async (caller) => Response.json(await getDesk().getTrail(caller, id)));
}
