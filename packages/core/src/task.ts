// The task state machine. Only code moves a task between states, never the AI:
// every transition names the actor allowed to make it (see "Decision rights" in the spec).
//
// A task is funded before it is screened: posting gives a quote (awaiting_funding), funding
// holds the money and sends it to screening (posted), and screening opens it to workers or
// refuses it, which releases the money in full. Nothing is screened, by a person or an AI,
// until its money is held.

export const TASK_STATUSES = [
  "posted",
  "refused",
  "awaiting_funding",
  "cancelled",
  "open",
  "expired",
  "claimed",
  "submitted",
  "passed",
  "failed",
  "disputed",
  "final_pass",
  "final_fail",
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export type Actor = "requester" | "worker" | "reviewer" | "panel" | "system";

export type TaskEvent =
  | { type: "screen_ok" }
  | { type: "screen_refused"; ruleIds: string[] }
  | { type: "fund" }
  | { type: "cancel" }
  | { type: "deadline_passed" }
  | { type: "claim"; workerId: string }
  | { type: "release" }
  | { type: "claim_expired" }
  | { type: "submit" }
  | { type: "verdict_pass"; ruleIds: string[] }
  | { type: "verdict_fail"; ruleIds: string[] }
  | { type: "accept_early" }
  | { type: "dispute"; by: "requester" | "worker"; reason: string }
  | { type: "window_closed" }
  | { type: "panel_pass"; ruleIds: string[] }
  | { type: "panel_fail"; ruleIds: string[] };

export type TaskEventType = TaskEvent["type"];

interface Transition {
  from: readonly TaskStatus[];
  to: TaskStatus;
  by: readonly Actor[];
}

const TRANSITIONS: Record<TaskEventType, Transition> = {
  fund: { from: ["awaiting_funding"], to: "posted", by: ["requester"] },
  screen_ok: { from: ["posted"], to: "open", by: ["reviewer"] },
  screen_refused: { from: ["posted"], to: "refused", by: ["reviewer", "system"] },
  cancel: { from: ["awaiting_funding", "posted", "open"], to: "cancelled", by: ["requester"] },
  deadline_passed: { from: ["posted", "open"], to: "expired", by: ["system"] },
  claim: { from: ["open"], to: "claimed", by: ["worker"] },
  release: { from: ["claimed"], to: "open", by: ["worker"] },
  claim_expired: { from: ["claimed"], to: "open", by: ["system"] },
  submit: { from: ["claimed"], to: "submitted", by: ["worker"] },
  verdict_pass: { from: ["submitted"], to: "passed", by: ["reviewer"] },
  verdict_fail: { from: ["submitted"], to: "failed", by: ["reviewer"] },
  accept_early: { from: ["passed"], to: "final_pass", by: ["requester"] },
  dispute: { from: ["passed", "failed"], to: "disputed", by: ["requester", "worker"] },
  window_closed: { from: ["passed", "failed"], to: "final_pass", by: ["system"] },
  panel_pass: { from: ["disputed"], to: "final_pass", by: ["panel"] },
  panel_fail: { from: ["disputed"], to: "final_fail", by: ["panel"] },
};

export interface TaskSnapshot {
  status: TaskStatus;
  disputeUsed: boolean;
}

export class TransitionError extends Error {
  constructor(
    readonly code: "illegal_transition" | "actor_not_allowed" | "dispute_used",
    message: string,
  ) {
    super(message);
    this.name = "TransitionError";
  }
}

/** Applies an event to a task and returns the next snapshot, or throws if the move is not allowed. */
export function transition(task: TaskSnapshot, event: TaskEvent, actor: Actor): TaskSnapshot {
  const rule = TRANSITIONS[event.type];

  if (!rule.from.includes(task.status)) {
    throw new TransitionError(
      "illegal_transition",
      `${event.type} is not allowed from ${task.status}`,
    );
  }
  if (!rule.by.includes(actor)) {
    throw new TransitionError("actor_not_allowed", `${actor} cannot ${event.type}`);
  }
  if (event.type === "dispute") {
    if (task.disputeUsed) {
      throw new TransitionError("dispute_used", "this task's one dispute has already been used");
    }
    if (event.by !== actor) {
      throw new TransitionError("actor_not_allowed", `${actor} cannot dispute as ${event.by}`);
    }
    return { status: "disputed", disputeUsed: true };
  }

  // A verdict that stands when the objection window closes decides the outcome.
  if (event.type === "window_closed") {
    return { ...task, status: task.status === "passed" ? "final_pass" : "final_fail" };
  }

  return { ...task, status: rule.to };
}

const TERMINAL: readonly TaskStatus[] = ["refused", "cancelled", "expired", "final_pass", "final_fail"];

export function isTerminal(status: TaskStatus): boolean {
  return TERMINAL.includes(status);
}
