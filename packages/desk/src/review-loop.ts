import type { Reviewer } from "@boreal/brain";

import type { Caller, Desk } from "./desk";
import { DeskError } from "./errors";

// One pass of the AI reviewer over the queue, run by the monitor loop. The reviewer only
// suggests; every outcome goes through the desk, and anything undecided goes to a human.

export const AI_REVIEWER: Caller = { role: "reviewer", reviewerRef: "boreal-ai-reviewer" };

export type ReadFile = (path: string) => Promise<{ bytes: Buffer; contentType: string } | null>;

export interface ReviewPass {
  screened: number;
  reviewed: number;
  toHumans: number;
  deferred: number;
  /** Disputes the AI voted on as a panel member (the person still decides). */
  panelVotes: number;
}

export async function runAiReview(
  desk: Desk,
  reviewer: Reviewer,
  options: {
    readFile: ReadFile;
    limit?: number;
    /** False leaves screening to people (/admin): AI_SCREENING=off. Reviews still run. */
    screen?: boolean;
  },
): Promise<ReviewPass> {
  const pass: ReviewPass = { screened: 0, reviewed: 0, toHumans: 0, deferred: 0, panelVotes: 0 };

  async function settleUndecided(taskId: string, result: { outcome: "needs_human" | "retry"; reason: string }) {
    if (result.outcome === "needs_human") {
      await desk.flagForHuman(AI_REVIEWER, taskId, result.reason);
      pass.toHumans++;
    } else {
      const task = await desk.deferAi(taskId, result.reason);
      if (task.needsHuman) pass.toHumans++;
      else pass.deferred++;
    }
  }

  /** A user action can win a race with the reviewer; the state machine refuses the stale move. */
  async function guarded(step: () => Promise<void>) {
    try {
      await step();
    } catch (error) {
      if (!(error instanceof DeskError && error.code === "conflict")) throw error;
    }
  }

  for (const task of options.screen === false ? [] : await desk.aiQueue("screen", options.limit)) {
    await guarded(async () => {
      const result = await reviewer.screen({
        description: task.description,
        acceptanceCriteria: task.acceptanceCriteria,
        requiredAttributes: task.requiredAttributes,
        resultFormat: task.resultFormat,
        budgetCents: task.budget,
      });
      if (result.outcome === "ok") {
        await desk.screenTask(AI_REVIEWER, task.id, { outcome: "ok", reasoning: result.reasoning, proof: result.proof });
        pass.screened++;
      } else if (result.outcome === "refused") {
        await desk.screenTask(AI_REVIEWER, task.id, result);
        pass.screened++;
      } else {
        await settleUndecided(task.id, result);
      }
    });
  }

  for (const task of await desk.aiQueue("review", options.limit)) {
    await guarded(async () => {
      const submission = await desk.getSubmission(AI_REVIEWER, task.id);
      if (!submission) return settleUndecided(task.id, { outcome: "needs_human", reason: "no submission found" });
      const files = await Promise.all(submission.fileUrls.map((path) => options.readFile(path)));
      if (files.some((f) => f === null)) {
        return settleUndecided(task.id, { outcome: "needs_human", reason: "a submitted file could not be read" });
      }
      const result = await reviewer.review({
        description: task.description,
        acceptanceCriteria: task.acceptanceCriteria,
        resultFormat: task.resultFormat,
        submission: { text: submission.text, files: files as { bytes: Buffer; contentType: string }[] },
      });
      if ("reason" in result) return settleUndecided(task.id, result);
      await desk.recordVerdict(AI_REVIEWER, task.id, result);
      pass.reviewed++;
    });
  }

  // Disputes: the AI votes as one of the panel's two members. A vote changes nothing; the person
  // on the panel decides in /admin with it in front of them. A vote that can't be had is recorded
  // as unsure, and a busy model is simply asked again on the next tick.
  for (const task of await desk.disputeAiQueue(options.limit)) {
    await guarded(async () => {
      const [submission, context] = await Promise.all([desk.getSubmission(AI_REVIEWER, task.id), desk.disputeContext(task.id)]);
      const unsure = (reason: string) => desk.recordPanelAiVote(AI_REVIEWER, task.id, { outcome: "unsure", reason });
      if (!submission || !context.verdict) return unsure(!submission ? "no submission found" : "no verdict found");
      const files = await Promise.all(submission.fileUrls.map((path) => options.readFile(path)));
      if (files.some((f) => f === null)) return unsure("a submitted file could not be read");
      const vote = await reviewer.dispute({
        description: task.description,
        acceptanceCriteria: task.acceptanceCriteria,
        resultFormat: task.resultFormat,
        submission: { text: submission.text, files: files as { bytes: Buffer; contentType: string }[] },
        verdict: context.verdict,
        statements: context.statements,
      });
      if (vote.outcome === "retry") return;
      await desk.recordPanelAiVote(AI_REVIEWER, task.id, vote.outcome === "needs_human" ? { outcome: "unsure", reason: vote.reason } : vote);
      pass.panelVotes++;
    });
  }

  return pass;
}
