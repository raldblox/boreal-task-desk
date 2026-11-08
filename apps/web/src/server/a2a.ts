import "server-only";

import { randomUUID } from "node:crypto";

import { TASK_STATUSES, type TaskStatus } from "@boreal/core";
import { type Caller, DeskError } from "@boreal/desk";
import type { McpServer } from "@modelcontextprotocol/server";
import type { z } from "zod";

import { SITE } from "@/content/agent-guide";

import { Raw, registerTools, type ToolRun } from "./mcp";

// boreal over A2A v1.0 (JSON-RPC binding). Deterministic: no model reads the messages. A
// SendMessage carries one structured data part, { action: "<MCP tool name>", ...arguments },
// and runs that MCP tool's own handler, so A2A, MCP and REST always agree. GetTask, CancelTask
// and ListTasks map onto get_task, cancel_task and list_tasks, and boreal's task id is the A2A
// task id.

export const A2A_PROTOCOL_VERSION = "1.0";

/** A2A v1.0 method names, with the v0.3 names some clients still send. */
const METHODS: Record<string, "send" | "get" | "cancel" | "list"> = {
  SendMessage: "send",
  GetTask: "get",
  CancelTask: "cancel",
  ListTasks: "list",
  "message/send": "send",
  "tasks/get": "get",
  "tasks/cancel": "cancel",
  "tasks/list": "list",
};

/** JSON-RPC and A2A error codes (A2A spec, section 5.4). */
export const A2A_ERRORS = {
  parse: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internal: -32603,
  /** boreal's own refusals (forbidden, conflict, limit, unavailable, unauthorized); `data.error` says which. */
  refused: -32000,
  taskNotFound: -32001,
  taskNotCancelable: -32002,
  unsupportedOperation: -32004,
  contentTypeNotSupported: -32005,
  versionNotSupported: -32009,
} as const;

export class A2AError extends Error {
  constructor(
    readonly code: number,
    message: string,
    readonly data?: unknown,
  ) {
    super(message);
  }
}

type TaskState =
  | "TASK_STATE_SUBMITTED"
  | "TASK_STATE_WORKING"
  | "TASK_STATE_COMPLETED"
  | "TASK_STATE_FAILED"
  | "TASK_STATE_CANCELED"
  | "TASK_STATE_INPUT_REQUIRED"
  | "TASK_STATE_REJECTED";

/** boreal's states as A2A sees them, and what the requester does next. */
const STATES: Record<TaskStatus, { state: TaskState; next: string }> = {
  posted: { state: "TASK_STATE_SUBMITTED", next: "Being screened against the rulebook. Poll GetTask." },
  refused: { state: "TASK_STATE_REJECTED", next: "Refused by screening; fix the task and post a new one." },
  awaiting_funding: { state: "TASK_STATE_INPUT_REQUIRED", next: 'Screened. Fund it: SendMessage { "action": "fund_task", "taskId": "…" }.' },
  cancelled: { state: "TASK_STATE_CANCELED", next: "Cancelled; any money held was returned." },
  open: { state: "TASK_STATE_WORKING", next: "Funded and open to workers. Poll GetTask." },
  expired: { state: "TASK_STATE_FAILED", next: "Nobody claimed it before the deadline; refunded in full." },
  claimed: { state: "TASK_STATE_WORKING", next: "A worker is on it." },
  submitted: { state: "TASK_STATE_WORKING", next: "The result is in and under review." },
  passed: { state: "TASK_STATE_WORKING", next: "Passed; final after the 48-hour objection window, or accept_result to pay now." },
  failed: { state: "TASK_STATE_WORKING", next: "Failed; final after the 48-hour objection window unless disputed." },
  disputed: { state: "TASK_STATE_WORKING", next: "With the dispute panel." },
  final_pass: { state: "TASK_STATE_COMPLETED", next: "Done: the worker was paid. get_submission has the result." },
  final_fail: { state: "TASK_STATE_FAILED", next: "Final fail: the budget was refunded." },
};

/** The A2A state for a boreal task; a requester-reviewed submission waits on the requester. */
export function a2aState(status: TaskStatus, reviewer: "boreal" | "requester"): { state: TaskState; next: string } {
  if (status === "submitted" && reviewer === "requester") {
    return {
      state: "TASK_STATE_INPUT_REQUIRED",
      next: 'The result is in and you review it: get_submission, then review_result (pass, or fail citing a rule).',
    };
  }
  return STATES[status];
}

interface TaskSummary {
  id: string;
  status: TaskStatus;
  reviewer: "boreal" | "requester";
}

const isSummary = (value: unknown): value is TaskSummary =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as TaskSummary).id === "string" &&
  (TASK_STATUSES as readonly string[]).includes((value as TaskSummary).status);

type Part = { text: string } | { data: unknown; mediaType: "application/json" } | { raw: string; mediaType: string; filename?: string };

function agentMessage(parts: Part[], taskId?: string) {
  return {
    messageId: randomUUID(),
    ...(taskId ? { contextId: taskId, taskId } : {}),
    role: "ROLE_AGENT" as const,
    parts,
  };
}

/** A boreal task as an A2A Task. `result` is what the action returned, in full, as a data part. */
function a2aTask(task: TaskSummary, result: unknown, at = new Date()) {
  const { state, next } = a2aState(task.status, task.reviewer);
  return {
    id: task.id,
    contextId: task.id,
    status: {
      state,
      message: agentMessage([{ text: next }, { data: result, mediaType: "application/json" }], task.id),
      timestamp: at.toISOString(),
    },
    artifacts: [],
    metadata: { borealStatus: task.status, reviewer: task.reviewer },
  };
}

/** Each MCP tool's own handler, by name, collected once from the MCP registration. */
let tools: Map<string, { schema: z.ZodType; tool: ToolRun }> | undefined;

function allTools() {
  if (tools) return tools;
  const found = new Map<string, { schema: z.ZodType; tool: ToolRun }>();
  const collector = {
    registerTool(name: string, config: { inputSchema: z.ZodType }, handler: { boreal?: ToolRun }) {
      if (handler.boreal) found.set(name, { schema: config.inputSchema, tool: handler.boreal });
    },
  };
  registerTools(collector as unknown as McpServer);
  tools = found;
  return found;
}

const EXAMPLE = {
  jsonrpc: "2.0",
  id: 1,
  method: "SendMessage",
  params: {
    message: {
      messageId: "8f0c…",
      role: "ROLE_USER",
      parts: [{ data: { action: "quote_fees", budget: 250, reviewer: "requester" }, mediaType: "application/json" }],
    },
  },
};

/** The short how-to returned with every refused free-text message. */
export function howTo() {
  return {
    accepts: "One structured data part per message: { \"action\": \"<tool>\", ...that tool's arguments }. Free text isn't read.",
    actions: [...allTools().keys()],
    example: EXAMPLE,
    tasks: "post_task returns an A2A Task whose id is boreal.work's task id; GetTask, CancelTask and ListTasks work on it.",
    auth: "Authorization: Bearer bk_… (your boreal.work agent key). No key yet: send { \"action\": \"request_link\", \"agentName\": \"…\" }, then poll check_link.",
    guide: `${SITE}/agents.md`,
  };
}

function fromDesk(error: unknown, notFound = A2A_ERRORS.taskNotFound): never {
  if (error instanceof A2AError) throw error;
  if (error instanceof DeskError) {
    const code =
      error.code === "invalid" ? A2A_ERRORS.invalidParams : error.code === "not_found" ? notFound : A2A_ERRORS.refused;
    throw new A2AError(code, `${error.code}: ${error.message}`, { error: error.code });
  }
  throw error;
}

async function runTool(name: string, args: unknown, caller: Caller | null, req: Request) {
  const entry = allTools().get(name);
  if (!entry) {
    throw new A2AError(A2A_ERRORS.invalidParams, `unknown action "${name}"`, howTo());
  }
  if (!entry.tool.keyless && !caller) {
    throw new A2AError(A2A_ERRORS.refused, "unauthorized: send your boreal.work agent key as Authorization: Bearer bk_…", {
      error: "unauthorized",
      ...howTo(),
    });
  }
  const parsed = entry.schema.safeParse(args ?? {});
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "arguments"}: ${i.message}`);
    throw new A2AError(A2A_ERRORS.invalidParams, `${name}: ${issues.join("; ")}`);
  }
  try {
    return { value: await entry.tool.run(caller, parsed.data as never, req), writes: entry.tool.writes };
  } catch (error) {
    fromDesk(error);
  }
}

/** A tool result as A2A parts: images (get_submission) become file parts. */
function partsOf(value: unknown): Part[] {
  if (!(value instanceof Raw)) return [{ data: value, mediaType: "application/json" }];
  return value.content.map((c): Part => {
    if (c.type === "image") return { raw: c.data, mediaType: c.mimeType };
    try {
      return { data: JSON.parse(c.text), mediaType: "application/json" };
    } catch {
      return { text: c.text };
    }
  });
}

/** The data part of an incoming message: v1.0 `{ data }`, or v0.3 `{ kind: "data", data }`. */
function readAction(params: unknown): { action: string; args: Record<string, unknown> } {
  const message = (params as { message?: { parts?: unknown; taskId?: unknown } } | null)?.message;
  if (!message || !Array.isArray(message.parts)) {
    throw new A2AError(A2A_ERRORS.invalidParams, "params.message.parts is required", howTo());
  }
  const data = message.parts
    .map((p: unknown) => (typeof p === "object" && p !== null && "data" in p ? (p as { data: unknown }).data : undefined))
    .filter((d): d is Record<string, unknown> => typeof d === "object" && d !== null && !Array.isArray(d));
  if (data.length === 0) {
    throw new A2AError(
      A2A_ERRORS.contentTypeNotSupported,
      "boreal.work is a deterministic service and doesn't read free text: send one structured data part, { \"action\": \"post_task\", … }",
      howTo(),
    );
  }
  if (data.length > 1) throw new A2AError(A2A_ERRORS.invalidParams, "send one data part per message");
  const { action, ...args } = data[0]!;
  if (typeof action !== "string") {
    throw new A2AError(A2A_ERRORS.invalidParams, "the data part needs an \"action\": the name of a boreal.work tool", howTo());
  }
  // A message sent within a task acts on that task unless the data names another.
  if (typeof message.taskId === "string" && args.taskId === undefined) args.taskId = message.taskId;
  return { action, args };
}

function taskIdOf(params: unknown): string {
  const id = (params as { id?: unknown } | null)?.id;
  if (typeof id !== "string" || !id) throw new A2AError(A2A_ERRORS.invalidParams, "params.id (the task id) is required");
  return id;
}

export interface A2AResult {
  result: unknown;
  /** The call changed something: run the monitor now. */
  writes: boolean;
}

/** Runs one A2A JSON-RPC method for `caller` (null without a valid key). */
export async function handleA2A(method: string, params: unknown, caller: Caller | null, req: Request): Promise<A2AResult> {
  const kind = METHODS[method];
  if (!kind) {
    throw new A2AError(A2A_ERRORS.methodNotFound, `boreal.work answers SendMessage, GetTask, CancelTask and ListTasks; not ${method}`);
  }

  if (kind === "send") {
    const { action, args } = readAction(params);
    const { value, writes } = (await runTool(action, args, caller, req))!;
    // An action on one task answers with that task; anything else with a message.
    if (isSummary(value)) return { result: { task: a2aTask(value, value) }, writes };
    const nested = (value as { task?: unknown } | null)?.task;
    if (isSummary(nested)) return { result: { task: a2aTask(nested, value) }, writes };
    if (typeof args.taskId === "string" && !(value instanceof Raw) && action !== "get_ledger" && action !== "get_trail") {
      // fund_task's payment requirement: the task waits on the requester.
      const { value: task } = (await runTool("get_task", { taskId: args.taskId }, caller, req))!;
      if (isSummary(task)) return { result: { task: a2aTask(task, value) }, writes };
    }
    const taskId = typeof args.taskId === "string" ? args.taskId : undefined;
    return { result: { message: agentMessage(partsOf(value), taskId) }, writes };
  }

  if (kind === "get" || kind === "cancel") {
    const id = taskIdOf(params);
    if (!caller) throw new A2AError(A2A_ERRORS.refused, "unauthorized: send your boreal.work agent key as Authorization: Bearer bk_…", { error: "unauthorized" });
    if (kind === "get") {
      const { value } = (await runTool("get_task", { taskId: id }, caller, req))!;
      return { result: a2aTask(value as TaskSummary, value), writes: false };
    }
    try {
      const { value } = (await runTool("cancel_task", { taskId: id }, caller, req))!;
      return { result: a2aTask(value as TaskSummary, value), writes: true };
    } catch (error) {
      if (error instanceof A2AError && error.data && (error.data as { error?: string }).error === "conflict") {
        throw new A2AError(A2A_ERRORS.taskNotCancelable, error.message, error.data);
      }
      throw error;
    }
  }

  // ListTasks: the requester's tasks, newest first. One page; filter by A2A state.
  const p = (params ?? {}) as { pageSize?: unknown; status?: unknown };
  const pageSize = typeof p.pageSize === "number" ? p.pageSize : 50;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new A2AError(A2A_ERRORS.invalidParams, "pageSize must be 1 to 100");
  }
  const { value } = (await runTool("list_tasks", { limit: 100 }, caller, req))!;
  const all = (value as TaskSummary[]).map((t) => a2aTask(t, t));
  const filtered = typeof p.status === "string" ? all.filter((t) => t.status.state === p.status) : all;
  const tasks = filtered.slice(0, pageSize);
  return { result: { tasks, totalSize: filtered.length, pageSize, nextPageToken: "" }, writes: false };
}
