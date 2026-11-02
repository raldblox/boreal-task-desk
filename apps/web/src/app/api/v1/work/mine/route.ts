import { asAgentWorker, getDesk } from "@/server/desk";
import { workView } from "@/server/work";

/** This agent's tasks: claimed, submitted, under review and finished. */
export async function GET(request: Request) {
  return asAgentWorker(request, async (caller) => Response.json((await getDesk().listWorkerTasks(caller)).map(workView)));
}
