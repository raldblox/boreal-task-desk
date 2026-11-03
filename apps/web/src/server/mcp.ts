import "server-only";

import { isNearRequirement, isPayPalRequirement } from "@boreal/concordium";
import { postTaskInput, quoteFees, TASK_STATUSES } from "@boreal/core";
import type { Task } from "@boreal/db";
import { type Caller, DeskError, taskTotal } from "@boreal/desk";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import { after } from "next/server";

import { readSubmissionBytes } from "@boreal/files";

import { GUIDE_VERSION, NETWORK, SITE } from "@/content/agent-guide";

import { fundTestTask, getDesk, getRails, paymentRails, pickRail } from "./desk";
import { clientHash } from "./id-app";
import { kickMonitor, kickMonitorSoon } from "./monitor";

// The requester tools, as an agent sees them. Each one is a thin wrapper over the desk,
// so MCP, REST and A2A always behave the same.

export type ToolContent = { type: "text"; text: string } | { type: "image"; data: string; mimeType: string };
type ToolResult = { content: ToolContent[]; isError?: boolean };

/** A tool result with its own content blocks (like images), passed through as is. */
export class Raw {
  constructor(readonly content: ToolContent[]) {}
}
type ToolContext = { http?: { authInfo?: { clientId: string }; req?: Request } };

const taskId = z.uuid().describe("The task's id, as returned by post_task.");

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** A task's money view with amounts as dollars. */
function moneyUsd(m: Awaited<ReturnType<ReturnType<typeof getDesk>["taskMoneyFor"]>>) {
  return {
    ...m,
    total: usd(m.total),
    funded: usd(m.funded),
    inEscrow: usd(m.inEscrow),
    paidOut: { worker: usd(m.paidOut.worker), reviewer: usd(m.paidOut.reviewer), platform: usd(m.paidOut.platform) },
    refunded: usd(m.refunded),
    settling: usd(m.settling),
  };
}

/** What an agent needs to know about a task; internal fields stay out. */
function summary(task: Task) {
  return {
    id: task.id,
    status: task.status,
    description: task.description,
    acceptanceCriteria: task.acceptanceCriteria,
    resultFormat: task.resultFormat,
    money: {
      budget: usd(task.budget),
      platformFee: usd(task.platformFee),
      reviewFee: usd(task.reviewFee),
      total: usd(taskTotal(task)),
    },
    deadline: task.deadline,
    claimed: task.claimedBy !== null,
    verdictAt: task.verdictAt,
    disputeUsed: task.disputeUsed,
    fundingTxHash: task.fundingTxHash,
    /** Funded on a rail that holds the money (PayPal): taken only when the task is final. */
    held: task.fundingHold !== null,
    reviewer: task.reviewMode,
    /** Who may do it: verified people only, or AI agents too. */
    fulfillers: task.fulfillers,
    /** Who took it, once claimed: a person or an AI agent. */
    ...("fulfilledBy" in task ? { fulfilledBy: (task as { fulfilledBy: "person" | "agent" | null }).fulfilledBy } : {}),
    test: task.test,
  };
}

const ok = (value: unknown): ToolResult => ({ content: [{ type: "text", text: JSON.stringify(value, null, 2) }] });

/**
 * What a tool does, apart from MCP: A2A calls the same `run` with the same arguments, so every
 * surface behaves alike. `caller` is null for the keyless link tools.
 */
export interface ToolRun {
  keyless: boolean;
  writes: boolean;
  run: (caller: Caller | null, args: never, req: Request | undefined) => Promise<unknown>;
}

/** Resolves the agent from the verified key and turns desk refusals into tool errors. */
function tool<A>(run: (caller: Caller, args: A) => Promise<unknown>, { writes = true } = {}) {
  const handler = async (args: A, ctx: ToolContext): Promise<ToolResult> => {
    const agentId = ctx.http?.authInfo?.clientId;
    if (!agentId) {
      return {
        isError: true,
        content: [{ type: "text", text: "unauthorized: no valid agent key. Call request_link to get one from your owner." }],
      };
    }
    try {
      const value = await run({ role: "requester", agentId }, args);
      const result: ToolResult = value instanceof Raw ? { content: value.content } : ok(value);
      after(writes ? kickMonitor : kickMonitorSoon);
      return result;
    } catch (error) {
      if (error instanceof DeskError) {
        return { isError: true, content: [{ type: "text", text: `${error.code}: ${error.message}` }] };
      }
      console.error("[mcp] tool failed", error);
      return { isError: true, content: [{ type: "text", text: "internal: something went wrong" }] };
    }
  };
  const meta: ToolRun = { keyless: false, writes, run: (caller, args) => run(caller!, args as A) };
  return Object.assign(handler, { boreal: meta });
}

/** Link tools work without a key: they're how an agent gets one. */
function keyless<A>(run: (args: A, req: Request | undefined) => Promise<unknown>) {
  const handler = async (args: A, ctx: ToolContext): Promise<ToolResult> => {
    try {
      return ok(await run(args, ctx.http?.req));
    } catch (error) {
      if (error instanceof DeskError) return { isError: true, content: [{ type: "text", text: `${error.code}: ${error.message}` }] };
      console.error("[mcp] link tool failed", error);
      return { isError: true, content: [{ type: "text", text: "internal: something went wrong" }] };
    }
  };
  const meta: ToolRun = { keyless: true, writes: true, run: (_caller, args, req) => run(args as A, req) };
  return Object.assign(handler, { boreal: meta });
}

export function registerTools(server: McpServer): void {
  const desk = getDesk();

  server.registerTool(
    "request_link",
    {
      title: "Ask your owner for a boreal key",
      description:
        "Use this when you have no agent key yet (or lost it). Returns a code and a link for your owner, and a secret " +
        "pollToken for you. Show your owner the link; they sign in with Concordium ID and approve. Then call check_link " +
        "with the pollToken every few seconds until it returns your key. Works without a key.",
      inputSchema: z.object({
        agentName: z.string().min(1).max(80).describe("Your name, as your owner will recognise it, e.g. Hermes."),
        agentDescription: z.string().max(500).optional().describe("One line on what you do, shown to your owner."),
      }),
    },
    keyless(async (args: { agentName: string; agentDescription?: string }, req) => {
      const origin = req ? new URL(req.url).origin : SITE;
      const link = await desk.requestAgentLink(args, req ? clientHash(req) : "mcp");
      return {
        ...link,
        approveUrl: `${origin}/link/${link.code}`,
        tellYourOwner: `Please approve me on boreal.work: ${origin}/link/${link.code} (code ${link.code}, valid 15 minutes).`,
        next: "call check_link with pollToken every 5 seconds; keep pollToken secret",
      };
    }),
  );

  server.registerTool(
    "check_link",
    {
      title: "Collect your boreal key",
      description:
        "Polls a link request made with request_link. Returns pending until your owner decides. When approved it returns " +
        "your agent key (bk_…) exactly once: save it right away as the Authorization: Bearer header for the boreal MCP " +
        "server (or REST API), then reconnect. Works without a key.",
      inputSchema: z.object({ pollToken: z.string().min(10).describe("The secret pollToken from request_link.") }),
    },
    keyless(async ({ pollToken }: { pollToken: string }) => {
      const result = await desk.pollAgentLink(pollToken);
      if (result.status !== "approved") return result;
      return {
        ...result,
        save: `This key is shown once. Store it as the header Authorization: Bearer <key> for ${SITE}/api/mcp, reconnect, then call get_account.`,
      };
    }),
  );

  server.registerTool(
    "get_account",
    {
      title: "Check your boreal account",
      description:
        "Who you are to boreal: your agent's name, your per-task and daily limits, how much you can still spend today, " +
        "the payment rails enabled (paymentRails), whether your owner connected PayPal for you (savedPaymentMethod), " +
        "and testMode (true only for operator-made test agents: test money, testers only; approved agents are live). " +
        "Call it first to confirm you're connected.",
      inputSchema: z.object({}),
    },
    tool(async (caller) => {
      const account = await desk.getAgentAccount(caller);
      return {
        ...account,
        limits: { maxTaskBudget: usd(account.limits.maxTaskBudget), maxDailySpend: usd(account.limits.maxDailySpend) },
        spentLast24h: usd(account.spentLast24h),
        leftToday: usd(account.leftToday),
        network: NETWORK,
        // Which rail live tasks fund on; null means only test money works here today.
        // Rails live tasks can fund on (default first); empty means only test money works here today.
        paymentRails: paymentRails(),
        guide: { version: GUIDE_VERSION, url: `${SITE}/agents.md` },
      };
    }, { writes: false }),
  );

  server.registerTool(
    "get_balance",
    {
      title: "See where your money is",
      description:
        "Your money across all your tasks: how much is held in escrow, how much is waiting out a verdict's 48-hour " +
        "window, what's settling, and totals paid to workers, fees and refunds. Also lists what you can act on now: " +
        "tasks to fund, open tasks you can cancel for a full refund, passes you can accept to pay now, and results to review. " +
        "Refunds go back automatically; there's nothing to withdraw.",
      inputSchema: z.object({}),
    },
    tool(async (caller) => {
      const b = await desk.getBalance(caller);
      return {
        ...b,
        currency: "USD",
        inEscrow: usd(b.inEscrow),
        awaitingFinalVerdict: usd(b.awaitingFinalVerdict),
        settling: usd(b.settling),
        totals: Object.fromEntries(Object.entries(b.totals).map(([k, v]) => [k, usd(v)])),
        actions: {
          ...b.actions,
          fund: b.actions.fund.map((a) => ({ ...a, total: usd(a.total) })),
          cancelForRefund: b.actions.cancelForRefund.map((a) => ({ ...a, inEscrow: usd(a.inEscrow) })),
        },
        awaiting: b.awaiting.map((a) => ({ ...a, inEscrow: usd(a.inEscrow) })),
      };
    }, { writes: false }),
  );

  server.registerTool(
    "get_ledger",
    {
      title: "List your money movements",
      description:
        "Every ledger entry on your tasks, newest first: funding into escrow, payouts to workers, fees and refunds, " +
        "with status (pending until the transfer confirms, then settled) and the on-chain transaction when there is one. " +
        "Test-money entries are marked test and never move on-chain.",
      inputSchema: z.object({
        taskId: taskId.optional(),
        limit: z.number().int().min(1).max(200).optional(),
      }),
    },
    tool(async (caller, args: { taskId?: string; limit?: number }) =>
      (await desk.getLedger(caller, args)).map((e) => ({ ...e, amount: usd(e.amount) })),
      { writes: false },
    ),
  );

  server.registerTool(
    "quote_fees",
    {
      title: "Quote a task's total",
      description:
        "What you'd pay into escrow for a budget: the worker's pay plus the platform fee and, unless you review it " +
        "yourself, the review fee. Nothing is posted or charged.",
      inputSchema: z.object({
        budget: postTaskInput.shape.budget,
        reviewer: postTaskInput.shape.reviewer,
      }),
    },
    tool(async (_caller, { budget, reviewer }: { budget: number; reviewer?: "boreal" | "requester" }) => {
      const quote = quoteFees(budget, { reviewer });
      return { ...quote, usd: { budget: usd(quote.budget), platformFee: usd(quote.platformFee), reviewFee: usd(quote.reviewFee), total: usd(quote.total) } };
    }, { writes: false }),
  );

  server.registerTool(
    "post_task",
    {
      title: "Post a task for a verified human",
      description:
        "Hand off a step you can't do alone to a verified human. Returns the task and its fee quote. " +
        "The task is screened against the boreal rulebook, then you fund it with fund_task. " +
        "You pay only if the result passes review.",
      inputSchema: postTaskInput,
    },
    tool(async (caller, args) => {
      const { task, quote } = await desk.postTask(caller, args);
      return { task: summary(task), quote: { ...quote, totalUsd: usd(quote.total) }, next: "fund_task once screened" };
    }),
  );

  server.registerTool(
    "fund_task",
    {
      title: "Fund a screened task",
      description:
        "Pays the task's total into escrow. Call once without `payment` to get the payment requirement, pay it, then " +
        "call again with the payment. The task opens to workers once funded. Pick the rail with `rail` (paypal, near or " +
        "concordium; get_account lists the ones enabled, default first). On Concordium the requirement is x402: sign it " +
        "from a Concordium wallet holding the token and send the signed payload as payment. On PayPal the requirement's " +
        "extra.approveUrl is a PayPal checkout: have your owner (or a PayPal-enabled wallet you control) approve it, " +
        "then call again with payment: { orderId }. Once your owner has connected PayPal for you (on boreal when they " +
        "approved you, or on My account; or by approving one checkout), fund_task pays in a single call with no " +
        "approval page, within your limits: get_account shows savedPaymentMethod. PayPal only holds the money: " +
        "it is captured when the task passes, and the hold is voided if the task fails, expires or is cancelled (a fail " +
        "still pays the review fee).",
      inputSchema: z.object({
        taskId,
        rail: z.enum(["paypal", "concordium", "near"]).optional().describe("Which rail to pay on; defaults to the first in get_account.paymentRails."),
        payment: z
          .unknown()
          .optional()
          .describe(
            "The signed x402 payment for the requirement you were given, { orderId } for an approved PayPal order, " +
              "or { txHash, signerId } for your NEAR ft_transfer to escrow (memo from the requirement).",
          ),
      }),
    },
    tool(async (caller, { taskId: id, payment, rail: named }: { taskId: string; payment?: unknown; rail?: "paypal" | "concordium" | "near" }) => {
      const task = await desk.getTask(caller, id);
      if (task.status !== "awaiting_funding") {
        throw new DeskError("conflict", `task is ${task.status}, not awaiting funding`);
      }
      // Test agents fund with test money: recorded in the ledger, never moved on-chain.
      if (task.test) return { ...summary(await fundTestTask(caller, task)), note: "funded with test money" };
      if (payment === undefined) {
        // The owner saved a PayPal account: fund in this one call, no approval page.
        let savedRefused: string | undefined;
        const paypal = getRails().paypal;
        if ((!named || named === "paypal") && paypal?.vault && (await desk.getAgentAccount(caller)).savedPaymentMethod) {
          try {
            return {
              ...summary(await desk.fundTask(caller, id, { vault: true }, { rail: "paypal" })),
              paidWith: "your owner's saved PayPal account",
            };
          } catch (error) {
            // A refused saved account falls back to an approval; any other refusal stands.
            if (!(error instanceof DeskError && error.code === "invalid")) throw error;
            savedRefused = error.message;
          }
        }
        const { rail, payments } = pickRail(named);
        const requirement = await payments.createPaymentRequest(task.id, taskTotal(task));
        const others = paymentRails().filter((r) => r !== rail);
        if (isPayPalRequirement(requirement)) {
          const { limits } = await desk.getAgentAccount(caller);
          const saves = payments.vault
            ? ` Approving also saves your PayPal account for me, so I can fund later boreal tasks without asking, up to ` +
              `${usd(limits.maxTaskBudget)} a task and ${usd(limits.maxDailySpend)} a day.`
            : "";
          return {
            ...(savedRefused ? { savedPaymentMethodRefused: savedRefused } : {}),
            paymentRequired: requirement,
            tellYourOwner:
              `Please approve ${usd(requirement.amount)} for this boreal task on PayPal: ${requirement.extra.approveUrl} ` +
              `(held, not charged, until the work passes review).${saves} ` +
              `Or connect PayPal for me once on My account (${SITE}/me) and I won't need to ask again.`,
            next: `once approved, call fund_task with payment: { "orderId": "${requirement.nonce}" }`,
            ...(others.length ? { otherRails: others } : {}),
          };
        }
        if (isNearRequirement(requirement)) {
          return {
            rail,
            paymentRequired: requirement,
            next:
              `from your NEAR account, call ft_transfer on ${requirement.asset} with receiver_id "${requirement.payTo}", ` +
              `amount "${requirement.amount}" and memo "${requirement.extra.memo}" (attach 1 yoctoNEAR), then call fund_task ` +
              `with payment: { "txHash": "<the transaction hash>", "signerId": "<your NEAR account>" }`,
            ...(others.length ? { otherRails: others } : {}),
          };
        }
        return {
          rail,
          paymentRequired: requirement,
          next: "sign this x402 requirement from a Concordium wallet holding the token, then call fund_task with the signed payload as payment",
          ...(others.length ? { otherRails: others } : {}),
        };
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
      return { ...summary(funded), rail };
    }),
  );

  server.registerTool(
    "fund_tasks",
    {
      title: "Fund several tasks with one approval",
      description:
        "Funds 2 to 10 of your screened tasks with ONE PayPal approval from your owner, instead of one checkout per " +
        "task. Call once with `taskIds` and no `payment`: you get one approveUrl for the total; send it to your " +
        "owner. Once approved, call again with the same `taskIds` and payment: { orderId }. PayPal holds each task's " +
        "money separately, so each is still captured only when it passes and released if it fails, expires or is " +
        "cancelled. Together they must fit your daily cap. Tasks that fail to fund are listed in `failed`, with their " +
        "hold released; the rest open to workers.",
      inputSchema: z.object({
        taskIds: z.array(taskId).min(1).max(10).describe("The tasks to fund together, all awaiting funding."),
        payment: z.unknown().optional().describe("{ orderId } of the approved PayPal order, on the second call."),
      }),
    },
    tool(async (caller, { taskIds, payment }: { taskIds: string[]; payment?: unknown }) => {
      if (payment === undefined) {
        const request = await desk.requestBatchFunding(caller, taskIds, "paypal");
        return {
          paymentRequired: request,
          tellYourOwner:
            `Please approve ${usd(request.amount)} on PayPal for ${request.taskIds.length} boreal tasks, in one go: ` +
            `${request.approveUrl} (held, not charged; each task is charged only when its work passes review).`,
          next: `once approved, call fund_tasks with the same taskIds and payment: { "orderId": "${request.orderId}" }`,
        };
      }
      const { funded, failed } = await desk.fundTasks(caller, taskIds, payment, "paypal");
      return { funded: funded.map(summary), failed };
    }),
  );

  server.registerTool(
    "get_task",
    {
      title: "Get a task",
      description:
        "Status, money and verdict details for one of your tasks, including where its money is now (escrow.state: " +
        "not_funded, held, awaiting_final_verdict, settling, paid_out or refunded) and when a verdict becomes final.",
      inputSchema: z.object({ taskId }),
    },
    tool(async (caller, { taskId: id }: { taskId: string }) => {
      const task = await desk.getTask(caller, id);
      return { ...summary(task), escrow: moneyUsd(await desk.taskMoneyFor(task)) };
    }, { writes: false }),
  );

  server.registerTool(
    "list_tasks",
    {
      title: "List your tasks",
      description: "Your tasks, newest first. Filter by status to find ones that need you.",
      inputSchema: z.object({
        status: z.enum(TASK_STATUSES).optional(),
        limit: z.number().int().min(1).max(100).optional(),
      }),
    },
    tool(async (caller, args: { status?: (typeof TASK_STATUSES)[number]; limit?: number }) =>
      (await desk.listTasks(caller, args)).map(summary),
      { writes: false },
    ),
  );

  server.registerTool(
    "accept_result",
    {
      title: "Accept a passed result early",
      description:
        "A pass from boreal's reviewer becomes final on its own after 48 hours; accepting early pays the worker now. " +
        "(A pass you gave with review_result is already final.) " +
        "You can't overrule a pass; dispute it instead if you think the reviewer was wrong.",
      inputSchema: z.object({ taskId }),
    },
    tool(async (caller, { taskId: id }: { taskId: string }) => summary(await desk.acceptEarly(caller, id))),
  );

  server.registerTool(
    "dispute_verdict",
    {
      title: "Dispute a verdict",
      description:
        "Sends the reviewer's verdict to a panel that includes a human. Once per task, within 48 hours " +
        "of the verdict. The panel's decision is final.",
      inputSchema: z.object({ taskId, reason: z.string().min(10).max(2_000).describe("Why the verdict is wrong.") }),
    },
    tool(async (caller, { taskId: id, reason }: { taskId: string; reason: string }) =>
      summary(await desk.disputeVerdict(caller, id, reason)),
    ),
  );

  server.registerTool(
    "cancel_task",
    {
      title: "Cancel a task",
      description: "Withdraws a task before a worker claims it. A funded task is refunded in full.",
      inputSchema: z.object({ taskId }),
    },
    tool(async (caller, { taskId: id }: { taskId: string }) => summary(await desk.cancelTask(caller, id))),
  );

  server.registerTool(
    "get_submission",
    {
      title: "See a task's submission",
      description:
        "The worker's latest submission: their text, and any photos as images you can look at. " +
        "Use it to review tasks you posted with reviewer: requester.",
      inputSchema: z.object({ taskId }),
    },
    tool(
      async (caller, { taskId: id }: { taskId: string }) => {
        const submission = await desk.getSubmission(caller, id);
        if (!submission) throw new DeskError("not_found", "nothing has been submitted yet");
        const content: ToolContent[] = [
          {
            type: "text",
            text: JSON.stringify({ submittedAt: submission.createdAt, text: submission.text, files: submission.fileUrls.length }, null, 2),
          },
        ];
        for (const path of submission.fileUrls) {
          const file = await readSubmissionBytes(path);
          if (file?.contentType.startsWith("image/")) {
            content.push({ type: "image", data: file.bytes.toString("base64"), mimeType: file.contentType });
          } else if (file) {
            content.push({ type: "text", text: `Attached ${file.contentType} file: ${path}` });
          }
        }
        return new Raw(content);
      },
      { writes: false },
    ),
  );

  server.registerTool(
    "review_result",
    {
      title: "Review a submission",
      description:
        "Pass or fail the worker's result on a task you posted with reviewer: requester. Judge only against " +
        "your acceptance criteria; where they're ambiguous, the worker's reasonable reading wins (R5.2). A fail " +
        "must cite at least one rule, usually R4.1 or R4.2. Your pass is final at once and pays the worker now " +
        "(you were the judge, so there's no window). A fail can be disputed by the worker once, to a human panel.",
      inputSchema: z.object({
        taskId,
        outcome: z.enum(["pass", "fail"]),
        ruleIds: z.array(z.string()).default([]).describe("Rulebook IDs, e.g. R4.1; required for a fail."),
        reasoning: z.string().min(5).max(2_000).describe("What you checked, in words the worker will read."),
      }),
    },
    tool(async (caller, args: { taskId: string; outcome: "pass" | "fail"; ruleIds: string[]; reasoning: string }) =>
      summary(
        await desk.requesterReview(caller, args.taskId, {
          outcome: args.outcome,
          ruleIds: args.ruleIds,
          reasoning: args.reasoning,
        }),
      ),
    ),
  );

  server.registerTool(
    "get_trail",
    {
      title: "Get a task's audit trail",
      description: "Every event on the task, hash-chained and anchored on Concordium, oldest first.",
      inputSchema: z.object({ taskId }),
    },
    tool(async (caller, { taskId: id }: { taskId: string }) => desk.getTrail(caller, id), { writes: false }),
  );
}
