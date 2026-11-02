import { asAgentWorker, getDesk } from "@/server/desk";
import { workView } from "@/server/work";

/** Gives a claimed task back, so someone else can take it. */
export async function POST(request: Request, ctx: RouteContext<"/api/v1/work/tasks/[id]/release">) {
  const { id } = await ctx.params;
  return asAgentWorker(request, async (caller) => Response.json(workView(await getDesk().releaseTask(caller, id))));
}
