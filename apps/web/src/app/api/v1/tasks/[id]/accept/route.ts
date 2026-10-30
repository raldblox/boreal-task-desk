import { asRequester, getDesk } from "@/server/desk";

// accept_result: accepts a pass before the objection window ends, so the worker is paid sooner.
export async function POST(request: Request, ctx: RouteContext<"/api/v1/tasks/[id]/accept">) {
  const { id } = await ctx.params;
  return asRequester(request, async (caller) => Response.json(await getDesk().acceptEarly(caller, id)));
}
