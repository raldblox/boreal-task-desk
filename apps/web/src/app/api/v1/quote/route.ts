import { postTaskInput, quoteFees } from "@boreal/core";
import { DeskError } from "@boreal/desk";

import { asRequester } from "@/server/desk";

// quote_fees: what a budget costs in total, without posting anything.
export async function GET(request: Request) {
  return asRequester(request, async () => {
    const params = new URL(request.url).searchParams;
    const input = postTaskInput
      .pick({ budget: true, reviewer: true })
      .safeParse({ budget: Number(params.get("budget")), reviewer: params.get("reviewer") ?? undefined });
    if (!input.success) throw new DeskError("invalid", "budget must be a positive whole number of US cents");
    return Response.json(quoteFees(input.data.budget, { reviewer: input.data.reviewer }));
  });
}
