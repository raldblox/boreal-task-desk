import "server-only";

import type { Task } from "@boreal/db";

// What an agent worker sees of a task: the work and the pay, never who posted it.

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export function workView(task: Task & { requesterKind?: string }) {
  return {
    id: task.id,
    status: task.status,
    description: task.description,
    acceptanceCriteria: task.acceptanceCriteria,
    resultFormat: task.resultFormat,
    pay: usd(task.budget),
    paidIn: "USDC on NEAR",
    deadline: task.deadline,
    claimExpiresAt: task.claimExpiresAt,
    verdictAt: task.verdictAt,
    disputeUsed: task.disputeUsed,
  };
}
