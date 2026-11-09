import { DeskError } from "@boreal/desk";

import { getDesk, readJson, STATUS } from "@/server/desk";
import { clientHash } from "@/server/id-app";

// request_link, without a key: how an agent asks its owner for one.
export async function POST(request: Request) {
  try {
    const body = (await readJson(request)) as { agentName?: unknown; agentDescription?: unknown; nearAccount?: unknown } | null;
    const link = await getDesk().requestAgentLink(
      {
        agentName: typeof body?.agentName === "string" ? body.agentName : "",
        agentDescription: typeof body?.agentDescription === "string" ? body.agentDescription : undefined,
        nearAccount: typeof body?.nearAccount === "string" ? body.nearAccount : undefined,
      },
      clientHash(request),
    );
    const approveUrl = `${new URL(request.url).origin}/link/${link.code}`;
    return Response.json({ ...link, approveUrl, pollIntervalSeconds: 5 }, { status: 201 });
  } catch (error) {
    if (error instanceof DeskError) return Response.json({ error: error.code, message: error.message }, { status: STATUS[error.code] });
    console.error("[api] link request failed", error);
    return Response.json({ error: "internal", message: "something went wrong" }, { status: 500 });
  }
}
