import { TASK_STATUSES, type TaskStatus } from "@boreal/core";
import { DeskError } from "@boreal/desk";

import { asRequester, getDesk, readJson } from "@/server/desk";

// list_tasks: the agent's own tasks, newest first, optionally by status.
export async function GET(request: Request) {
  return asRequester(request, async (caller) => {
    const params = new URL(request.url).searchParams;
    const status = params.get("status");
    if (status && !(TASK_STATUSES as readonly string[]).includes(status)) {
      throw new DeskError("invalid", `status must be one of: ${TASK_STATUSES.join(", ")}`);
    }
    const limit = params.get("limit") ? Number(params.get("limit")) : undefined;
    return Response.json(await getDesk().listTasks(caller, { status: (status as TaskStatus) ?? undefined, limit }));
  });
}


// post_task. Funding opens once x402 is wired; until then a task waits in awaiting_funding.
export async function POST(request: Request) {
  return asRequester(request, async (caller) => {
    const result = await getDesk().postTask(caller, await readJson(request));
    return Response.json(result, { status: 201 });
  });
}
