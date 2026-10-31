// An in-memory stand-in for the PayPal REST endpoints boreal uses, for tests. It keeps the
// rules that matter to escrow: an order can be authorized only once approved, a hold is
// captured or voided once, a `PayPal-Request-Id` replays the first answer, and a payout
// batch id can't be reused.

interface FakeOrder {
  id: string;
  approved: boolean;
  customId: string;
  amount: { currency_code: string; value: string };
  authorizationId?: string;
}

interface FakeAuthorization {
  id: string;
  orderId: string;
  status: "CREATED" | "CAPTURED" | "PARTIALLY_CAPTURED" | "VOIDED";
  amount: { currency_code: string; value: string };
  captured?: string;
}

export interface FakePayPal {
  fetch: typeof fetch;
  orders: Map<string, FakeOrder>;
  authorizations: Map<string, FakeAuthorization>;
  payouts: { batchId: string; senderBatchId: string; receiver: string; value: string }[];
  /** What the payer does on PayPal's approval page. */
  approve(orderId: string): void;
  /** Every call, as "METHOD /path". */
  calls: string[];
}

export function createFakePayPal(): FakePayPal {
  const orders = new Map<string, FakeOrder>();
  const authorizations = new Map<string, FakeAuthorization>();
  const payouts: FakePayPal["payouts"] = [];
  const replies = new Map<string, { status: number; body: unknown }>();
  const calls: string[] = [];
  let seq = 0;
  const id = (prefix: string) => `${prefix}${String(++seq).padStart(10, "0")}`;

  const error = (status: number, name: string, issue: string) => ({
    status,
    body: { name, message: issue, debug_id: "fake", details: [{ issue }] },
  });

  const orderView = (o: FakeOrder) => {
    const auth = o.authorizationId ? authorizations.get(o.authorizationId) : undefined;
    return {
      id: o.id,
      status: auth ? "COMPLETED" : o.approved ? "APPROVED" : "PAYER_ACTION_REQUIRED",
      links: [{ rel: "payer-action", href: `https://www.sandbox.paypal.com/checkoutnow?token=${o.id}` }],
      purchase_units: [
        {
          custom_id: o.customId,
          amount: o.amount,
          ...(auth ? { payments: { authorizations: [{ id: auth.id, status: auth.status, amount: auth.amount }] } } : {}),
        },
      ],
    };
  };

  function route(method: string, path: string, body: any): { status: number; body: unknown } {
    let m: RegExpExecArray | null;
    if (method === "POST" && path === "/v1/oauth2/token") return { status: 200, body: { access_token: "fake-token", expires_in: 32_400 } };

    if (method === "POST" && path === "/v2/checkout/orders") {
      const unit = body.purchase_units[0];
      const order: FakeOrder = { id: id("ORDER"), approved: false, customId: unit.custom_id, amount: unit.amount };
      orders.set(order.id, order);
      return { status: 200, body: orderView(order) };
    }
    if ((m = /^\/v2\/checkout\/orders\/([^/]+)$/.exec(path)) && method === "GET") {
      const order = orders.get(m[1]!);
      return order ? { status: 200, body: orderView(order) } : error(404, "RESOURCE_NOT_FOUND", "INVALID_RESOURCE_ID");
    }
    if ((m = /^\/v2\/checkout\/orders\/([^/]+)\/authorize$/.exec(path))) {
      const order = orders.get(m[1]!);
      if (!order) return error(404, "RESOURCE_NOT_FOUND", "INVALID_RESOURCE_ID");
      if (!order.approved) return error(422, "UNPROCESSABLE_ENTITY", "ORDER_NOT_APPROVED");
      if (order.authorizationId) return error(422, "UNPROCESSABLE_ENTITY", "ORDER_ALREADY_AUTHORIZED");
      const auth: FakeAuthorization = { id: id("AUTH"), orderId: order.id, status: "CREATED", amount: order.amount };
      authorizations.set(auth.id, auth);
      order.authorizationId = auth.id;
      return { status: 201, body: orderView(order) };
    }
    if ((m = /^\/v2\/payments\/authorizations\/([^/]+)\/(capture|void)$/.exec(path))) {
      const auth = authorizations.get(m[1]!);
      if (!auth) return error(404, "RESOURCE_NOT_FOUND", "INVALID_RESOURCE_ID");
      if (auth.status === "VOIDED") return error(422, "UNPROCESSABLE_ENTITY", "PREVIOUSLY_VOIDED");
      if (auth.status !== "CREATED") return error(422, "UNPROCESSABLE_ENTITY", "AUTHORIZATION_ALREADY_CAPTURED");
      if (m[2] === "void") {
        auth.status = "VOIDED";
        return { status: 204, body: "" };
      }
      auth.captured = body.amount.value;
      auth.status = body.amount.value === auth.amount.value ? "CAPTURED" : "PARTIALLY_CAPTURED";
      return { status: 201, body: { id: id("CAPTURE"), status: "COMPLETED", amount: body.amount } };
    }
    if (method === "POST" && path === "/v1/payments/payouts") {
      const senderBatchId = body.sender_batch_header.sender_batch_id;
      if (payouts.some((p) => p.senderBatchId === senderBatchId)) {
        return error(400, "USER_BUSINESS_ERROR", "Batch with given sender_batch_id already exists");
      }
      const item = body.items[0];
      const batchId = id("BATCH");
      payouts.push({ batchId, senderBatchId, receiver: item.receiver, value: item.amount.value });
      return { status: 201, body: { batch_header: { payout_batch_id: batchId, batch_status: "PENDING" } } };
    }
    if (method === "POST" && path === "/v1/notifications/verify-webhook-signature") {
      return { status: 200, body: { verification_status: body.transmission_sig === "genuine" ? "SUCCESS" : "FAILURE" } };
    }
    return error(404, "NOT_FOUND", `no fake for ${method} ${path}`);
  }

  const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    calls.push(`${method} ${url.pathname}`);
    const headers = new Headers(init?.headers);
    const requestId = headers.get("PayPal-Request-Id");
    const key = requestId ? `${method} ${url.pathname} ${requestId}` : null;
    let reply = key ? replies.get(key) : undefined;
    if (!reply) {
      const raw = typeof init?.body === "string" && init.body.startsWith("{") ? JSON.parse(init.body) : {};
      reply = route(method, url.pathname, raw);
      if (key && reply.status < 500) replies.set(key, reply);
    }
    const text = reply.body === "" ? "" : JSON.stringify(reply.body);
    return new Response(reply.status === 204 ? null : text, { status: reply.status });
  }) as typeof fetch;

  return {
    fetch: fakeFetch,
    orders,
    authorizations,
    payouts,
    calls,
    approve(orderId) {
      const order = orders.get(orderId);
      if (!order) throw new Error(`no order ${orderId}`);
      order.approved = true;
    },
  };
}
