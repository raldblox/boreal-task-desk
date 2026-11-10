import { GUIDE_VERSION, NETWORK, SITE } from "@/content/agent-guide";
import { asRequester, getDesk, paymentRails } from "@/server/desk";
import { addonFlags } from "@/server/addons";
import { paymentQuestion } from "@/server/mcp";

// get_account: the calling agent, its limits, what it can still spend today, and the guide
// version, so an agent knows when its saved copy of the guide is out of date.
export async function GET(request: Request) {
  return asRequester(request, async (caller) => {
    const account = await getDesk().getAgentAccount(caller);
    return Response.json({
      ...paymentQuestion(account),
      ...account,
      network: NETWORK,
      paymentRails: paymentRails(),
        // Optional add-ons on this site; PayPal works without any of them.
        addons: addonFlags(),
      guide: { version: GUIDE_VERSION, url: `${SITE}/agents.md` },
    });
  });
}
