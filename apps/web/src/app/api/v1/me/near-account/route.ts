import { DeskError } from "@boreal/desk";

import { asRequester, getDesk, paymentRails, readJson } from "@/server/desk";

// set_near_account: the agent names the NEAR account it pays from, for its owner to fund.
export async function POST(request: Request) {
  return asRequester(request, async (caller) => {
    if (!paymentRails().includes("near")) throw new DeskError("unavailable", "the NEAR rail isn't on here");
    if (caller.role !== "requester") throw new DeskError("forbidden", "only an agent sets its NEAR account");
    const body = (await readJson(request)) as { nearAccount?: unknown } | null;
    const nearAccount = typeof body?.nearAccount === "string" ? body.nearAccount : null;
    return Response.json(await getDesk().setAgentNearAccount(caller.agentId, nearAccount));
  });
}
