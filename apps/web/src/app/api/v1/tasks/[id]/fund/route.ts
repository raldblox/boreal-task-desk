import { DeskError, taskTotal } from "@boreal/desk";

import { asRequester, fundTestTask, getDesk, getRails, paymentRails, pickRail } from "@/server/desk";

/**
 * fund_task over x402 v2. Without a payment header the reply is 402 with what to pay (in the
 * `PAYMENT-REQUIRED` header and the body); the agent signs and retries with `PAYMENT-SIGNATURE`
 * (or the v1 name `X-PAYMENT`). The payment settles only after the task's checks pass, so a
 * refused task never takes money. On the PayPal rail the requirement's `extra.approveUrl` is
 * where the payer approves, and the header carries `{ orderId }`; the money is then held, and
 * taken only when the task is final. Once the owner has connected PayPal for the agent (on
 * boreal, or by approving one order), a call without the header funds at once from it.
 * With several rails on, the 402 lists one requirement per rail (`?rail=` asks for one);
 * the payment sent back says which rail it is. The payment may also come as a JSON body,
 * `{ "payment": … }` or a bare `{ "orderId": … }`, for clients that can't set headers.
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

    const named = new URL(request.url).searchParams.get("rail") ?? undefined;
    if (paymentRails().length === 0) throw new DeskError("unavailable", "payments are not enabled yet; only test money works here");

    const header = request.headers.get("payment-signature") ?? request.headers.get("x-payment");
    const fromBody = header ? undefined : await paymentFromBody(request);
    const paypal = getRails().paypal;
    if (!header && !fromBody && (!named || named === "paypal") && paypal?.vault && (await desk.getAgentAccount(caller)).savedPaymentMethod) {
      try {
        return Response.json(await desk.fundTask(caller, id, { vault: true }, { rail: "paypal" }));
      } catch (error) {
        // A refused saved account falls back to a fresh approval below; any other refusal stands.
        if (!(error instanceof DeskError && error.code === "invalid")) throw error;
      }
    }
    if (!header && !fromBody) {
      // One requirement per rail the agent may pay on, the default first.
      const rails = named ? [pickRail(named).rail] : paymentRails();
      const on = getRails();
      const accepts = await Promise.all(rails.map((rail) => on[rail]!.createPaymentRequest(task.id, taskTotal(task))));
      const required = {
        x402Version: 2,
        error: "payment required",
        resource: { url: request.url, description: `Fund task ${task.id} into escrow`, mimeType: "application/json" },
        accepts,
        retry:
          "PayPal: once the payer approves extra.approveUrl, POST here again with header PAYMENT-SIGNATURE: " +
          'base64({"orderId":"<extra.orderId>"}), or with JSON body {"orderId":"<extra.orderId>"}. ' +
          "Concordium: send the signed x402 payload the same way.",
      };
      return Response.json(required, { status: 402, headers: { "PAYMENT-REQUIRED": encode(required) } });
    }

    let payment: unknown = fromBody;
    if (header) {
      try {
        payment = JSON.parse(Buffer.from(header, "base64").toString("utf8"));
      } catch {
        throw new DeskError("invalid", "PAYMENT-SIGNATURE must be base64-encoded JSON");
      }
    }

    const { rail, payments } = pickRail(named, payment);
    const funded = await desk.fundTask(caller, id, {
      async confirm() {
        try {
          return await payments.confirmPayment(task.id, payment);
        } catch (error) {
          throw new DeskError("invalid", error instanceof Error ? error.message : "payment was not accepted");
        }
      },
    }, { rail });
    const receipt = encode({ success: true, transaction: funded.fundingTxHash });
    return Response.json(funded, { headers: { "PAYMENT-RESPONSE": receipt, "X-PAYMENT-RESPONSE": receipt } });
  });
}

/** A payment sent as the JSON body: `{ payment }`, or a bare PayPal `{ orderId }`. */
async function paymentFromBody(request: Request): Promise<unknown> {
  const text = await request.text();
  if (!text.trim()) return undefined;
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new DeskError("invalid", "request body must be JSON");
  }
  if (!body || typeof body !== "object") return undefined;
  const b = body as { payment?: unknown; orderId?: unknown };
  if (b.payment !== undefined) return b.payment;
  return typeof b.orderId === "string" ? { orderId: b.orderId } : undefined;
}

const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64");
