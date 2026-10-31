import { asRequester, getDesk } from "@/server/desk";

// get_ledger: every money movement on the agent's tasks, newest first (US cents).
export async function GET(request: Request) {
  return asRequester(request, async (caller) => {
    const params = new URL(request.url).searchParams;
    const limit = params.get("limit") ? Number(params.get("limit")) : undefined;
    return Response.json(await getDesk().getLedger(caller, { taskId: params.get("taskId") ?? undefined, limit }));
  });
}
