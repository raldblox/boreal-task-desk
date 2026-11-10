"use server";

import { DeskError } from "@boreal/desk";
import { after } from "next/server";

import { getDesk, getRails } from "@/server/desk";
import { kickMonitor } from "@/server/monitor";
import { workerFromSession } from "@/server/session";

export type PaidResult = { funded: number; failed: { taskId: string; reason: string }[] } | { error: string };

/**
 * The owner's wallet sent one NEAR transaction with a USDC transfer to escrow for each task. Each
 * task is funded as its agent, through fund_task's own checks, against that one transaction: the
 * desk finds that task's own transfer by its memo, so no transfer counts for two tasks.
 */
export async function fundAgentTasksWithNear(taskIds: string[], payment: { txHash: string; signerId: string }): Promise<PaidResult> {
  const worker = await workerFromSession();
  if (!worker || worker.role !== "worker") return { error: "Your session has ended. Sign in again." };
  const near = getRails().near;
  if (!near) return { error: "USDC on NEAR isn't switched on here." };
  const desk = getDesk();
  let agentId: string;
  try {
    ({ agentId } = await desk.ownerTasksToPay(worker.workerId, taskIds));
  } catch (error) {
    if (error instanceof DeskError) return { error: error.message };
    throw error;
  }
  const failed: { taskId: string; reason: string }[] = [];
  let funded = 0;
  for (const taskId of taskIds) {
    try {
      await desk.fundTask({ role: "requester", agentId }, taskId, { confirm: () => near.confirmPayment(taskId, payment) }, { rail: "near" });
      funded++;
    } catch (error) {
      console.error("[pay with near] task not funded", taskId, error);
      failed.push({ taskId, reason: error instanceof Error ? error.message : "it couldn't be confirmed" });
    }
  }
  after(kickMonitor);
  return { funded, failed };
}
