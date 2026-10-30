import "server-only";

import { postTaskInput, TASK_STATUSES } from "@boreal/core";
import type { Task } from "@boreal/db";
import { type Caller, DeskError, taskTotal } from "@boreal/desk";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import { getConcordium, getDesk } from "./desk";

// The requester tools, as an agent sees them. Each one is a thin wrapper over the desk,
// so MCP, REST and A2A always behave the same.

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };
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
  };
}

const ok = (value: unknown): ToolResult => ({ content: [{ type: "text", text: JSON.stringify(value, null, 2) }] });

/** Resolves the agent from the verified key and turns desk refusals into tool errors. */
function tool<A>(run: (caller: Caller, args: A) => Promise<unknown>) {
  return async (args: A, ctx: ToolContext): Promise<ToolResult> => {
    const agentId = ctx.http?.authInfo?.clientId;
    if (!agentId) return { isError: true, content: [{ type: "text", text: "unauthorized: no agent key" }] };
    try {
      return ok(await run({ role: "requester", agentId }, args));
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
      const concordium = getConcordium();
      if (!concordium) throw new DeskError("unavailable", "payments are not enabled yet");
      const task = await desk.getTask(caller, id);
      if (task.status !== "awaiting_funding") {
        throw new DeskError("conflict", `task is ${task.status}, not awaiting funding`);
      }
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
    tool(async (caller, { taskId: id }: { taskId: string }) => summary(await desk.getTask(caller, id))),
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
    "get_trail",
    {
      title: "Get a task's audit trail",
      description: "Every event on the task, hash-chained and anchored on Concordium, oldest first.",
      inputSchema: z.object({ taskId }),
    },
    tool(async (caller, { taskId: id }: { taskId: string }) => desk.getTrail(caller, id)),
  );
}
