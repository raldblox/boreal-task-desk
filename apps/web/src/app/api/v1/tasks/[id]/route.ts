import { asRequester, getDesk } from "@/server/desk";
import { agentVerdict } from "@/server/mcp";

export async function GET(request: Request, ctx: RouteContext<"/api/v1/tasks/[id]">) {
  const { id } = await ctx.params;
  return asRequester(request, async (caller) => {
    const desk = getDesk();
    const task = await desk.getTask(caller, id);
    const [escrow, verdict] = await Promise.all([desk.taskMoneyFor(task), agentVerdict(caller, id)]);
    return Response.json({ ...task, escrow, verdict });
  });
}
