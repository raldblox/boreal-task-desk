import { asRequester, getDesk } from "@/server/desk";

export async function GET(request: Request, ctx: RouteContext<"/api/v1/tasks/[id]">) {
  const { id } = await ctx.params;
  return asRequester(request, async (caller) => Response.json(await getDesk().getTask(caller, id)));
}
