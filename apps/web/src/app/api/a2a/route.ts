import { after, connection } from "next/server";

import { A2A_ERRORS, A2A_PROTOCOL_VERSION, A2AError, handleA2A, howTo } from "@/server/a2a";
import { requesterFrom } from "@/server/desk";
import { kickMonitor, kickMonitorSoon } from "@/server/monitor";

// boreal as an A2A v1.0 server (JSON-RPC 2.0 over HTTP). Deterministic: SendMessage takes one
// structured data part naming a boreal tool, and runs the same handler as MCP (server/a2a.ts).
// Agents authenticate with their boreal key: Authorization: Bearer bk_….

type Id = string | number | null;

function reply(id: Id, body: { result: unknown } | { error: { code: number; message: string; data?: unknown } }, status = 200) {
  return Response.json({ jsonrpc: "2.0", id, ...body }, { status, headers: { "A2A-Version": A2A_PROTOCOL_VERSION } });
}

const fail = (id: Id, code: number, message: string, data?: unknown) =>
  reply(id, { error: { code, message, ...(data === undefined ? {} : { data }) } });

/** Clients send A2A-Version; boreal speaks 1.x. A missing header is let through. */
function versionOk(request: Request): boolean {
  const version = request.headers.get("a2a-version")?.trim();
  return !version || version.split(".")[0] === "1";
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(null, A2A_ERRORS.parse, "the body must be a JSON-RPC 2.0 request");
  }
  if (Array.isArray(body)) return fail(null, A2A_ERRORS.invalidRequest, "batch requests aren't supported; send one call at a time");
  const call = body as { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: unknown } | null;
  const id: Id = typeof call?.id === "string" || typeof call?.id === "number" ? call.id : null;
  if (call?.jsonrpc !== "2.0" || typeof call.method !== "string") {
    return fail(id, A2A_ERRORS.invalidRequest, "expected { \"jsonrpc\": \"2.0\", \"id\", \"method\", \"params\" }", howTo());
  }
  if (!versionOk(request)) {
    return fail(id, A2A_ERRORS.versionNotSupported, `boreal.work speaks A2A ${A2A_PROTOCOL_VERSION}; send A2A-Version: ${A2A_PROTOCOL_VERSION}`);
  }

  const caller = await requesterFrom(request);
  try {
    const { result, writes } = await handleA2A(call.method, call.params, caller, request);
    // A write may unblock screening, review or payouts; run them now rather than at the next cron.
    after(writes ? kickMonitor : kickMonitorSoon);
    return reply(id, { result });
  } catch (error) {
    if (error instanceof A2AError) {
      const unauthorized = (error.data as { error?: string } | undefined)?.error === "unauthorized";
      const response = fail(id, error.code, error.message, error.data);
      if (!unauthorized) return response;
      const headers = new Headers(response.headers);
      headers.set("WWW-Authenticate", 'Bearer realm="boreal"');
      return new Response(response.body, { status: 401, headers });
    }
    console.error("[a2a] unexpected error", error);
    return fail(id, A2A_ERRORS.internal, "internal: something went wrong");
  }
}

/** A browser or a curious agent: what this endpoint takes. */
export async function GET() {
  await connection(); // the tool list loads the desk, which needs the database
  return Response.json(
    { protocol: "A2A", protocolVersion: A2A_PROTOCOL_VERSION, binding: "JSONRPC", methods: ["SendMessage", "GetTask", "CancelTask", "ListTasks"], ...howTo() },
    { headers: { "A2A-Version": A2A_PROTOCOL_VERSION } },
  );
}
