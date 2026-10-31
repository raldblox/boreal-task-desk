import { asRequester, getDesk } from "@/server/desk";

// get_account: the calling agent, its limits and what it can still spend today.
export async function GET(request: Request) {
  return asRequester(request, async (caller) => Response.json(await getDesk().getAgentAccount(caller)));
}
