import { asRequester, getDesk } from "@/server/desk";

export async function GET(request: Request, ctx: RouteContext<"/api/v1/tasks/[id]">) {
  const { id } = await ctx.params;
  return asRequester(request, async (caller) => {
    const desk = getDesk();
    const task = await desk.getTask(caller, id);
    return Response.json({ ...task, escrow: await desk.taskMoneyFor(task) });
  });
}
