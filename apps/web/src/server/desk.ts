import "server-only";

import { randomUUID } from "node:crypto";

import { type Concordium, loadConcordium, type PaymentRail, type PaymentRails, type Payments } from "@boreal/concordium";
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
  loaded ??= loadRails(process.env, getConcordium(), { escrowBalance: (rail) => ledgerEscrowBalance(getDb(), rail) });
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
 * (a PayPal `{ orderId }` or a Concordium x402 payload), else the default.
 */
export function pickRail(named: string | undefined, payment?: unknown): { rail: PaymentRail; payments: Payments } {
  const on = getRails();
  const enabled = paymentRails();
  if (enabled.length === 0) throw new DeskError("unavailable", "payments are not enabled yet; only test money works here");
  let rail: PaymentRail;
  if (named) {
    if (named !== "paypal" && named !== "concordium") throw new DeskError("invalid", "rail must be paypal or concordium");
    rail = named;
  } else if (payment !== undefined) {
    rail = typeof payment === "object" && payment !== null && "orderId" in payment ? "paypal" : "concordium";
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
