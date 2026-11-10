import { DeskError } from "@boreal/desk";

import { asRequester, getDesk, getRails, readJson } from "@/server/desk";
import { ownerNearPayLink } from "@/server/mcp";

/**
 * fund_tasks: several screened tasks funded by one PayPal approval. Without a payment the reply
 * funds them all at once from the owner's saved PayPal account if there is one, else it
 * is 402 with one approveUrl for the total; once the owner approves, send the same `taskIds`
 * with `{ "orderId": … }` (or `payment: { orderId }`). PayPal holds each task's money
 * separately, so each is captured or released on its own.
 */
export async function POST(request: Request) {
  return asRequester(request, async (caller) => {
    const body = (await readJson(request)) as { taskIds?: unknown; orderId?: unknown; payment?: unknown; rail?: unknown } | null;
    const taskIds = Array.isArray(body?.taskIds) ? body.taskIds.filter((id): id is string => typeof id === "string") : [];
    if (taskIds.length === 0) throw new DeskError("invalid", 'send { "taskIds": [ … ] }, 1 to 10 tasks awaiting funding');
    const payment = body?.payment ?? (typeof body?.orderId === "string" ? { orderId: body.orderId } : undefined);

    // NEAR: one link for the owner, who pays them all from their own wallet in one approval.
    if (body?.rail === "near" || new URL(request.url).searchParams.get("rail") === "near") return Response.json(await ownerNearPayLink(caller, taskIds));
    const desk = getDesk();
    if (payment === undefined) {
      // The owner saved a PayPal account: fund them all now, no approval page.
      if (getRails().paypal?.vault && (await desk.getAgentAccount(caller)).savedPaymentMethod) {
        return Response.json({ ...(await desk.fundTasksSaved(caller, taskIds, "paypal")), paidWith: "saved PayPal account" });
      }
      const required = await desk.requestBatchFunding(caller, taskIds, "paypal");
      return Response.json(
        { error: "payment required", paymentRequired: required, retry: 'once approved, POST again with the same taskIds and { "orderId": "<paymentRequired.orderId>" }' },
        { status: 402 },
      );
    }
    return Response.json(await desk.fundTasks(caller, taskIds, payment, "paypal"));
  });
}
