import "server-only";

import { type Caller, createDesk, type Desk, DeskError, verifyAgentKey } from "@boreal/desk";

import { getDb } from "./db";

let desk: Desk | undefined;

export function getDesk(): Desk {
  desk ??= createDesk({ db: getDb() });
  return desk;
}

const STATUS: Record<DeskError["code"], number> = {
  invalid: 400,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  limit: 422,
};

/** Resolves the requester agent from `Authorization: Bearer bk_…`, or null. */
export async function requesterFrom(request: Request): Promise<Caller | null> {
  const header = request.headers.get("authorization") ?? "";
  const key = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const agentId = key ? await verifyAgentKey(getDb(), key) : null;
  return agentId ? { role: "requester", agentId } : null;
}

/**
 * Runs a requester-only API action: authenticates the agent, then turns desk refusals
 * into JSON errors with the matching status.
 */
export async function asRequester(
  request: Request,
  action: (caller: Caller) => Promise<Response>,
): Promise<Response> {
  const caller = await requesterFrom(request);
  if (!caller) {
    return Response.json(
      { error: "unauthorized", message: "send a valid agent key as a Bearer token" },
      { status: 401 },
    );
  }
  try {
    return await action(caller);
  } catch (error) {
    if (error instanceof DeskError) {
      return Response.json({ error: error.code, message: error.message }, { status: STATUS[error.code] });
    }
    console.error("[api] unexpected error", error);
    return Response.json({ error: "internal", message: "something went wrong" }, { status: 500 });
  }
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new DeskError("invalid", "request body must be JSON");
  }
}
