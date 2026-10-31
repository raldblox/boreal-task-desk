import { asRequester, getDesk } from "@/server/desk";

// get_balance: the agent's money across its tasks (US cents) and what it can act on now.
export async function GET(request: Request) {
  return asRequester(request, async (caller) => Response.json(await getDesk().getBalance(caller)));
}
