import { DeskError, taskTotal } from "@boreal/desk";

import { asRequester, fundTestTask, getDesk, getPayments } from "@/server/desk";

/**
 * fund_task over x402. Without an `X-PAYMENT` header the reply is 402 with what to pay;
 * the agent pays and retries with the header. The payment settles only after the task's
 * checks pass, so a refused task never takes money. On the PayPal rail the requirement's
 * `extra.approveUrl` is where the payer approves, and the header carries `{ orderId }`;
 * the money is then held, and taken only when the task is final. Once the owner has approved
 * one PayPal order, their account is saved for the agent, and a call without the header
 * funds at once from it.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/v1/tasks/[id]/fund">) {
  const { id } = await ctx.params;
  return asRequester(request, async (caller) => {
    const desk = getDesk();
    const task = await desk.getTask(caller, id);
    if (task.status !== "awaiting_funding") {
      throw new DeskError("conflict", `task is ${task.status}, not awaiting funding`);
    }
    // Test agents fund with test money: no 402 round trip, nothing moved on-chain.
    if (task.test) return Response.json(await fundTestTask(caller, task));

    const payments = getPayments();
    if (!payments) throw new DeskError("unavailable", "payments are not enabled yet");

    const header = request.headers.get("x-payment");
    if (!header && payments.vault && (await desk.getAgentAccount(caller)).savedPaymentMethod) {
      try {
        return Response.json(await desk.fundTask(caller, id, { vault: true }));
      } catch (error) {
        // A refused saved account falls back to a fresh approval below; any other refusal stands.
        if (!(error instanceof DeskError && error.code === "invalid")) throw error;
      }
    }
    if (!header) {
      const requirement = await payments.createPaymentRequest(task.id, taskTotal(task));
      return Response.json({ x402Version: 1, error: "payment required", accepts: [requirement] }, { status: 402 });
    }

    let payment: unknown;
    try {
      payment = JSON.parse(Buffer.from(header, "base64").toString("utf8"));
    } catch {
      throw new DeskError("invalid", "X-PAYMENT must be base64-encoded JSON");
    }

    const funded = await desk.fundTask(caller, id, {
      async confirm() {
        try {
          return await payments.confirmPayment(task.id, payment);
        } catch (error) {
          throw new DeskError("invalid", error instanceof Error ? error.message : "payment was not accepted");
        }
      },
    });
    const receipt = Buffer.from(JSON.stringify({ success: true, transaction: funded.fundingTxHash })).toString("base64");
    return Response.json(funded, { headers: { "X-PAYMENT-RESPONSE": receipt } });
  });
}
