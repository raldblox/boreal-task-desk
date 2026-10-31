import { DeskError } from "@boreal/desk";

import { getDesk, readJson, STATUS } from "@/server/desk";

// check_link, without a key: pending until the owner decides, then the key, exactly once.
export async function POST(request: Request) {
  try {
    const body = (await readJson(request)) as { pollToken?: unknown } | null;
    const result = await getDesk().pollAgentLink(typeof body?.pollToken === "string" ? body.pollToken : "");
    return Response.json(result);
  } catch (error) {
    if (error instanceof DeskError) return Response.json({ error: error.code, message: error.message }, { status: STATUS[error.code] });
    console.error("[api] link poll failed", error);
    return Response.json({ error: "internal", message: "something went wrong" }, { status: 500 });
  }
}
