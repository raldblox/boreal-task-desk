import { DeskError } from "@boreal/desk";

import { asRequester, getDesk, readJson } from "@/server/desk";

/**
 * fund_tasks: several screened tasks funded by one PayPal approval. Without a payment the reply
 * is 402 with one approveUrl for the total; once the owner approves, send the same `taskIds`
 * with `{ "orderId": … }` (or `payment: { orderId }`). PayPal holds each task's money
 * separately, so each is captured or released on its own.
 */
export async function POST(request: Request) {
  return asRequester(request, async (caller) => {
    const body = (await readJson(request)) as { taskIds?: unknown; orderId?: unknown; payment?: unknown } | null;
    const taskIds = Array.isArray(body?.taskIds) ? body.taskIds.filter((id): id is string => typeof id === "string") : [];
    if (taskIds.length === 0) throw new DeskError("invalid", 'send { "taskIds": [ … ] }, 1 to 10 tasks awaiting funding');
    const payment = body?.payment ?? (typeof body?.orderId === "string" ? { orderId: body.orderId } : undefined);

    const desk = getDesk();
    if (payment === undefined) {
      const required = await desk.requestBatchFunding(caller, taskIds, "paypal");
      return Response.json(
        { error: "payment required", paymentRequired: required, retry: 'once approved, POST again with the same taskIds and { "orderId": "<paymentRequired.orderId>" }' },
        { status: 402 },
      );
    }
    return Response.json(await desk.fundTasks(caller, taskIds, payment, "paypal"));
  });
}
