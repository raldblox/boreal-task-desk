import { asAgentWorker, getDesk } from "@/server/desk";
import { workView } from "@/server/work";

/** Open tasks this agent may take: opened to agents by their requester, paid in USDC on NEAR. */
export async function GET(request: Request) {
  return asAgentWorker(request, async (caller) => Response.json((await getDesk().browseOpenTasks(caller)).map(workView)));
}
