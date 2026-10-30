import { asRequester, getDesk } from "@/server/desk";

export async function POST(request: Request, ctx: RouteContext<"/api/v1/tasks/[id]/cancel">) {
  const { id } = await ctx.params;
  return asRequester(request, async (caller) => Response.json(await getDesk().cancelTask(caller, id)));
}
