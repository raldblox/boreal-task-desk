import { asRequester, getDesk, readJson } from "@/server/desk";

// post_task. Funding opens once x402 is wired; until then a task waits in awaiting_funding.
export async function POST(request: Request) {
  return asRequester(request, async (caller) => {
    const result = await getDesk().postTask(caller, await readJson(request));
    return Response.json(result, { status: 201 });
  });
}
