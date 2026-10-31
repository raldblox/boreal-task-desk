import "server-only";

import { randomUUID } from "node:crypto";

import { type Concordium, loadConcordium } from "@boreal/concordium";
import type { Task } from "@boreal/db";
import {
  addressesFromEnv,
  type Caller,
  createDesk,
  type Desk,
  DeskError,
  ledgerEscrowBalance,
  outboxTransferJournal,
  taskTotal,
  verifyAgentKey,
} from "@boreal/desk";

import { after } from "next/server";

import { getDb } from "./db";
import { kickMonitor } from "./monitor";

let desk: Desk | undefined;
let concordium: Concordium | null | undefined;

/** The configured adapters, or null when `CONCORDIUM_MODE` is unset (payments and sign-in off). */
export function getConcordium(): Concordium | null {
  if (concordium === undefined) {
    concordium = loadConcordium(process.env, {
      escrowBalance: () => ledgerEscrowBalance(getDb()),
      journal: outboxTransferJournal(getDb()),
    });
  }
  return concordium;
}

export function getDesk(): Desk {
  desk ??= createDesk({
    db: getDb(),
    concordium: getConcordium(),
    addresses: addressesFromEnv(),
    testInvite: process.env.TEST_WORKER_INVITE,
  });
  return desk;
}

/** Funds a test agent's task with test money: recorded in the ledger, never moved on-chain. */
export async function fundTestTask(caller: Caller, task: Task) {
  return getDesk().fundTask(caller, task.id, { txHash: `test-${randomUUID()}`, amount: taskTotal(task) });
}

export const STATUS: Record<DeskError["code"], number> = {
  invalid: 400,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  limit: 422,
  unavailable: 503,
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
    const response = await action(caller);
    // A write may unblock screening, review or payouts; run them now rather than at the next cron.
    if (request.method !== "GET" && response.ok) after(kickMonitor);
    return response;
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
