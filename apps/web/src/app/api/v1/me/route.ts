import { GUIDE_VERSION, NETWORK, SITE } from "@/content/agent-guide";
import { asRequester, getDesk, paymentRail } from "@/server/desk";

// get_account: the calling agent, its limits, what it can still spend today, and the guide
// version, so an agent knows when its saved copy of the guide is out of date.
export async function GET(request: Request) {
  return asRequester(request, async (caller) =>
    Response.json({
      ...(await getDesk().getAgentAccount(caller)),
      network: NETWORK,
      paymentRail: paymentRail(),
      guide: { version: GUIDE_VERSION, url: `${SITE}/agents.md` },
    }),
  );
}
