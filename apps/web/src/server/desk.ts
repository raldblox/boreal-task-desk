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

import { loadEvm } from "@boreal/evm";
import { loadNear } from "@boreal/near";
import { loadRails, type PayPalPayments } from "@boreal/paypal";
import { after } from "next/server";

import { addonRefusal, gatedEnv, verification } from "./addons";
import { getDb } from "./db";
import { kickMonitor, kickMonitorSoon } from "./monitor";
import { NETWORK, SITE } from "@/content/agent-guide";

let desk: Desk | undefined;
let concordium: Concordium | null | undefined;
let loaded: { rails: PaymentRails; payments: Payments | null } | undefined;

/** The Concordium adapters, or null when the Concordium add-on is off or `CONCORDIUM_MODE` is unset. */
export function getConcordium(): Concordium | null {
  if (concordium === undefined) {
    concordium = loadConcordium(gatedEnv(), {
      escrowBalance: () => ledgerEscrowBalance(getDb(), "concordium"),
      journal: outboxTransferJournal(getDb()),
    });
  }
  return concordium;
}

function rails() {
  loaded ??= loadRails(gatedEnv(), getConcordium(), {
    escrowBalance: (rail) => ledgerEscrowBalance(getDb(), rail),
    near: loadNear(gatedEnv(), { journal: outboxTransferJournal(getDb()) }),
    evm: loadEvm(gatedEnv(), { journal: outboxTransferJournal(getDb()) }),
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
    // An EVM x402 payload carries a signed EIP-3009 authorization.
    const evm = "authorization" in shape || (typeof (shape as { payload?: unknown }).payload === "object" && (shape as { payload: object | null }).payload !== null && "authorization" in (shape as { payload: object }).payload);
    rail = "orderId" in shape ? "paypal" : "txHash" in shape && "signerId" in shape ? "near" : evm ? "evm" : "concordium";
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
    requireBadge: gatedEnv().REQUIRE_AGENT_BADGE === "1",
    verification: verification(),
    // Testnet only: pass screening automatically when no reviewer runs. Never on live money.
    autoScreen: NETWORK === "testnet" && process.env.AUTO_SCREEN === "1",
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

/**
 * "Ask me each time": when the agent's owner approves each payment from the saved payment
 * method, this asks them (or returns the request already waiting) and says what to tell them.
 * Null when the agent pays on its own, or has no saved method: fund as usual.
 * Used by every funding surface (MCP, REST, A2A), so none can charge the saved method unasked;
 * the desk refuses it too.
 */
export async function ownerApprovalFor(caller: Caller, taskIds: string[]) {
  const desk = getDesk();
  if (caller.role !== "requester") return null;
  const account = await desk.getAgentAccount(caller);
  if (account.kind !== "agent" || !account.savedPaymentMethod || account.spendingMode !== "ask") return null;
  const approval = await desk.requestFundingApproval(caller, taskIds);
  const approveUrl = `${SITE}/approve/${approval.id}`;
  const dollars = `$${(approval.total / 100).toFixed(2)}`;
  return {
    approvalRequired: { id: approval.id, status: "pending" as const, approveUrl, total: approval.total, taskIds: approval.taskIds, expiresAt: approval.expiresAt },
    tellYourOwner:
      `Please approve ${dollars} for ${approval.taskIds.length} boreal.work ${approval.taskIds.length === 1 ? "task" : "tasks"}: ${approveUrl} ` +
      "(held on your saved PayPal account, not charged; each task is charged only when its work passes review).",
    next: "nothing is held yet. Once your owner approves, the tasks are funded at once: poll get_task until status is no longer awaiting_funding. If they decline, cancel the task.",
  };
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
  // Agents as workers are part of the NEAR add-on.
  const off = addonRefusal("near", "agentWorkers");
  if (off) return off;
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
