import { asAgentWorker, getDesk } from "@/server/desk";
import { workView } from "@/server/work";

export async function POST(request: Request, ctx: RouteContext<"/api/v1/work/tasks/[id]/claim">) {
  const { id } = await ctx.params;
  return asAgentWorker(request, async (caller) => Response.json(workView(await getDesk().claimTask(caller, id))));
}
