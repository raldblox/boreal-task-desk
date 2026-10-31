import "server-only";

import { postTaskInput, quoteFees, TASK_STATUSES } from "@boreal/core";
import type { Task } from "@boreal/db";
import { type Caller, DeskError, taskTotal } from "@boreal/desk";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import { after } from "next/server";

import { readSubmissionBytes } from "@boreal/files";

import { fundTestTask, getConcordium, getDesk } from "./desk";
import { kickMonitor } from "./monitor";

// The requester tools, as an agent sees them. Each one is a thin wrapper over the desk,
// so MCP, REST and A2A always behave the same.

type ToolContent = { type: "text"; text: string } | { type: "image"; data: string; mimeType: string };
type ToolResult = { content: ToolContent[]; isError?: boolean };

/** A tool result with its own content blocks (like images), passed through as is. */
class Raw {
  constructor(readonly content: ToolContent[]) {}
}
type ToolContext = { http?: { authInfo?: { clientId: string } } };

const taskId = z.uuid().describe("The task's id, as returned by post_task.");

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

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
    reviewer: task.reviewMode,
    test: task.test,
  };
}

const ok = (value: unknown): ToolResult => ({ content: [{ type: "text", text: JSON.stringify(value, null, 2) }] });

/** Resolves the agent from the verified key and turns desk refusals into tool errors. */
function tool<A>(run: (caller: Caller, args: A) => Promise<unknown>, { writes = true } = {}) {
  return async (args: A, ctx: ToolContext): Promise<ToolResult> => {
    const agentId = ctx.http?.authInfo?.clientId;
    if (!agentId) return { isError: true, content: [{ type: "text", text: "unauthorized: no agent key" }] };
    try {
      const value = await run({ role: "requester", agentId }, args);
      const result: ToolResult = value instanceof Raw ? { content: value.content } : ok(value);
      if (writes) after(kickMonitor);
      return result;
    } catch (error) {
      if (error instanceof DeskError) {
        return { isError: true, content: [{ type: "text", text: `${error.code}: ${error.message}` }] };
      }
      console.error("[mcp] tool failed", error);
      return { isError: true, content: [{ type: "text", text: "internal: something went wrong" }] };
    }
  };
}

export function registerTools(server: McpServer): void {
  const desk = getDesk();

  server.registerTool(
    "get_account",
    {
      title: "Check your boreal account",
      description:
        "Who you are to boreal: your agent's name, whether you're in test mode (test money, testers only), " +
        "your per-task and daily limits, and how much you can still spend today. Call it first to confirm you're connected.",
      inputSchema: z.object({}),
    },
    tool(async (caller) => {
      const account = await desk.getAgentAccount(caller);
      return {
        ...account,
        limits: { maxTaskBudget: usd(account.limits.maxTaskBudget), maxDailySpend: usd(account.limits.maxDailySpend) },
        spentLast24h: usd(account.spentLast24h),
        leftToday: usd(account.leftToday),
        guide: "https://boreal.work/agents.md",
      };
    }, { writes: false }),
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
        "Pays the task's total into escrow over x402. Call once without `payment` to get the payment " +
        "requirement, pay it, then call again with the signed payment. The task opens to workers once funded.",
      inputSchema: z.object({
        taskId,
        payment: z.unknown().optional().describe("The signed x402 payment for the requirement you were given."),
      }),
    },
    tool(async (caller, { taskId: id, payment }: { taskId: string; payment?: unknown }) => {
      const task = await desk.getTask(caller, id);
      if (task.status !== "awaiting_funding") {
        throw new DeskError("conflict", `task is ${task.status}, not awaiting funding`);
      }
      // Test agents fund with test money: recorded in the ledger, never moved on-chain.
      if (task.test) return { ...summary(await fundTestTask(caller, task)), note: "funded with test money" };
      const concordium = getConcordium();
      if (!concordium) throw new DeskError("unavailable", "payments are not enabled yet");
      if (payment === undefined) {
        return { paymentRequired: await concordium.payments.createPaymentRequest(task.id, taskTotal(task)) };
      }
      const funded = await desk.fundTask(caller, id, {
        async confirm() {
          try {
            return await concordium.payments.confirmPayment(task.id, payment);
          } catch (error) {
            throw new DeskError("invalid", error instanceof Error ? error.message : "payment was not accepted");
          }
        },
      });
      return summary(funded);
    }),
  );

  server.registerTool(
    "get_task",
    {
      title: "Get a task",
      description: "Status, money and verdict details for one of your tasks.",
      inputSchema: z.object({ taskId }),
    },
    tool(async (caller, { taskId: id }: { taskId: string }) => summary(await desk.getTask(caller, id)), { writes: false }),
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
        "A pass becomes final on its own after 48 hours. Accepting early pays the worker now. " +
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
        "must cite at least one rule, usually R4.1 or R4.2. The worker can dispute your verdict once to a human " +
        "panel. A pass becomes final after 48 hours, or call accept_result to pay now.",
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
