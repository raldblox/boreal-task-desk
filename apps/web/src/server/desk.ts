import "server-only";

import { randomUUID } from "node:crypto";

import { type Concordium, loadConcordium, PAYMENT_RAILS, type PaymentRail, type PaymentRails, type Payments } from "@boreal/concordium";
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
  verifyWorkerKey,
} from "@boreal/desk";

import { loadNear } from "@boreal/near";
import { loadRails, type PayPalPayments } from "@boreal/paypal";
import { after } from "next/server";

import { getDb } from "./db";
import { kickMonitor, kickMonitorSoon } from "./monitor";
import { NETWORK } from "@/content/agent-guide";

let desk: Desk | undefined;
let concordium: Concordium | null | undefined;
let loaded: { rails: PaymentRails; payments: Payments | null } | undefined;

/** The configured adapters, or null when `CONCORDIUM_MODE` is unset (payments and sign-in off). */
export function getConcordium(): Concordium | null {
  if (concordium === undefined) {
    concordium = loadConcordium(process.env, {
      escrowBalance: () => ledgerEscrowBalance(getDb(), "concordium"),
      journal: outboxTransferJournal(getDb()),
    });
  }
  return concordium;
}

function rails() {
  loaded ??= loadRails(process.env, getConcordium(), {
    escrowBalance: (rail) => ledgerEscrowBalance(getDb(), rail),
    near: loadNear(process.env, { journal: outboxTransferJournal(getDb()) }),
  });
  return loaded;
}

/** The default payment rail, or null when only test money works here. */
export function getPayments(): Payments | null {
  return rails().payments;
}

/** Every rail switched on, by name. */
export function getRails(): PaymentRails {
  return rails().rails;
}

/** The rails live (non-test) agents can fund on here, the default first; empty when only test money works. */
export function paymentRails(): PaymentRail[] {
  const { rails: on, payments } = rails();
  const names = Object.keys(on) as PaymentRail[];
  return names.sort((a, b) => Number(on[b] === payments) - Number(on[a] === payments));
}

/** Kept for callers that want one name: the default rail. */
export function paymentRail(): PaymentRail | null {
  return paymentRails()[0] ?? null;
}

/**
 * The rail a fund_task call pays on: the one the agent named, else the one its payment implies
 * (a PayPal `{ orderId }`, a NEAR `{ txHash, signerId }` or a Concordium x402 payload), else the default.
 */
export function pickRail(named: string | undefined, payment?: unknown): { rail: PaymentRail; payments: Payments } {
  const on = getRails();
  const enabled = paymentRails();
  if (enabled.length === 0) throw new DeskError("unavailable", "payments are not enabled yet; only test money works here");
  let rail: PaymentRail;
  if (named) {
    if (!(PAYMENT_RAILS as readonly string[]).includes(named)) throw new DeskError("invalid", `rail must be ${PAYMENT_RAILS.join(", ")}`);
    rail = named as PaymentRail;
  } else if (payment !== undefined) {
    const shape = typeof payment === "object" && payment !== null ? payment : {};
    rail = "orderId" in shape ? "paypal" : "txHash" in shape && "signerId" in shape ? "near" : "concordium";
  } else {
    rail = enabled[0]!;
  }
  const found = on[rail];
  if (!found) throw new DeskError("unavailable", `the ${rail} rail isn't enabled here; use ${enabled.join(" or ")}`);
  return { rail, payments: found };
}

/** True when the site runs on demo money: Concordium testnet tokens or the PayPal sandbox. */
export function demoMoney(): boolean {
  return NETWORK === "testnet";
}

export function getDesk(): Desk {
  desk ??= createDesk({
    db: getDb(),
    concordium: getConcordium(),
    payments: getPayments(),
    rails: getRails(),
    requireBadge: process.env.REQUIRE_AGENT_BADGE === "1",
    // Live money: workers without Concordium ID need an account PayPal has verified.
    requireVerifiedPayPal: NETWORK === "mainnet",
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
    // Reads keep timers (objection windows, deadlines) moving too, throttled.
    else after(kickMonitorSoon);
    return response;
  } catch (error) {
    if (error instanceof DeskError) {
      return Response.json({ error: error.code, message: error.message }, { status: STATUS[error.code] });
    }
    console.error("[api] unexpected error", error);
    return Response.json({ error: "internal", message: "something went wrong" }, { status: 500 });
  }
}

/**
 * Runs an agent worker's API action: authenticates `Authorization: Bearer bw_…` (an AI agent
 * that proved a NEAR account), then turns desk refusals into JSON errors like `asRequester`.
 */
export async function asAgentWorker(request: Request, action: (caller: Caller) => Promise<Response>): Promise<Response> {
  const header = request.headers.get("authorization") ?? "";
  const key = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const workerId = key ? await verifyWorkerKey(getDb(), key) : null;
  if (!workerId) {
    return Response.json({ error: "unauthorized", message: "send your agent worker key (bw_…) as a Bearer token" }, { status: 401 });
  }
  return runAs({ role: "worker", workerId }, request, action);
}

/** Shared by the agent and worker APIs: run, kick the monitor, map desk errors to statuses. */
async function runAs(caller: Caller, request: Request, action: (caller: Caller) => Promise<Response>): Promise<Response> {
  try {
    const response = await action(caller);
    if (request.method !== "GET" && response.ok) after(kickMonitor);
    else after(kickMonitorSoon);
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

/** The PayPal rail, when it is the one in use; webhooks need its client. */
export function getPayPal(): PayPalPayments | null {
  const rail = getPayments();
  return rail && "client" in rail ? (rail as PayPalPayments) : null;
}
