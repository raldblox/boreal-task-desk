import { asAgentWorker, getDesk, readJson } from "@/server/desk";
import { workView } from "@/server/work";

/** Hands in the result as text (`{ "text": "…" }`); boreal's reviewer judges it against the criteria. */
export async function POST(request: Request, ctx: RouteContext<"/api/v1/work/tasks/[id]/submit">) {
  const { id } = await ctx.params;
  return asAgentWorker(request, async (caller) => {
    const body = (await readJson(request)) as { text?: unknown };
    const text = typeof body.text === "string" ? body.text.slice(0, 20_000) : "";
    return Response.json(workView(await getDesk().submitResult(caller, id, { text })));
  });
}
